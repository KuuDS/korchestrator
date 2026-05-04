import { describe, it, expect, vi } from "vitest";
import { Planner } from "../src/planner.js";
import type { ClassificationRule, Plan, Task } from "../src/types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

/** Create a mock generate function that returns a fixed response. */
function mockGenerate(response: string): (prompt: string) => Promise<string> {
  return vi.fn(async (_prompt: string) => response);
}

/** Create a mock generate function that rejects. */
function mockGenerateError(): (prompt: string) => Promise<string> {
  return vi.fn(async (_prompt: string) => {
    throw new Error("LLM error");
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Complexity Classification
// ───────────────────────────────────────────────────────────────────────────────

describe("Planner.classify", () => {
  it("returns 'simple' when an L1 rule matches a simple pattern", async () => {
    const rules: ClassificationRule[] = [
      { pattern: "^(hello|hi|hey)", result: "simple" },
    ];
    const planner = new Planner(
      { model: "test-model", classificationRules: rules },
      mockGenerate("complex")
    );

    const result = await planner.classify("hello world");
    expect(result).toBe("simple");
  });

  it("returns 'complex' when an L1 rule matches a complex pattern", async () => {
    const rules: ClassificationRule[] = [
      { pattern: "^(build|implement|create)", result: "complex" },
    ];
    const planner = new Planner(
      { model: "test-model", classificationRules: rules },
      mockGenerate("simple")
    );

    const result = await planner.classify("build a web server");
    expect(result).toBe("complex");
  });

  it("falls back to LLM (L2) when no L1 rule matches", async () => {
    const generate = mockGenerate("complex");
    const planner = new Planner(
      { model: "test-model", classificationRules: [] },
      generate
    );

    const result = await planner.classify("do something complicated");
    expect(result).toBe("complex");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("falls back to 'simple' (L3) when LLM throws", async () => {
    const planner = new Planner(
      { model: "test-model", classificationRules: [] },
      mockGenerateError()
    );

    const result = await planner.classify("anything");
    expect(result).toBe("simple");
  });

  it("falls back to 'simple' (L3) when LLM returns unexpected value", async () => {
    const planner = new Planner(
      { model: "test-model", classificationRules: [] },
      mockGenerate("maybe")
    );

    const result = await planner.classify("anything");
    expect(result).toBe("simple");
  });

  it("always returns 'complex' when skipClassification is true", async () => {
    const generate = mockGenerate("simple");
    const planner = new Planner(
      {
        model: "test-model",
        classificationRules: [{ pattern: "^hello", result: "simple" }],
        skipClassification: true,
      },
      generate
    );

    const result = await planner.classify("hello world");
    expect(result).toBe("complex");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("Planner.matchRule", () => {
  it("returns null when no rules match", () => {
    const planner = new Planner(
      { model: "test-model", classificationRules: [] },
      mockGenerate("simple")
    );

    expect(planner.matchRule("xyz")).toBeNull();
  });

  it("ignores invalid regex patterns and continues", () => {
    const rules: ClassificationRule[] = [
      { pattern: "[invalid(", result: "simple" }, // invalid regex
      { pattern: "^test", result: "complex" },
    ];
    const planner = new Planner(
      { model: "test-model", classificationRules: rules },
      mockGenerate("simple")
    );

    expect(planner.matchRule("test case")).toBe("complex");
  });

  it("matches case-insensitively", () => {
    const rules: ClassificationRule[] = [
      { pattern: "^hello", result: "simple" },
    ];
    const planner = new Planner(
      { model: "test-model", classificationRules: rules },
      mockGenerate("simple")
    );

    expect(planner.matchRule("HELLO world")).toBe("simple");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Task Decomposition
// ───────────────────────────────────────────────────────────────────────────────

describe("Planner.createPlan", () => {
  it("creates a valid plan from LLM JSON response", async () => {
    const json = JSON.stringify({
      tasks: [
        {
          id: "task_001",
          description: "Search for docs",
          skills: ["search"],
          dependencies: [],
        },
        {
          id: "task_002",
          description: "Write code",
          skills: ["code"],
          dependencies: ["task_001"],
        },
      ],
    });

    const planner = new Planner(
      { model: "test-model" },
      mockGenerate(json)
    );

    const plan = await planner.createPlan("build something");
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0].id).toBe("task_001");
    expect(plan.tasks[1].id).toBe("task_002");
    expect(plan.tasks[1].dependencies).toEqual(["task_001"]);
    expect(plan.status).toBe("planning");
  });

  it("returns single-task fallback on invalid JSON", async () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("not valid json")
    );

    const plan = await planner.createPlan("do something");
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].description).toBe("do something");
    expect(plan.tasks[0].id).toBe("task_001");
  });

  it("returns single-task fallback on cyclic dependencies", async () => {
    const json = JSON.stringify({
      tasks: [
        { id: "task_001", description: "A", skills: ["code"], dependencies: ["task_002"] },
        { id: "task_002", description: "B", skills: ["code"], dependencies: ["task_001"] },
      ],
    });

    const planner = new Planner(
      { model: "test-model" },
      mockGenerate(json)
    );

    const plan = await planner.createPlan("cyclic task");
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].description).toBe("cyclic task");
  });

  it("auto-marks shell tasks as requiresApproval", async () => {
    const json = JSON.stringify({
      tasks: [
        { id: "task_001", description: "Run script", skills: ["shell"], dependencies: [] },
        { id: "task_002", description: "Search", skills: ["search"], dependencies: [] },
      ],
    });

    const planner = new Planner(
      { model: "test-model" },
      mockGenerate(json)
    );

    const plan = await planner.createPlan("run commands");
    const shellTask = plan.tasks.find((t) => t.skills.includes("shell"));
    const searchTask = plan.tasks.find((t) => t.skills.includes("search"));

    expect(shellTask?.requiresApproval).toBe(true);
    expect(searchTask?.requiresApproval).toBe(false);
  });

  it("enforces maxTasks limit", async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `task_${String(i + 1).padStart(3, "0")}`,
      description: `Task ${i + 1}`,
      skills: ["code"],
      dependencies: [],
    }));

    const json = JSON.stringify({ tasks });

    const planner = new Planner(
      { model: "test-model", maxTasks: 5 },
      mockGenerate(json)
    );

    const plan = await planner.createPlan("many tasks");
    expect(plan.tasks.length).toBeLessThanOrEqual(5);
  });

  it("returns fallback on LLM error", async () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerateError()
    );

    const plan = await planner.createPlan("failing request");
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].description).toBe("failing request");
  });

  it("returns fallback on Zod validation failure (missing description)", async () => {
    const json = JSON.stringify({
      tasks: [{ id: "task_001", skills: ["code"], dependencies: [] }],
    });

    const planner = new Planner(
      { model: "test-model" },
      mockGenerate(json)
    );

    const plan = await planner.createPlan("invalid task");
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].description).toBe("invalid task");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Plan Serialization
// ───────────────────────────────────────────────────────────────────────────────

