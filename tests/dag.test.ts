import { describe, it, expect } from "vitest";
import {
  validateDAG,
  detectCycles,
  topologicalSort,
  getReadyTasks,
  DAGCycleError,
  type TaskNode,
  type CycleResult,
} from "../src/utils/dag.js";
import type { Task } from "../src/types.js";

function makeTask(
  id: string,
  dependencies: string[] = [],
  status: Task["status"] = "pending"
): Task {
  return {
    id,
    description: `Task ${id}`,
    skills: ["code"],
    dependencies,
    status,
    requiresApproval: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// validateDAG
// ═══════════════════════════════════════════════════════════════════════════════

describe("validateDAG", () => {
  it("returns true for a valid DAG", () => {
    const tasks: Task[] = [
      makeTask("A"),
      makeTask("B", ["A"]),
      makeTask("C", ["A", "B"]),
    ];
    expect(validateDAG(tasks)).toBe(true);
  });

  it("returns false for a cycle", () => {
    const tasks: Task[] = [
      makeTask("A", ["B"]),
      makeTask("B", ["A"]),
    ];
    expect(validateDAG(tasks)).toBe(false);
  });

  it("returns false for a self-loop", () => {
    const tasks: Task[] = [makeTask("A", ["A"])];
    expect(validateDAG(tasks)).toBe(false);
  });

  it("returns true for an empty array", () => {
    expect(validateDAG([])).toBe(true);
  });

  it("returns true for single node with no dependencies", () => {
    expect(validateDAG([makeTask("A")])).toBe(true);
  });

  it("handles disconnected components", () => {
    const tasks: Task[] = [
      makeTask("A"),
      makeTask("B", ["A"]),
      makeTask("C"),
      makeTask("D", ["C"]),
    ];
    expect(validateDAG(tasks)).toBe(true);
  });

  it("handles missing dependency references (dangling edges)", () => {
    const tasks: Task[] = [
      makeTask("A", ["missing"]),
      makeTask("B", ["A"]),
    ];
    expect(validateDAG(tasks)).toBe(true);
  });

  it("throws TypeError for null", () => {
    expect(() => validateDAG(null as unknown as Task[])).toThrow(TypeError);
  });

  it("throws TypeError for undefined", () => {
    expect(() => validateDAG(undefined as unknown as Task[])).toThrow(TypeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// detectCycles
// ═══════════════════════════════════════════════════════════════════════════════

describe("detectCycles", () => {
  it("returns no cycles for a valid DAG", () => {
    const tasks: Task[] = [
      makeTask("A"),
      makeTask("B", ["A"]),
      makeTask("C", ["B"]),
    ];
    const result = detectCycles(tasks);
    expect(result.hasCycle).toBe(false);
    expect(result.cycles).toEqual([]);
  });

  it("detects a single cycle", () => {
    const tasks: Task[] = [
      makeTask("A", ["B"]),
      makeTask("B", ["C"]),
      makeTask("C", ["A"]),
    ];
    const result = detectCycles(tasks);
    expect(result.hasCycle).toBe(true);
    expect(result.cycles.length).toBeGreaterThanOrEqual(1);
    expect(result.cycles[0]).toContain("A");
    expect(result.cycles[0]).toContain("B");
    expect(result.cycles[0]).toContain("C");
  });

  it("detects multiple cycles", () => {
    const tasks: Task[] = [
      makeTask("A", ["B"]),
      makeTask("B", ["A"]),
      makeTask("C", ["D"]),
      makeTask("D", ["C"]),
    ];
    const result = detectCycles(tasks);
    expect(result.hasCycle).toBe(true);
    expect(result.cycles.length).toBe(2);
  });

  it("detects self-loops", () => {
    const tasks: Task[] = [
      makeTask("A", ["A"]),
      makeTask("B"),
    ];
    const result = detectCycles(tasks);
    expect(result.hasCycle).toBe(true);
    expect(result.cycles).toContainEqual(["A"]);
  });

  it("returns empty for empty array", () => {
    const result = detectCycles([]);
    expect(result.hasCycle).toBe(false);
    expect(result.cycles).toEqual([]);
  });

  it("handles disconnected components with no cycles", () => {
    const tasks: Task[] = [
      makeTask("A"),
      makeTask("B", ["A"]),
      makeTask("C"),
      makeTask("D", ["C"]),
    ];
    const result = detectCycles(tasks);
    expect(result.hasCycle).toBe(false);
    expect(result.cycles).toEqual([]);
  });

  it("throws TypeError for null", () => {
    expect(() => detectCycles(null as unknown as Task[])).toThrow(TypeError);
  });

  it("throws TypeError for undefined", () => {
    expect(() => detectCycles(undefined as unknown as Task[])).toThrow(TypeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// topologicalSort
// ═══════════════════════════════════════════════════════════════════════════════

describe("topologicalSort", () => {
  it("returns valid topological order", () => {
    const tasks: Task[] = [
      makeTask("A"),
      makeTask("B", ["A"]),
      makeTask("C", ["A", "B"]),
    ];
    const order = topologicalSort(tasks);
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("throws DAGCycleError for a cycle", () => {
    const tasks: Task[] = [
      makeTask("A", ["B"]),
      makeTask("B", ["A"]),
    ];
    expect(() => topologicalSort(tasks)).toThrow(DAGCycleError);
  });

  it("throws DAGCycleError with cycle paths for a cycle", () => {
    const tasks: Task[] = [
      makeTask("A", ["B"]),
      makeTask("B", ["A"]),
    ];
    try {
      topologicalSort(tasks);
      expect.fail("Expected DAGCycleError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DAGCycleError);
      const error = err as DAGCycleError;
      expect(error.cycles.length).toBeGreaterThanOrEqual(1);
      expect(error.cycles[0]).toContain("A");
      expect(error.cycles[0]).toContain("B");
    }
  });

  it("returns empty array for empty input", () => {
    expect(topologicalSort([])).toEqual([]);
  });

  it("handles disconnected components", () => {
    const tasks: Task[] = [
      makeTask("A"),
      makeTask("B", ["A"]),
      makeTask("C"),
      makeTask("D", ["C"]),
    ];
    const order = topologicalSort(tasks);
    expect(order.length).toBe(4);
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("D"));
  });

  it("handles single node with no dependencies", () => {
    expect(topologicalSort([makeTask("A")])).toEqual(["A"]);
  });

  it("handles missing dependency references (dangling edges)", () => {
    const tasks: Task[] = [
      makeTask("A", ["missing"]),
      makeTask("B", ["A"]),
    ];
    const order = topologicalSort(tasks);
    expect(order).toEqual(["A", "B"]);
  });

  it("throws TypeError for null", () => {
    expect(() => topologicalSort(null as unknown as Task[])).toThrow(TypeError);
  });

  it("throws TypeError for undefined", () => {
    expect(() => topologicalSort(undefined as unknown as Task[])).toThrow(TypeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getReadyTasks
// ═══════════════════════════════════════════════════════════════════════════════

describe("getReadyTasks", () => {
  it("returns ready tasks with all dependencies done", () => {
    const tasks: Task[] = [
      makeTask("A", [], "done"),
      makeTask("B", ["A"], "pending"),
    ];
    const ready = getReadyTasks(tasks);
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("B");
  });

  it("returns empty when dependencies are not done", () => {
    const tasks: Task[] = [
      makeTask("A", [], "running"),
      makeTask("B", ["A"], "pending"),
    ];
    expect(getReadyTasks(tasks)).toEqual([]);
  });

  it("returns tasks with no dependencies that are pending", () => {
    const tasks: Task[] = [
      makeTask("A", [], "pending"),
      makeTask("B", [], "done"),
    ];
    const ready = getReadyTasks(tasks);
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("A");
  });

  it("returns empty for empty array", () => {
    expect(getReadyTasks([])).toEqual([]);
  });

  it("does not return tasks with failed dependencies", () => {
    const tasks: Task[] = [
      makeTask("A", [], "failed"),
      makeTask("B", ["A"], "pending"),
    ];
    expect(getReadyTasks(tasks)).toEqual([]);
  });

  it("does not return tasks with running dependencies", () => {
    const tasks: Task[] = [
      makeTask("A", [], "running"),
      makeTask("B", ["A"], "pending"),
    ];
    expect(getReadyTasks(tasks)).toEqual([]);
  });

  it("does not return non-pending tasks even if deps are done", () => {
    const tasks: Task[] = [
      makeTask("A", [], "done"),
      makeTask("B", ["A"], "done"),
    ];
    expect(getReadyTasks(tasks)).toEqual([]);
  });

  it("handles missing dependency references as not ready", () => {
    const tasks: Task[] = [
      makeTask("A", ["missing"], "pending"),
    ];
    expect(getReadyTasks(tasks)).toEqual([]);
  });

  it("returns multiple ready tasks", () => {
    const tasks: Task[] = [
      makeTask("A", [], "done"),
      makeTask("B", ["A"], "done"),
      makeTask("C", ["A"], "pending"),
      makeTask("D", ["B"], "pending"),
      makeTask("E", [], "pending"),
    ];
    const ready = getReadyTasks(tasks);
    expect(ready.map((t) => t.id).sort()).toEqual(["C", "D", "E"]);
  });

  it("throws TypeError for null", () => {
    expect(() => getReadyTasks(null as unknown as Task[])).toThrow(TypeError);
  });

  it("throws TypeError for undefined", () => {
    expect(() => getReadyTasks(undefined as unknown as Task[])).toThrow(TypeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DAGCycleError
// ═══════════════════════════════════════════════════════════════════════════════

describe("DAGCycleError", () => {
  it("has correct message and cycles", () => {
    const cycles = [["A", "B", "C"]];
    const error = new DAGCycleError("Cycle detected", cycles);
    expect(error.message).toBe("Cycle detected");
    expect(error.cycles).toEqual(cycles);
    expect(error.name).toBe("DAGCycleError");
  });

  it("is an instance of Error", () => {
    const error = new DAGCycleError("msg", []);
    expect(error).toBeInstanceOf(Error);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Type exports
// ═══════════════════════════════════════════════════════════════════════════════

describe("type exports", () => {
  it("TaskNode type exists", () => {
    const node: TaskNode = {
      task: makeTask("A"),
      dependents: [],
      inDegree: 0,
    };
    expect(node.task.id).toBe("A");
  });

  it("CycleResult type exists", () => {
    const result: CycleResult = { hasCycle: false, cycles: [] };
    expect(result.hasCycle).toBe(false);
  });
});
