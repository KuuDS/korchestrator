/**
 * Plan Rules Validation Tests
 *
 * Tests for the plan validation rules:
 * - planStructureValidator
 * - circularDependencyValidator
 * - taskGranularityValidator
 * - timeoutConstraintValidator
 *
 * And their factory functions:
 * - createPlanStructureValidator
 * - createCircularDependencyValidator
 * - createTaskGranularityValidator
 * - createTimeoutConstraintValidator
 */

import { describe, it, expect } from "vitest";
import {
  planStructureValidator,
  circularDependencyValidator,
  taskGranularityValidator,
  timeoutConstraintValidator,
  createPlanStructureValidator,
  createCircularDependencyValidator,
  createTaskGranularityValidator,
  createTimeoutConstraintValidator,
} from "../../src/validation/rules/plan-rules.js";
import type { ValidationContext } from "../../src/validation/types.js";
import type { Plan, Task } from "../../src/types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ───────────────────────────────────────────────────────────────────────────────

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_001",
    description: "A well-sized task description",
    skills: ["code"],
    dependencies: [],
    status: "pending",
    requiresApproval: false,
    ...overrides,
  };
}

function createMockPlan(overrides: Partial<Plan> = {}): Plan {
  const now = Date.now();
  return {
    id: "plan_001",
    status: "planning",
    tasks: [],
    taskRunMap: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockContext(plan?: Plan, task?: Task): ValidationContext {
  return {
    plan,
    task,
    history: [],
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// planStructureValidator
// ───────────────────────────────────────────────────────────────────────────────

describe("planStructureValidator", () => {
  it("should pass for a valid plan with all required fields", () => {
    const plan = createMockPlan({
      tasks: [createMockTask()],
      taskRunMap: { run_001: "task_001" },
    });
    const context = createMockContext(plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(true);
    expect(result.ruleId).toBe("plan-structure");
    expect(result.message).toBe("Plan structure is valid");
  });

  it("should pass when plan is undefined (no plan to validate)", () => {
    const context = createMockContext(undefined);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(true);
    expect(result.ruleId).toBe("plan-structure");
    expect(result.message).toBe("No plan to validate");
  });

  it("should pass when plan is null (no plan to validate)", () => {
    const context = createMockContext(null as unknown as Plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(true);
    expect(result.message).toBe("No plan to validate");
  });

  it("should fail when id is missing", () => {
    const plan = createMockPlan();
    delete (plan as Partial<Plan>).id;
    const context = createMockContext(plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("id");
    expect(result.metadata).toMatchObject({
      code: "INVALID_PLAN_STRUCTURE",
      missingFields: ["id"],
    });
  });

  it("should fail when tasks is missing", () => {
    const plan = createMockPlan();
    delete (plan as Partial<Plan>).tasks;
    const context = createMockContext(plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("tasks");
    expect(result.metadata).toMatchObject({
      code: "INVALID_PLAN_STRUCTURE",
      missingFields: ["tasks"],
    });
  });

  it("should fail when taskRunMap is missing", () => {
    const plan = createMockPlan();
    delete (plan as Partial<Plan>).taskRunMap;
    const context = createMockContext(plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("taskRunMap");
    expect(result.metadata).toMatchObject({
      code: "INVALID_PLAN_STRUCTURE",
      missingFields: ["taskRunMap"],
    });
  });

  it("should fail when createdAt is missing", () => {
    const plan = createMockPlan();
    delete (plan as Partial<Plan>).createdAt;
    const context = createMockContext(plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("createdAt");
    expect(result.metadata).toMatchObject({
      code: "INVALID_PLAN_STRUCTURE",
      missingFields: ["createdAt"],
    });
  });

  it("should fail when updatedAt is missing", () => {
    const plan = createMockPlan();
    delete (plan as Partial<Plan>).updatedAt;
    const context = createMockContext(plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("updatedAt");
    expect(result.metadata).toMatchObject({
      code: "INVALID_PLAN_STRUCTURE",
      missingFields: ["updatedAt"],
    });
  });

  it("should fail when multiple fields are missing", () => {
    const plan = createMockPlan();
    delete (plan as Partial<Plan>).id;
    delete (plan as Partial<Plan>).tasks;
    const context = createMockContext(plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({
      code: "INVALID_PLAN_STRUCTURE",
      missingFields: expect.arrayContaining(["id", "tasks"]),
    });
  });

  it("should fail when tasks is not an array", () => {
    const plan = createMockPlan({ tasks: "not-array" as unknown as Task[] });
    const context = createMockContext(plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toBe("Plan tasks must be an array");
    expect(result.metadata).toEqual({ code: "INVALID_PLAN_STRUCTURE" });
  });

  it("should fail when taskRunMap is not an object", () => {
    const plan = createMockPlan({ taskRunMap: "not-object" as unknown as Record<string, string> });
    const context = createMockContext(plan);
    const result = planStructureValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toBe("Plan taskRunMap must be an object");
    expect(result.metadata).toEqual({ code: "INVALID_PLAN_STRUCTURE" });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// circularDependencyValidator
// ───────────────────────────────────────────────────────────────────────────────

describe("circularDependencyValidator", () => {
  it("should pass for a plan with no tasks", () => {
    const plan = createMockPlan({ tasks: [] });
    const context = createMockContext(plan);
    const result = circularDependencyValidator(context);

    expect(result.passed).toBe(true);
    expect(result.ruleId).toBe("no-circular-dep");
  });

  it("should pass for tasks with no dependencies", () => {
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", dependencies: [] }),
        createMockTask({ id: "task_002", dependencies: [] }),
      ],
    });
    const context = createMockContext(plan);
    const result = circularDependencyValidator(context);

    expect(result.passed).toBe(true);
    expect(result.message).toBe("No circular dependencies detected");
  });

  it("should pass for a valid DAG (linear chain)", () => {
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", dependencies: [] }),
        createMockTask({ id: "task_002", dependencies: ["task_001"] }),
        createMockTask({ id: "task_003", dependencies: ["task_002"] }),
      ],
    });
    const context = createMockContext(plan);
    const result = circularDependencyValidator(context);

    expect(result.passed).toBe(true);
  });

  it("should pass for a valid DAG (diamond shape)", () => {
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", dependencies: [] }),
        createMockTask({ id: "task_002", dependencies: ["task_001"] }),
        createMockTask({ id: "task_003", dependencies: ["task_001"] }),
        createMockTask({ id: "task_004", dependencies: ["task_002", "task_003"] }),
      ],
    });
    const context = createMockContext(plan);
    const result = circularDependencyValidator(context);

    expect(result.passed).toBe(true);
  });

  it("should fail for a simple 2-task circular dependency", () => {
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", dependencies: ["task_002"] }),
        createMockTask({ id: "task_002", dependencies: ["task_001"] }),
      ],
    });
    const context = createMockContext(plan);
    const result = circularDependencyValidator(context);

    expect(result.passed).toBe(false);
    expect(result.ruleId).toBe("no-circular-dep");
    expect(result.severity).toBe("error");
    expect(result.message).toContain("Circular dependency detected");
    expect(result.metadata).toMatchObject({
      code: "CIRCULAR_DEPENDENCY",
      cycle: expect.arrayContaining(["task_001", "task_002"]),
    });
  });

  it("should fail for a 3-task circular dependency cycle", () => {
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", dependencies: ["task_003"] }),
        createMockTask({ id: "task_002", dependencies: ["task_001"] }),
        createMockTask({ id: "task_003", dependencies: ["task_002"] }),
      ],
    });
    const context = createMockContext(plan);
    const result = circularDependencyValidator(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({
      code: "CIRCULAR_DEPENDENCY",
      cycle: expect.arrayContaining(["task_001", "task_002", "task_003"]),
    });
  });

  it("should fail for self-referencing dependency", () => {
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", dependencies: ["task_001"] })],
    });
    const context = createMockContext(plan);
    const result = circularDependencyValidator(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({
      code: "CIRCULAR_DEPENDENCY",
      cycle: expect.arrayContaining(["task_001"]),
    });
  });

  it("should pass when dependencies reference non-existent tasks", () => {
    // Dependencies to non-existent tasks are filtered out by the validator
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", dependencies: [] }),
        createMockTask({ id: "task_002", dependencies: ["task_001", "nonexistent"] }),
      ],
    });
    const context = createMockContext(plan);
    const result = circularDependencyValidator(context);

    expect(result.passed).toBe(true);
  });

  it("should pass when plan is undefined", () => {
    const context = createMockContext(undefined);
    const result = circularDependencyValidator(context);

    expect(result.passed).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// taskGranularityValidator
// ───────────────────────────────────────────────────────────────────────────────

describe("taskGranularityValidator", () => {
  it("should pass for tasks with reasonable description length", () => {
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", description: "Implement user authentication with JWT tokens" }),
        createMockTask({ id: "task_002", description: "Write unit tests for the auth module" }),
      ],
    });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(true);
    expect(result.ruleId).toBe("task-granularity");
    expect(result.message).toBe("All task descriptions have reasonable granularity");
  });

  it("should fail when a task description is too short (< 10 chars)", () => {
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", description: "Fix bug" })],
    });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(false);
    expect(result.ruleId).toBe("task-granularity");
    expect(result.severity).toBe("warning");
    expect(result.message).toContain("TASK_TOO_SMALL");
    expect(result.metadata).toMatchObject({
      code: "TASK_TOO_SMALL",
      issues: [{ taskId: "task_001", issue: "TASK_TOO_SMALL", length: 7, subSteps: 0 }],
    });
  });

  it("should fail when a task description is too long (> 500 chars)", () => {
    const longDescription = "A".repeat(501);
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", description: longDescription })],
    });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("TASK_TOO_LARGE");
    expect(result.metadata).toMatchObject({
      code: "TASK_TOO_LARGE",
      issues: [{ taskId: "task_001", issue: "TASK_TOO_LARGE", length: 501, subSteps: 0 }],
    });
  });

  it("should fail when a task has too many sub-steps (> 5)", () => {
    const description = "1. Step one\n2. Step two\n3. Step three\n4. Step four\n5. Step five\n6. Step six";
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", description })],
    });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("TASK_TOO_LARGE");
    expect(result.metadata).toMatchObject({
      code: "TASK_TOO_LARGE",
      issues: [{ taskId: "task_001", issue: "TASK_TOO_LARGE", length: description.length, subSteps: 6 }],
    });
  });

  it("should fail with MULTIPLE_GRANULARITY_ISSUES when multiple tasks have problems", () => {
    const longDescription = "B".repeat(600);
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", description: "Short" }),
        createMockTask({ id: "task_002", description: longDescription }),
        createMockTask({ id: "task_003", description: "A perfectly normal task description" }),
      ],
    });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({
      code: "MULTIPLE_GRANULARITY_ISSUES",
      issues: expect.arrayContaining([
        { taskId: "task_001", issue: "TASK_TOO_SMALL", length: 5, subSteps: 0 },
        { taskId: "task_002", issue: "TASK_TOO_LARGE", length: 600, subSteps: 0 },
      ]),
    });
  });

  it("should pass when plan has no tasks", () => {
    const plan = createMockPlan({ tasks: [] });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(true);
  });

  it("should pass when plan is undefined", () => {
    const context = createMockContext(undefined);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(true);
  });

  it("should fail when a task description is empty", () => {
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", description: "" })],
    });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({
      code: "TASK_TOO_SMALL",
      issues: [{ taskId: "task_001", issue: "TASK_TOO_SMALL", length: 0 }],
    });
  });

  it("should fail when a task description is exactly 10 chars (boundary: exactly 10 passes)", () => {
    // 10 characters is the lower threshold (passes when >= 10)
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", description: "1234567890" })],
    });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(true);
  });

  it("should fail at 501 chars (boundary)", () => {
    const description = "C".repeat(501);
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", description })],
    });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({
      code: "TASK_TOO_LARGE",
      issues: [{ taskId: "task_001", issue: "TASK_TOO_LARGE", length: 501 }],
    });
  });

  it("should pass at exactly 500 chars (boundary)", () => {
    const description = "D".repeat(500);
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", description })],
    });
    const context = createMockContext(plan);
    const result = taskGranularityValidator(context);

    expect(result.passed).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// timeoutConstraintValidator
