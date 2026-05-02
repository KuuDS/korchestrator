import { describe, it, expect } from "vitest";
import { validateDAG, hasCycle, getDependencies, getDependents } from "../src/utils/dag";
import { Task } from "../src/types";

function createTask(id: string, deps: string[] = []): Task {
  return {
    id,
    description: `Task ${id}`,
    skills: ["code"],
    dependencies: deps,
    status: "pending",
    requiresApproval: false,
  };
}

describe("validateDAG", () => {
  it("should pass for valid DAG with no dependencies", () => {
    const tasks = [createTask("task_001"), createTask("task_002")];
    expect(() => validateDAG(tasks)).not.toThrow();
  });

  it("should pass for valid DAG with linear dependencies", () => {
    const tasks = [
      createTask("task_001"),
      createTask("task_002", ["task_001"]),
      createTask("task_003", ["task_002"]),
    ];
    expect(() => validateDAG(tasks)).not.toThrow();
  });

  it("should pass for valid DAG with branching dependencies", () => {
    const tasks = [
      createTask("task_001"),
      createTask("task_002", ["task_001"]),
      createTask("task_003", ["task_001"]),
      createTask("task_004", ["task_002", "task_003"]),
    ];
    expect(() => validateDAG(tasks)).not.toThrow();
  });

  it("should throw for circular dependency (self-loop)", () => {
    const tasks = [createTask("task_001", ["task_001"])];
    expect(() => validateDAG(tasks)).toThrow("Circular dependency");
  });

  it("should throw for circular dependency (two nodes)", () => {
    const tasks = [
      createTask("task_001", ["task_002"]),
      createTask("task_002", ["task_001"]),
    ];
    expect(() => validateDAG(tasks)).toThrow("Circular dependency");
  });

  it("should throw for circular dependency (three nodes)", () => {
    const tasks = [
      createTask("task_001", ["task_003"]),
      createTask("task_002", ["task_001"]),
      createTask("task_003", ["task_002"]),
    ];
    expect(() => validateDAG(tasks)).toThrow("Circular dependency");
  });

  it("should throw for missing dependency", () => {
    const tasks = [createTask("task_001", ["task_999"])];
    expect(() => validateDAG(tasks)).toThrow("non-existent task");
  });
});

describe("hasCycle", () => {
  it("should return false for valid DAG", () => {
    const tasks = [createTask("task_001"), createTask("task_002", ["task_001"])];
    expect(hasCycle(tasks)).toBe(false);
  });

  it("should return true for circular dependency", () => {
    const tasks = [
      createTask("task_001", ["task_002"]),
      createTask("task_002", ["task_001"]),
    ];
    expect(hasCycle(tasks)).toBe(true);
  });
});

describe("getDependencies", () => {
  it("should return direct dependencies", () => {
    const dep = createTask("task_001");
    const task = createTask("task_002", ["task_001"]);
    const deps = getDependencies("task_002", [dep, task]);
    expect(deps).toHaveLength(1);
    expect(deps[0].id).toBe("task_001");
  });
});

describe("getDependents", () => {
  it("should return direct dependents", () => {
    const task = createTask("task_001");
    const dependent = createTask("task_002", ["task_001"]);
    const dependents = getDependents("task_001", [task, dependent]);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].id).toBe("task_002");
  });
});
