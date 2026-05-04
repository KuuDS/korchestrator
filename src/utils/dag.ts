import type { Task } from "../types.js";

/**
 * Represents a node in the DAG, wrapping a Task with graph metadata.
 */
export interface TaskNode {
  /** The underlying task */
  task: Task;
  /** IDs of tasks that depend on this task */
  dependents: string[];
  /** In-degree count for Kahn's algorithm */
  inDegree: number;
}

/**
 * Result of cycle detection.
 */
export interface CycleResult {
  /** Whether any cycles were found */
  hasCycle: boolean;
  /** List of cycle paths, each path is an array of task IDs */
  cycles: string[][];
}

/**
 * Custom error thrown when a cycle is detected in the DAG.
 */
export class DAGCycleError extends Error {
  /** The detected cycle paths */
  cycles: string[][];

  constructor(message: string, cycles: string[][]) {
    super(message);
    this.name = "DAGCycleError";
    this.cycles = cycles;
  }
}

/**
 * Builds an internal adjacency map and in-degree counts from tasks.
 * Filters out dangling dependencies (dependencies that don't exist in the tasks array).
 *
 * @param tasks - Array of tasks
 * @returns Object containing adjacency map, in-degree map, and task ID set
 */
function buildGraph(
  tasks: Task[]
): {
  adjacency: Map<string, string[]>;
  inDegree: Map<string, number>;
  taskIds: Set<string>;
} {
  const taskIds = new Set<string>();
  for (const task of tasks) {
    taskIds.add(task.id);
  }

  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize in-degree for all tasks
  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  // Build adjacency and in-degree, ignoring dangling dependencies
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (taskIds.has(dep)) {
        // dep -> task.id edge
        const neighbors = adjacency.get(dep);
        if (neighbors !== undefined) {
          neighbors.push(task.id);
        }
        const currentInDegree = inDegree.get(task.id);
        if (currentInDegree !== undefined) {
          inDegree.set(task.id, currentInDegree + 1);
        }
      }
    }
  }

  return { adjacency, inDegree, taskIds };
}

/**
 * Validates that the given tasks form a valid DAG (no cycles).
 * Uses Kahn's algorithm. Handles empty arrays, self-loops, and missing dependencies.
 *
 * @param tasks - Array of tasks to validate
 * @returns true if the tasks form a valid DAG, false otherwise
 * @throws {TypeError} If tasks is null or undefined
 */