describe("Planner.toMarkdown", () => {
  it("formats a plan correctly as Markdown", () => {
    const plan: Plan = {
      id: "plan_123",
      status: "executing",
      tasks: [
        {
          id: "task_001",
          description: "Search docs",
          skills: ["search"],
          dependencies: [],
          status: "done",
          requiresApproval: false,
          result: "Found 5 docs",
        } as Task,
        {
          id: "task_002",
          description: "Write code",
          skills: ["code", "shell"],
          dependencies: ["task_001"],
          status: "pending",
          requiresApproval: true,
          assignedAgent: "coder",
        } as Task,
      ],
      taskRunMap: {},
      createdAt: 0,
      updatedAt: 0,
    };

    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    const md = planner.toMarkdown(plan);
    expect(md).toContain("# Plan: plan_123");
    expect(md).toContain("**Status:** executing");
    expect(md).toContain("## task_001");
    expect(md).toContain("**Description:** Search docs");
    expect(md).toContain("**Skills:** search");
    expect(md).toContain("**Status:** done");
    expect(md).toContain("**Result:** Found 5 docs");
    expect(md).toContain("## task_002");
    expect(md).toContain("**Skills:** code, shell");
    expect(md).toContain("**Requires Approval:** Yes");
    expect(md).toContain("**Dependencies:** task_001");
    expect(md).toContain("**Assigned Agent:** coder");
  });

  it("handles empty plan gracefully", () => {
    const plan: Plan = {
      id: "plan_empty",
      status: "planning",
      tasks: [],
      taskRunMap: {},
      createdAt: 0,
      updatedAt: 0,
    };

    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    const md = planner.toMarkdown(plan);
    expect(md).toContain("# Plan: plan_empty");
    expect(md).toContain("**Tasks:** 0");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// State Persistence
// ───────────────────────────────────────────────────────────────────────────────

describe("Planner state persistence", () => {
  it("readPlanState returns null for null session", () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    expect(planner.readPlanState(null)).toBeNull();
    expect(planner.readPlanState(undefined)).toBeNull();
  });

  it("readPlanState returns null when plan_state is missing", () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    const session = { otherKey: "value" };
    expect(planner.readPlanState(session)).toBeNull();
  });

  it("readPlanState returns null when plan_state is invalid", () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    const session = { plan_state: { invalid: true } };
    expect(planner.readPlanState(session)).toBeNull();
  });

  it("readPlanState returns a valid Plan", () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    const plan: Plan = {
      id: "plan_1",
      status: "planning",
      tasks: [],
      taskRunMap: {},
      createdAt: 0,
      updatedAt: 0,
    };

    const session = { plan_state: plan };
    const result = planner.readPlanState(session);
    expect(result).toEqual(plan);
  });

  it("writePlanState writes to session.data when available", () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    const plan: Plan = {
      id: "plan_1",
      status: "planning",
      tasks: [],
      taskRunMap: {},
      createdAt: 0,
      updatedAt: 0,
    };

    const session: Record<string, unknown> = { data: {} };
    planner.writePlanState(session, plan);
    expect((session.data as Record<string, unknown>).plan_state).toEqual(plan);
  });

  it("writePlanState writes to session root when data is absent", () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    const plan: Plan = {
      id: "plan_1",
      status: "planning",
      tasks: [],
      taskRunMap: {},
      createdAt: 0,
      updatedAt: 0,
    };

    const session: Record<string, unknown> = {};
    planner.writePlanState(session, plan);
    expect(session.plan_state).toEqual(plan);
  });

  it("writePlanState silently fails for null session", () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    const plan: Plan = {
      id: "plan_1",
      status: "planning",
      tasks: [],
      taskRunMap: {},
      createdAt: 0,
      updatedAt: 0,
    };

    expect(() => planner.writePlanState(null, plan)).not.toThrow();
    expect(() => planner.writePlanState(undefined, plan)).not.toThrow();
  });

  it("registerSessionExtension does not throw", () => {
    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    expect(() => planner.registerSessionExtension()).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Hook Integration
// ───────────────────────────────────────────────────────────────────────────────

describe("Hook integration", () => {
  it("before_agent_reply creates a plan for complex requests", async () => {
    const { handleBeforeAgentReply } = await import("../src/index.js");

    const planner = new Planner(
      { model: "test-model", classificationRules: [] },
      mockGenerate("complex")
    );

    const { setPlanner } = await import("../src/index.js");
    setPlanner(planner);

    const session = { data: {} };
    const ctx = {
      userRequest: "build a web server",
      session,
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await handleBeforeAgentReply(ctx);

    const stored = planner.readPlanState(session);
    expect(stored).not.toBeNull();
    expect(stored!.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it("before_agent_reply does nothing for simple requests", async () => {
    const { handleBeforeAgentReply, setPlanner } = await import("../src/index.js");

    const planner = new Planner(
      { model: "test-model", classificationRules: [{ pattern: "^hello", result: "simple" }] },
      mockGenerate("complex")
    );

    setPlanner(planner);

    const session = { data: {} };
    const ctx = {
      userRequest: "hello world",
      session,
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await handleBeforeAgentReply(ctx);

    const stored = planner.readPlanState(session);
    expect(stored).toBeNull();
  });

  it("before_prompt_build injects plan markdown when plan exists", async () => {
    const { handleBeforePromptBuild, setPlanner } = await import("../src/index.js");

    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    setPlanner(planner);

    const plan: Plan = {
      id: "plan_1",
      status: "executing",
      tasks: [
        {
          id: "task_001",
          description: "Do work",
          skills: ["code"],
          dependencies: [],
          status: "pending",
          requiresApproval: false,
        },
      ],
      taskRunMap: {},
      createdAt: 0,
      updatedAt: 0,
    };

    const session = { data: {} };
    planner.writePlanState(session, plan);

    const ctx = {
      session,
      plan,
      fragments: [],
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await handleBeforePromptBuild(ctx);

    expect(typeof ctx.prependContext).toBe("string");
    expect((ctx.prependContext as string).includes("# Plan: plan_1")).toBe(true);
  });

  it("before_prompt_build does nothing when no plan in session", async () => {
    const { handleBeforePromptBuild, setPlanner } = await import("../src/index.js");

    const planner = new Planner(
      { model: "test-model" },
      mockGenerate("")
    );

    setPlanner(planner);

    const session = { data: {} };
    const ctx = {
      session,
      plan: undefined,
      fragments: [],
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await handleBeforePromptBuild(ctx);

    expect(ctx.prependContext).toBeUndefined();
  });

  it("before_agent_reply handles missing planner gracefully", async () => {
    const { handleBeforeAgentReply, setPlanner } = await import("../src/index.js");

    setPlanner(null);

    const ctx = {
      userRequest: "test",
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await expect(handleBeforeAgentReply(ctx)).resolves.toBeUndefined();
  });

  it("before_prompt_build handles missing planner gracefully", async () => {
    const { handleBeforePromptBuild, setPlanner } = await import("../src/index.js");

    setPlanner(null);

    const ctx = {
      session: { data: {} },
      plan: undefined,
      fragments: [],
      registerHook: vi.fn(),
    } as unknown as Record<string, unknown>;

    await expect(handleBeforePromptBuild(ctx)).resolves.toBeUndefined();
  });
});
