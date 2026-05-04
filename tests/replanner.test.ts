import { describe, it, expect, vi } from "vitest";
import { Replanner } from "../src/replanner.js";
import type { Plan, Task, RepairDecision } from "../src/types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

/** Create a mock generate function that returns a fixed JSON response. */
function mockGenerate(response: string): (prompt: string) => Promise<string> {
  return vi.fn(async (_prompt: string) => response);
}

/** Create a mock generate function that rejects. */
function mockGenerateError(): (prompt: string) => Promise<string> {
  return vi.fn(async (_prompt: string) => {
    throw new Error("LLM error");
  });
}

/** Create a basic Plan for tests. */
function createPlan(tasks: Task[]): Plan {
  const now = Date.now();
  return {
    id: `plan_${now}`,
    status: "executing",
    tasks,
    taskRunMap: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Create a basic Task. */
function createTask(id: string, status: Task["status"], overrides: Partial<Task> = {}): Task {
  return {
    id,
    description: `Task ${id}`,
    skills: ["code"],
    dependencies: [],
    status,
    requiresApproval: false,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Health Check
// ───────────────────────────────────────────────────────────────────────────────

describe("Replanner.check", () => {
  it("returns no reroute when all tasks are done", () => {
    const replanner = new Replanner({ model: "test-model" });
    const plan = createPlan([
      createTask("task_001", "done"),
      createTask("task_002", "done"),
    ]);

    const result = replanner.check(plan);
    expect(result.needsReroute).toBe(false);
    expect(result.failedTasks).toEqual([]);
  });

  it("returns no reroute when all tasks are skipped", () => {
    const replanner = new Replanner({ model: "test-model" });
    const plan = createPlan([
      createTask("task_001", "skipped"),
      createTask("task_002", "skipped"),
    ]);

    const result = replanner.check(plan);
    expect(result.needsReroute).toBe(false);
    expect(result.failedTasks).toEqual([]);
  });

  it("returns no reroute when tasks are running with no failures", () => {
    const replanner = new Replanner({ model: "test-model" });
    const plan = createPlan([
      createTask("task_001", "done"),
      createTask("task_002", "running"),
      createTask("task_003", "pending"),
    ]);

    const result = replanner.check(plan);
    expect(result.needsReroute).toBe(false);
    expect(result.failedTasks).toEqual([]);
  });

  it("returns reroute with failed tasks when failures exist", () => {
    const replanner = new Replanner({ model: "test-model" });
    const failedTask = createTask("task_002", "failed");
    const plan = createPlan([
      createTask("task_001", "done"),
      failedTask,
      createTask("task_003", "running"),
    ]);

    const result = replanner.check(plan);
    expect(result.needsReroute).toBe(true);
    expect(result.failedTasks).toHaveLength(1);
    expect(result.failedTasks[0].id).toBe("task_002");
    expect(result.reason).toBe("1 task failed");
  });

  it("returns correct reason for multiple failures", () => {
    const replanner = new Replanner({ model: "test-model" });
    const plan = createPlan([
      createTask("task_001", "failed"),
      createTask("task_002", "failed"),
    ]);

    const result = replanner.check(plan);
    expect(result.needsReroute).toBe(true);
    expect(result.failedTasks).toHaveLength(2);
    expect(result.reason).toBe("2 tasks failed");
  });

  it("recovers from errors with safe fallback", () => {
    const replanner = new Replanner({ model: "test-model" });
    // Create a plan with a getter that throws when tasks are accessed
    const badPlan = {
      get tasks() {
        throw new Error("boom");
      },
    } as unknown as Plan;

    const result = replanner.check(badPlan);
    expect(result.needsReroute).toBe(false);
    expect(result.failedTasks).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Repair Strategy Selection
// ───────────────────────────────────────────────────────────────────────────────

describe("Replanner.replan", () => {
  it("parses retry strategy from LLM response", async () => {
    const generate = mockGenerate(JSON.stringify({ strategy: "retry", reason: "Transient error" }));
    const replanner = new Replanner({ model: "test-model", generate });
    const plan = createPlan([createTask("task_001", "failed")]);

    const result = await replanner.replan(plan, plan.tasks);
    expect(result.strategy).toBe("retry");
    expect(result.reason).toBe("Transient error");
  });

  it("parses decompose strategy with newTasks", async () => {
    const generate = mockGenerate(
      JSON.stringify({
        strategy: "decompose",
        reason: "Break into smaller tasks",
        newTasks: [
          { id: "task_002", description: "Subtask A", skills: ["code"], dependencies: [], requiresApproval: false },
          { id: "task_003", description: "Subtask B", skills: ["search"], dependencies: ["task_002"], requiresApproval: false },
        ],
      })
    );
    const replanner = new Replanner({ model: "test-model", generate });
    const plan = createPlan([createTask("task_001", "failed")]);

    const result = await replanner.replan(plan, plan.tasks);
    expect(result.strategy).toBe("decompose");
    expect(result.newTasks).toHaveLength(2);
    expect(result.newTasks![0].id).toBe("task_002");
  });

  it("parses skip strategy", async () => {
    const generate = mockGenerate(JSON.stringify({ strategy: "skip", reason: "Optional task" }));
    const replanner = new Replanner({ model: "test-model", generate });
    const plan = createPlan([createTask("task_001", "failed")]);

    const result = await replanner.replan(plan, plan.tasks);
    expect(result.strategy).toBe("skip");
    expect(result.reason).toBe("Optional task");
  });

  it("parses escalate strategy", async () => {
    const generate = mockGenerate(JSON.stringify({ strategy: "escalate", reason: "Permission issue" }));
    const replanner = new Replanner({ model: "test-model", generate });
    const plan = createPlan([createTask("task_001", "failed")]);

    const result = await replanner.replan(plan, plan.tasks);
    expect(result.strategy).toBe("escalate");
    expect(result.reason).toBe("Permission issue");
  });

  it("falls back to retry on LLM failure", async () => {
    const replanner = new Replanner({ model: "test-model", generate: mockGenerateError() });
    const plan = createPlan([createTask("task_001", "failed")]);

    const result = await replanner.replan(plan, plan.tasks);
    expect(result.strategy).toBe("retry");
    expect(result.reason).toBe("LLM failure fallback");
  });

  it("falls back to retry on invalid JSON", async () => {
    const generate = mockGenerate("not valid json");
    const replanner = new Replanner({ model: "test-model", generate });
    const plan = createPlan([createTask("task_001", "failed")]);

    const result = await replanner.replan(plan, plan.tasks);
    expect(result.strategy).toBe("retry");
    expect(result.reason).toBe("LLM failure fallback");
  });

  it("falls back to retry on unrecognized strategy", async () => {
    const generate = mockGenerate(JSON.stringify({ strategy: "unknown", reason: "Bad strategy" }));
    const replanner = new Replanner({ model: "test-model", generate });
    const plan = createPlan([createTask("task_001", "failed")]);

    const result = await replanner.replan(plan, plan.tasks);
    expect(result.strategy).toBe("retry");
    expect(result.reason).toBe("LLM failure fallback");
  });

  it("falls back to retry on missing reason", async () => {
    const generate = mockGenerate(JSON.stringify({ strategy: "retry" }));
    const replanner = new Replanner({ model: "test-model", generate });
    const plan = createPlan([createTask("task_001", "failed")]);

    const result = await replanner.replan(plan, plan.tasks);
    expect(result.strategy).toBe("retry");
    expect(result.reason).toBe("LLM failure fallback");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Repair Strategy Application
// ───────────────────────────────────────────────────────────────────────────────

describe("Replanner.applyRepair", () => {
  it("retry resets failed tasks to pending and increments _retryCount", () => {
    const replanner = new Replanner({ model: "test-model" });
    const plan = createPlan([
      createTask("task_001", "failed", { _retryCount: 1 }),
      createTask("task_002", "failed"),
    ]);
    const failedTasks = plan.tasks.filter((t) => t.status === "failed");

    const decision: RepairDecision = { strategy: "retry", reason: "Retry" };
    replanner.applyRepair(plan, failedTasks, decision);

    const task1 = plan.tasks.find((t) => t.id === "task_001")!;
    const task2 = plan.tasks.find((t) => t.id === "task_002")!;

    expect(task1.status).toBe("pending");
    expect(task1._retryCount).toBe(2);
    expect(task1.result).toBeUndefined();

    expect(task2.status).toBe("pending");
    expect(task2._retryCount).toBe(1);
    expect(task2.result).toBeUndefined();

    expect(plan.updatedAt).toBeGreaterThanOrEqual(plan.createdAt);
  });

  it("decompose removes failed tasks and appends newTasks", () => {
    const replanner = new Replanner({ model: "test-model" });
    const plan = createPlan([
      createTask("task_001", "done"),
      createTask("task_002", "failed"),
    ]);
    const failedTasks = plan.tasks.filter((t) => t.status === "failed");

    const newTasks: Task[] = [
      createTask("task_003", "pending"),
      createTask("task_004", "pending"),
    ];

    const decision: RepairDecision = { strategy: "decompose", reason: "Decompose", newTasks };
    replanner.applyRepair(plan, failedTasks, decision);

    expect(plan.tasks.find((t) => t.id === "task_002")).toBeUndefined();
    expect(plan.tasks).toHaveLength(3);
    const newTaskIds = plan.tasks.slice(1).map((t) => t.id);
    expect(newTaskIds).toContain("task_003");
    expect(newTaskIds).toContain("task_004");
    const task3 = plan.tasks.find((t) => t.id === "task_003")!;
    expect(task3.status).toBe("pending");
    const task4 = plan.tasks.find((t) => t.id === "task_004")!;
    expect(task4.status).toBe("pending");
    expect(plan.updatedAt).toBeGreaterThanOrEqual(plan.createdAt);
  });

  it("decompose removes failed tasks even without newTasks", () => {
    const replanner = new Replanner({ model: "test-model" });
    const plan = createPlan([
      createTask("task_001", "done"),
      createTask("task_002", "failed"),
    ]);
    const failedTasks = plan.tasks.filter((t) => t.status === "failed");

    const decision: RepairDecision = { strategy: "decompose", reason: "Decompose" };
    replanner.applyRepair(plan, failedTasks, decision);

    expect(plan.tasks.find((t) => t.id === "task_002")).toBeUndefined();
    expect(plan.tasks).toHaveLength(1);
  });

  it("skip marks failed tasks as skipped with correct result", () => {
    const replanner = new Replanner({ model: "test-model" });
    const plan = createPlan([
      createTask("task_001", "failed"),
    ]);
    const failedTasks = plan.tasks.filter((t) => t.status === "failed");

    const decision: RepairDecision = { strategy: "skip", reason: "Skip" };
    replanner.applyRepair(plan, failedTasks, decision);

    const task = plan.tasks.find((t) => t.id === "task_001")!;
    expect(task.status).toBe("skipped");
    expect(task.result).toBe("[skipped by replanner]");
    expect(plan.updatedAt).toBeGreaterThanOrEqual(plan.createdAt);
  });

  it("escalate resets failed tasks to pending and sets requiresApproval", () => {
    const replanner = new Replanner({ model: "test-model" });
    const plan = createPlan([
      createTask("task_001", "failed", { requiresApproval: false }),
    ]);
    const failedTasks = plan.tasks.filter((t) => t.status === "failed");

    const decision: RepairDecision = { strategy: "escalate", reason: "Escalate" };
    replanner.applyRepair(plan, failedTasks, decision);

    const task = plan.tasks.find((t) => t.id === "task_001")!;
    expect(task.status).toBe("pending");
    expect(task.requiresApproval).toBe(true);
    expect(task.result).toBeUndefined();
    expect(plan.updatedAt).toBeGreaterThanOrEqual(plan.createdAt);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Hook Integration
// ───────────────────────────────────────────────────────────────────────────────

describe("before_agent_finalize hook", () => {
  it("returns finalize when plan is healthy", async () => {
    const { handleBeforeAgentFinalize, setReplanner, setPlanner } = await import("../src/index.js");

    const planner = {
      readPlanState: vi.fn(() =>
        createPlan([
          createTask("task_001", "done"),
          createTask("task_002", "done"),
        ])
      ),
      writePlanState: vi.fn(),
    };

    const replanner = new Replanner({
      model: "test-model",
      generate: mockGenerate(JSON.stringify({ strategy: "retry", reason: "Test" })),
    });

    setPlanner(planner as unknown as import("../src/planner.js").Planner);
    setReplanner(replanner);

    const session = { data: {} };
    const ctx = {
      session,
      plan: createPlan([]),
      taskStatuses: {},
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await handleBeforeAgentFinalize(ctx);
    expect(ctx.action).toBe("finalize");
    expect(planner.writePlanState).toHaveBeenCalled();
  });

  it("returns revise when plan has failures", async () => {
    const { handleBeforeAgentFinalize, setReplanner, setPlanner } = await import("../src/index.js");

    const plan = createPlan([
      createTask("task_001", "done"),
      createTask("task_002", "failed"),
    ]);

    const planner = {
      readPlanState: vi.fn(() => plan),
      writePlanState: vi.fn(),
    };

    const replanner = new Replanner({
      model: "test-model",
      generate: mockGenerate(JSON.stringify({ strategy: "retry", reason: "Retry failed task" })),
    });

    setPlanner(planner as unknown as import("../src/planner.js").Planner);
    setReplanner(replanner);

    const session = { data: {} };
    const ctx = {
      session,
      plan,
      taskStatuses: {},
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await handleBeforeAgentFinalize(ctx);
    expect(ctx.action).toBe("revise");
    expect(ctx.reason).toBe("Retry failed task");
    expect(planner.writePlanState).toHaveBeenCalled();
  });

  it("returns finalize fallback when replanner or planner is null", async () => {
    const { handleBeforeAgentFinalize, setReplanner, setPlanner } = await import("../src/index.js");

    setReplanner(null);
    setPlanner(null);

    const ctx = {
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await handleBeforeAgentFinalize(ctx);
    expect(ctx.action).toBeUndefined();
  });

  it("returns finalize fallback on error", async () => {
    const { handleBeforeAgentFinalize, setReplanner, setPlanner } = await import("../src/index.js");

    const planner = {
      readPlanState: vi.fn(() => {
        throw new Error("read error");
      }),
    };

    const replanner = new Replanner({ model: "test-model" });

    setPlanner(planner as unknown as import("../src/planner.js").Planner);
    setReplanner(replanner);

    const session = { data: {} };
    const ctx = {
      session,
      plan: createPlan([]),
      taskStatuses: {},
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await handleBeforeAgentFinalize(ctx);
    expect(ctx.action).toBeUndefined();
  });
});