export function validateDAG(tasks: Task[]): boolean {
  if (tasks === null || tasks === undefined) {
    throw new TypeError("tasks must be an array");
  }

  if (tasks.length === 0) {
    return true;
  }

  const { adjacency, inDegree } = buildGraph(tasks);

  const queue: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  let processed = 0;

  while (queue.length > 0) {
    const current = queue.shift() as string;
    processed++;

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const neighborDegree = inDegree.get(neighbor);
      if (neighborDegree !== undefined) {
        const newDegree = neighborDegree - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
  }

  return processed === tasks.length;
}

/**
 * Detects all cycles in the task dependency graph.
 * Uses DFS with color marking (white=unvisited, gray=visiting, black=done).
 * Handles multiple cycles, self-loops, and missing dependencies.
 *
 * @param tasks - Array of tasks to analyze
 * @returns CycleResult with hasCycle flag and array of cycle paths
 * @throws {TypeError} If tasks is null or undefined
 */
export function detectCycles(tasks: Task[]): CycleResult {
  if (tasks === null || tasks === undefined) {
    throw new TypeError("tasks must be an array");
  }

  if (tasks.length === 0) {
    return { hasCycle: false, cycles: [] };
  }

  const taskIds = new Set<string>();
  for (const task of tasks) {
    taskIds.add(task.id);
  }

  // Build adjacency only for existing tasks
  const adjacency = new Map<string, string[]>();
  for (const task of tasks) {
    adjacency.set(
      task.id,
      task.dependencies.filter((dep) => taskIds.has(dep) && dep !== task.id)
    );
  }

  const color = new Map<string, "white" | "gray" | "black">();
  for (const task of tasks) {
    color.set(task.id, "white");
  }

  const cycles: string[][] = [];
  const path: string[] = [];

  function dfs(node: string): void {
    color.set(node, "gray");
    path.push(node);

    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);
      if (neighborColor === "white") {
        dfs(neighbor);
      } else if (neighborColor === "gray") {
        // Found a cycle — extract cycle from path
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          cycles.push(cycle);
        }
      }
    }

    path.pop();
    color.set(node, "black");
  }

  // Detect self-loops first
  for (const task of tasks) {
    if (task.dependencies.includes(task.id)) {
      cycles.push([task.id]);
    }
  }

  for (const task of tasks) {
    if (color.get(task.id) === "white") {
      dfs(task.id);
    }
  }

  // Remove duplicate cycles (same set of nodes in same order, rotated)
  const uniqueCycles: string[][] = [];
  const seen = new Set<string>();

  for (const cycle of cycles) {
    // Normalize cycle: find lexicographically smallest rotation
    let minRotation = cycle.join(",");
    for (let i = 1; i < cycle.length; i++) {
      const rotation = cycle.slice(i).concat(cycle.slice(0, i)).join(",");
      if (rotation < minRotation) {
        minRotation = rotation;
      }
    }
    if (!seen.has(minRotation)) {
      seen.add(minRotation);
      uniqueCycles.push(cycle);
    }
  }

  return { hasCycle: uniqueCycles.length > 0, cycles: uniqueCycles };
}

/**
 * Returns task IDs in topological order.
 * Uses Kahn's algorithm. Throws DAGCycleError if cycles exist.
 * Handles disconnected components and empty arrays.
 *
 * @param tasks - Array of tasks to sort
 * @returns Array of task IDs in topological order
 * @throws {TypeError} If tasks is null or undefined
 * @throws {DAGCycleError} If the graph contains cycles
 */
export function topologicalSort(tasks: Task[]): string[] {
  if (tasks === null || tasks === undefined) {
    throw new TypeError("tasks must be an array");
  }

  if (tasks.length === 0) {
    return [];
  }

  const { adjacency, inDegree } = buildGraph(tasks);

  const queue: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    result.push(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const neighborDegree = inDegree.get(neighbor);
      if (neighborDegree !== undefined) {
        const newDegree = neighborDegree - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
  }

  if (result.length !== tasks.length) {
    const cycleResult = detectCycles(tasks);
    throw new DAGCycleError(
      "Cycle detected in task dependencies",
      cycleResult.cycles
    );
  }

  return result;
}

/**
 * Returns tasks with status "pending" whose all dependencies are "done".
 * Tasks with no dependencies are ready if they are pending.
 * Tasks with failed dependencies are NOT ready.
 *
 * @param tasks - Array of tasks to check
 * @returns Array of tasks that are ready to execute
 * @throws {TypeError} If tasks is null or undefined
 */
export function getReadyTasks(tasks: Task[]): Task[] {
  if (tasks === null || tasks === undefined) {
    throw new TypeError("tasks must be an array");
  }

  if (tasks.length === 0) {
    return [];
  }

  const taskMap = new Map<string, Task>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  const ready: Task[] = [];

  for (const task of tasks) {
    if (task.status !== "pending") {
      continue;
    }

    let allDone = true;
    let hasFailedDep = false;

    for (const depId of task.dependencies) {
      const dep = taskMap.get(depId);
      if (dep === undefined) {
        // Missing dependency reference — treat as not ready
        allDone = false;
        break;
      }
      if (dep.status === "failed") {
        hasFailedDep = true;
        break;
      }
      if (dep.status !== "done") {
        allDone = false;
        break;
      }
    }

    if (allDone && !hasFailedDep) {
      ready.push(task);
    }
  }

  return ready;
}