// ───────────────────────────────────────────────────────────────────────────────

describe("timeoutConstraintValidator", () => {
  it("should pass when all tasks have valid timeout configuration", () => {
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", metadata: { timeout: 60 } }),
        createMockTask({ id: "task_002", metadata: { timeout: 120 } }),
        createMockTask({ id: "task_003", metadata: { timeout: 300 } }),
      ],
    });
    const context = createMockContext(plan);
    const result = timeoutConstraintValidator(context);

    expect(result.passed).toBe(true);
    expect(result.ruleId).toBe("timeout-constraint");
    expect(result.message).toBe("All tasks have reasonable timeout configuration");
  });

  it("should fail when a task is missing timeout", () => {
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", metadata: {} })],
    });
    const context = createMockContext(plan);
    const result = timeoutConstraintValidator(context);

    expect(result.passed).toBe(false);
    expect(result.ruleId).toBe("timeout-constraint");
    expect(result.severity).toBe("warning");
    expect(result.message).toContain("timeout not configured");
    expect(result.metadata).toMatchObject({
      code: "TIMEOUT_NOT_CONFIGURED",
      issues: [{ taskId: "task_001", reason: "missing" }],
    });
  });

  it("should fail when a task has timeout greater than 300", () => {
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", metadata: { timeout: 301 } })],
    });
    const context = createMockContext(plan);
    const result = timeoutConstraintValidator(context);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("timeout=301 exceeds maximum of 300");
    expect(result.metadata).toMatchObject({
      code: "TIMEOUT_NOT_CONFIGURED",
      issues: [{ taskId: "task_001", timeout: 301, reason: "too_high" }],
    });
  });

  it("should fail when multiple tasks have timeout issues", () => {
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", metadata: { timeout: 500 } }),
        createMockTask({ id: "task_002", metadata: {} }),
        createMockTask({ id: "task_003", metadata: { timeout: 60 } }),
      ],
    });
    const context = createMockContext(plan);
    const result = timeoutConstraintValidator(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({
      code: "TIMEOUT_NOT_CONFIGURED",
      issues: expect.arrayContaining([
        { taskId: "task_001", timeout: 500, reason: "too_high" },
        { taskId: "task_002", reason: "missing" },
      ]),
    });
  });

  it("should pass when plan has no tasks", () => {
    const plan = createMockPlan({ tasks: [] });
    const context = createMockContext(plan);
    const result = timeoutConstraintValidator(context);

    expect(result.passed).toBe(true);
  });

  it("should pass when plan is undefined", () => {
    const context = createMockContext(undefined);
    const result = timeoutConstraintValidator(context);

    expect(result.passed).toBe(true);
  });

  it("should pass at exactly timeout=300 (boundary)", () => {
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", metadata: { timeout: 300 } })],
    });
    const context = createMockContext(plan);
    const result = timeoutConstraintValidator(context);

    expect(result.passed).toBe(true);
  });

  it("should fail at timeout=301 (boundary)", () => {
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", metadata: { timeout: 301 } })],
    });
    const context = createMockContext(plan);
    const result = timeoutConstraintValidator(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({
      code: "TIMEOUT_NOT_CONFIGURED",
      issues: [{ taskId: "task_001", timeout: 301, reason: "too_high" }],
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Factory Functions
// ───────────────────────────────────────────────────────────────────────────────

describe("createPlanStructureValidator", () => {
  it("should return a ValidationRule with correct properties", () => {
    const rule = createPlanStructureValidator();

    expect(rule.id).toBe("plan-structure");
    expect(rule.name).toBe("Plan Structure Validator");
    expect(rule.description).toBe("Validates that a Plan has all required fields");
    expect(rule.priority).toBe(100);
    expect(rule.strategy).toBe("block");
    expect(rule.enabled).toBe(true);
    expect(typeof rule.execute).toBe("function");
  });

  it("should execute and validate plan structure", () => {
    const rule = createPlanStructureValidator();
    const plan = createMockPlan();
    const context = createMockContext(plan);
    const result = rule.execute(context);

    expect(result.passed).toBe(true); // empty plan still has all required fields
    expect(result.ruleId).toBe("plan-structure");
  });
});

describe("createCircularDependencyValidator", () => {
  it("should return a ValidationRule with correct properties", () => {
    const rule = createCircularDependencyValidator();

    expect(rule.id).toBe("no-circular-dep");
    expect(rule.name).toBe("Circular Dependency Validator");
    expect(rule.description).toBe("Detects cycles in task dependencies using DFS");
    expect(rule.priority).toBe(90);
    expect(rule.strategy).toBe("block");
    expect(rule.enabled).toBe(true);
    expect(typeof rule.execute).toBe("function");
  });

  it("should detect circular dependencies through execute", () => {
    const rule = createCircularDependencyValidator();
    const plan = createMockPlan({
      tasks: [
        createMockTask({ id: "task_001", dependencies: ["task_002"] }),
        createMockTask({ id: "task_002", dependencies: ["task_001"] }),
      ],
    });
    const context = createMockContext(plan);
    const result = rule.execute(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({ code: "CIRCULAR_DEPENDENCY" });
  });
});

describe("createTaskGranularityValidator", () => {
  it("should return a ValidationRule with correct properties", () => {
    const rule = createTaskGranularityValidator();

    expect(rule.id).toBe("task-granularity");
    expect(rule.name).toBe("Task Granularity Validator");
    expect(rule.description).toBe("Checks task descriptions for reasonable length and complexity");
    expect(rule.priority).toBe(50);
    expect(rule.strategy).toBe("warn");
    expect(rule.enabled).toBe(true);
    expect(typeof rule.execute).toBe("function");
  });

  it("should detect task granularity issues through execute", () => {
    const rule = createTaskGranularityValidator();
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", description: "X" })],
    });
    const context = createMockContext(plan);
    const result = rule.execute(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({ code: "TASK_TOO_SMALL" });
  });
});

describe("createTimeoutConstraintValidator", () => {
  it("should return a ValidationRule with correct properties", () => {
    const rule = createTimeoutConstraintValidator();

    expect(rule.id).toBe("timeout-constraint");
    expect(rule.name).toBe("Timeout Constraint Validator");
    expect(rule.description).toBe("Validates that tasks have reasonable timeout configuration");
    expect(rule.priority).toBe(40);
    expect(rule.strategy).toBe("warn");
    expect(rule.enabled).toBe(true);
    expect(typeof rule.execute).toBe("function");
  });

  it("should detect missing timeout through execute", () => {
    const rule = createTimeoutConstraintValidator();
    const plan = createMockPlan({
      tasks: [createMockTask({ id: "task_001", metadata: {} })],
    });
    const context = createMockContext(plan);
    const result = rule.execute(context);

    expect(result.passed).toBe(false);
    expect(result.metadata).toMatchObject({ code: "TIMEOUT_NOT_CONFIGURED" });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Integration: Valid Plan passing all rules
// ───────────────────────────────────────────────────────────────────────────────

describe("Integration: Valid Plan", () => {
  it("should pass all validators for a realistic valid plan", () => {
    const plan = createMockPlan({
      id: "plan_integration_001",
      status: "executing",
      tasks: [
        createMockTask({
          id: "task_001",
          description: "Search for relevant API documentation",
          skills: ["search"],
          dependencies: [],
          status: "done",
          metadata: { timeout: 60 },
        }),
        createMockTask({
          id: "task_002",
          description: "Implement the core data fetching logic",
          skills: ["code"],
          dependencies: ["task_001"],
          status: "running",
          metadata: { timeout: 120 },
        }),
        createMockTask({
          id: "task_003",
          description: "Write unit tests for data fetching",
          skills: ["code"],
          dependencies: ["task_002"],
          status: "pending",
          metadata: { timeout: 90 },
        }),
      ],
      taskRunMap: {
        run_001: "task_001",
        run_002: "task_002",
      },
    });

    const context = createMockContext(plan);

    const structureResult = planStructureValidator(context);
    const circularResult = circularDependencyValidator(context);
    const granularityResult = taskGranularityValidator(context);
    const timeoutResult = timeoutConstraintValidator(context);

    expect(structureResult.passed).toBe(true);
    expect(circularResult.passed).toBe(true);
    expect(granularityResult.passed).toBe(true);
    expect(timeoutResult.passed).toBe(true);
  });

  it("should detect all issues in an invalid plan", () => {
    const longDescription = "Z".repeat(600);
    const plan = createMockPlan({
      id: "plan_bad_001",
      status: "planning",
      tasks: [
        createMockTask({
          id: "task_001",
          description: "ok",
          skills: ["code"],
          dependencies: ["task_002"],
          status: "pending",
          metadata: { timeout: 500 },
        }),
        createMockTask({
          id: "task_002",
          description: longDescription,
          skills: ["search"],
          dependencies: ["task_001"],
          status: "pending",
          // missing timeout
        }),
      ],
    });

    const context = createMockContext(plan);

    const structureResult = planStructureValidator(context);
    // plan structure should pass (fields are all present)
    expect(structureResult.passed).toBe(true);

    const circularResult = circularDependencyValidator(context);
    expect(circularResult.passed).toBe(false);
    expect(circularResult.metadata).toMatchObject({ code: "CIRCULAR_DEPENDENCY" });

    const granularityResult = taskGranularityValidator(context);
    expect(granularityResult.passed).toBe(false);
    expect(granularityResult.metadata).toMatchObject({
      code: "MULTIPLE_GRANULARITY_ISSUES",
    });

    const timeoutResult = timeoutConstraintValidator(context);
    expect(timeoutResult.passed).toBe(false);
    expect(timeoutResult.metadata).toMatchObject({
      code: "TIMEOUT_NOT_CONFIGURED",
    });
  });
});
