import { describe, it, expect, beforeEach } from "vitest";
import { TaskRouter, RouterError, type LifecycleEvent } from "../src/router.js";
import type { Task, Plan, AgentRole, Skill } from "../src/types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

function makeTask(
  id: string,
  overrides: Partial<Omit<Task, "id">> = {}
): Task {
  return {
    id,
    description: `Task ${id}`,
    skills: ["code"],
    dependencies: [],
    status: "pending",
    requiresApproval: false,
    ...overrides,
  };
}

function makePlan(tasks: Task[]): Plan {
  return {
    id: "plan-1",
    status: "executing",
    tasks,
    taskRunMap: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeAgent(
  agentId: string,
  skills: Skill[],
  name = agentId
): AgentRole {
  return { agentId, name, skills, model: "gpt-4o" };
}

// ───────────────────────────────────────────────────────────────────────────────
// getReadyTasks
// ───────────────────────────────────────────────────────────────────────────────

describe("TaskRouter#getReadyTasks", () => {
  it("returns tasks whose dependencies are all done", () => {
    const tasks: Task[] = [
      makeTask("A", { status: "done" }),
      makeTask("B", { dependencies: ["A"], status: "pending" }),
    ];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    const ready = router.getReadyTasks(makePlan(tasks));
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("B");
  });

  it("returns empty when dependencies are not done", () => {
    const tasks: Task[] = [
      makeTask("A", { status: "running" }),
      makeTask("B", { dependencies: ["A"], status: "pending" }),
    ];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    expect(router.getReadyTasks(makePlan(tasks))).toEqual([]);
  });

  it("returns tasks with no dependencies that are pending", () => {
    const tasks: Task[] = [
      makeTask("A", { status: "pending" }),
      makeTask("B", { status: "done" }),
    ];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    const ready = router.getReadyTasks(makePlan(tasks));
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("A");
  });

  it("returns empty for empty plan", () => {
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    expect(router.getReadyTasks(makePlan([]))).toEqual([]);
  });

  it("does not return tasks with failed dependencies", () => {
    const tasks: Task[] = [
      makeTask("A", { status: "failed" }),
      makeTask("B", { dependencies: ["A"], status: "pending" }),
    ];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    expect(router.getReadyTasks(makePlan(tasks))).toEqual([]);
  });

  it("returns multiple ready tasks", () => {
    const tasks: Task[] = [
      makeTask("A", { status: "done" }),
      makeTask("B", { dependencies: ["A"], status: "pending" }),
      makeTask("C", { dependencies: ["A"], status: "pending" }),
      makeTask("D", { status: "pending" }),
    ];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    const ready = router.getReadyTasks(makePlan(tasks));
    expect(ready.map((t) => t.id).sort()).toEqual(["B", "C", "D"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// routeBySkill
// ───────────────────────────────────────────────────────────────────────────────

describe("TaskRouter#routeBySkill", () => {
  const pool: AgentRole[] = [
    makeAgent("researcher", ["search", "browser"]),
    makeAgent("coder", ["shell", "code", "file"]),
    makeAgent("browser", ["browser"]),
    makeAgent("reviewer", ["file", "code"]),
  ];

  it("exact match: returns agent with all required skills", () => {
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: pool });
    const task = makeTask("t1", { skills: ["search", "browser"] });
    const agent = router.routeBySkill(task);
    expect(agent.agentId).toBe("researcher");
  });

  it("partial match: returns agent with most overlapping skills", () => {
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: pool });
    // coder has [shell, code, file]; reviewer has [file, code]
    const task = makeTask("t2", { skills: ["code", "file"] });
    const agent = router.routeBySkill(task);
    // Both coder and reviewer have 2/2; exact match not found, first with max
    // score is coder (appears before reviewer in pool)
    expect(agent.agentId).toBe("coder");
  });

  it("fallback: returns first agent when no skills overlap", () => {
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: pool });
    const task = makeTask("t3", { skills: ["nonexistent"] });
    const agent = router.routeBySkill(task);
    expect(agent.agentId).toBe("researcher");
  });

  it("throws when agent pool is empty", () => {
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    const task = makeTask("t4");
    expect(() => router.routeBySkill(task)).toThrow(RouterError);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// checkConcurrency
// ───────────────────────────────────────────────────────────────────────────────

describe("TaskRouter#checkConcurrency", () => {
  it("allows when below limit", () => {
    const tasks: Task[] = [
      makeTask("A", { status: "running" }),
      makeTask("B", { status: "pending" }),
    ];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    const result = router.checkConcurrency(makePlan(tasks));
    expect(result.block).toBe(false);
  });

  it("blocks when at limit", () => {
    const tasks: Task[] = [
      makeTask("A", { status: "running" }),
      makeTask("B", { status: "running" }),
      makeTask("C", { status: "running" }),
    ];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    const result = router.checkConcurrency(makePlan(tasks));
    expect(result.block).toBe(true);
    expect(result.reason).toContain("Concurrency limit reached");
  });

  it("blocks when above limit", () => {
    const tasks: Task[] = [
      makeTask("A", { status: "running" }),
      makeTask("B", { status: "running" }),
      makeTask("C", { status: "running" }),
      makeTask("D", { status: "running" }),
    ];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    const result = router.checkConcurrency(makePlan(tasks));
    expect(result.block).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// spawnTask
// ───────────────────────────────────────────────────────────────────────────────

describe("TaskRouter#spawnTask", () => {
  const pool: AgentRole[] = [
    makeAgent("coder", ["code", "file"]),
    makeAgent("researcher", ["search"]),
  ];

  it("dispatches a ready task and marks it running", async () => {
    const tasks: Task[] = [
      makeTask("A", { status: "done" }),
      makeTask("B", { dependencies: ["A"], skills: ["code"], status: "pending" }),
    ];
    const plan = makePlan(tasks);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: pool });
    const agent = await router.spawnTask(plan, tasks[1]);
    expect(agent.agentId).toBe("coder");
    expect(tasks[1].status).toBe("running");
    expect(tasks[1].assignedAgent).toBe("coder");
    expect(tasks[1].startedAt).toBeTypeOf("number");
  });

  it("throws when task is not pending", async () => {
    const tasks: Task[] = [makeTask("A", { status: "running" })];
    const plan = makePlan(tasks);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: pool });
    await expect(router.spawnTask(plan, tasks[0])).rejects.toThrow(RouterError);
  });

  it("throws when dependencies are not done", async () => {
    const tasks: Task[] = [
      makeTask("A", { status: "running" }),
      makeTask("B", { dependencies: ["A"], status: "pending" }),
    ];
    const plan = makePlan(tasks);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: pool });
    await expect(router.spawnTask(plan, tasks[1])).rejects.toThrow(RouterError);
  });

  it("throws when dependency is missing from plan", async () => {
    const tasks: Task[] = [
      makeTask("B", { dependencies: ["missing"], status: "pending" }),
    ];
    const plan = makePlan(tasks);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: pool });
    await expect(router.spawnTask(plan, tasks[0])).rejects.toThrow(RouterError);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// trackLifecycle
// ───────────────────────────────────────────────────────────────────────────────

describe("TaskRouter#trackLifecycle", () => {
  let plan: Plan;
  let router: TaskRouter;

  beforeEach(() => {
    plan = makePlan([
      makeTask("A", { status: "pending" }),
      makeTask("B", { status: "running" }),
    ]);
    router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
  });

  it("spawned: updates taskRunMap and marks task running", async () => {
    await router.trackLifecycle({ type: "spawned", runId: "run-1", taskId: "A" }, plan);
    expect(plan.taskRunMap["run-1"]).toBe("A");
    expect(plan.tasks.find((t) => t.id === "A")?.status).toBe("running");
  });

  it("spawned: does not overwrite already-running task", async () => {
    await router.trackLifecycle({ type: "spawned", runId: "run-1", taskId: "B" }, plan);
    expect(plan.tasks.find((t) => t.id === "B")?.status).toBe("running");
  });

  it("ended: marks running task as done and stores result", async () => {
    plan.taskRunMap["run-2"] = "B";
    await router.trackLifecycle(
      { type: "ended", runId: "run-2", taskId: "B", result: "success" },
      plan
    );
    const taskB = plan.tasks.find((t) => t.id === "B")!;
    expect(taskB.status).toBe("done");
    expect(taskB.result).toBe("success");
    expect(taskB.completedAt).toBeTypeOf("number");
  });

  it("ended: stores result even for invalid transition", async () => {
    plan.taskRunMap["run-3"] = "A";
    // A is pending, not running — invalid transition
    await router.trackLifecycle(
      { type: "ended", runId: "run-3", taskId: "A", result: "partial" },
      plan
    );
    const taskA = plan.tasks.find((t) => t.id === "A")!;
    expect(taskA.status).toBe("pending"); // unchanged
    expect(taskA.result).toBe("partial"); // result still stored
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// hasMoreWork
// ───────────────────────────────────────────────────────────────────────────────

describe("TaskRouter#hasMoreWork", () => {
  it("returns true when tasks are pending", () => {
    const plan = makePlan([makeTask("A", { status: "pending" })]);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    expect(router.hasMoreWork(plan)).toBe(true);
  });

  it("returns true when tasks are running", () => {
    const plan = makePlan([makeTask("A", { status: "running" })]);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    expect(router.hasMoreWork(plan)).toBe(true);
  });

  it("returns false when all tasks are done", () => {
    const plan = makePlan([makeTask("A", { status: "done" })]);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    expect(router.hasMoreWork(plan)).toBe(false);
  });

  it("returns false for empty plan", () => {
    const plan = makePlan([]);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    expect(router.hasMoreWork(plan)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// getProgress
// ───────────────────────────────────────────────────────────────────────────────

describe("TaskRouter#getProgress", () => {
  it("returns correct counts for mixed statuses", () => {
    const plan = makePlan([
      makeTask("A", { status: "done" }),
      makeTask("B", { status: "failed" }),
      makeTask("C", { status: "pending" }),
      makeTask("D", { status: "running" }),
      makeTask("E", { status: "skipped" }),
    ]);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    const progress = router.getProgress(plan);
    expect(progress).toEqual({
      total: 5,
      done: 1,
      failed: 1,
      pending: 1,
      running: 1,
    });
  });

  it("returns zeroes for empty plan", () => {
    const plan = makePlan([]);
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    const progress = router.getProgress(plan);
    expect(progress).toEqual({
      total: 0,
      done: 0,
      failed: 0,
      pending: 0,
      running: 0,
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Invalid status transitions
// ───────────────────────────────────────────────────────────────────────────────

describe("Invalid status transitions", () => {
  it("spawnTask rejects done task", async () => {
    const tasks: Task[] = [makeTask("A", { status: "done" })];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    await expect(router.spawnTask(makePlan(tasks), tasks[0])).rejects.toThrow(
      RouterError
    );
  });

  it("spawnTask rejects failed task", async () => {
    const tasks: Task[] = [makeTask("A", { status: "failed" })];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    await expect(router.spawnTask(makePlan(tasks), tasks[0])).rejects.toThrow(
      RouterError
    );
  });

  it("spawnTask rejects running task", async () => {
    const tasks: Task[] = [makeTask("A", { status: "running" })];
    const router = new TaskRouter({ maxConcurrency: 3, agentPool: [] });
    await expect(router.spawnTask(makePlan(tasks), tasks[0])).rejects.toThrow(
      RouterError
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// RouterError
// ───────────────────────────────────────────────────────────────────────────────

describe("RouterError", () => {
  it("is an instance of Error", () => {
    const err = new RouterError("boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RouterError");
    expect(err.message).toBe("boom");
  });
});
