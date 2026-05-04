import type { Task, Plan, AgentRole, Progress, TaskStatus } from "./types.js";
import { getReadyTasks as dagGetReadyTasks } from "./utils/dag.js";

/**
 * Lifecycle event payload for tracking subagent execution state.
 */
export interface LifecycleEvent {
  /** Event type — spawned when a subagent starts, ended when it finishes */
  type: "spawned" | "ended";
  /** Unique run identifier assigned by the gateway */
  runId: string;
  /** Task identifier this run corresponds to */
  taskId: string;
  /** Final result or output from the subagent (only on ended) */
  result?: string;
}

/**
 * Router error thrown when a task cannot be spawned due to invalid state.
 */
export class RouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouterError";
  }
}

/**
 * TaskRouter routes tasks to subagents based on skill matching,
 * enforces concurrency limits, and tracks task lifecycle.
 *
 * Skill Matching Algorithm (three-tier):
 * 1. Exact match: agent possesses ALL required skills for the task.
 * 2. Intersection match: agent possesses the highest number of required skills
 *    (ties broken by first in pool).
 * 3. Fallback: return the first agent in the pool unconditionally.
 */
export class TaskRouter {
  /** Maximum number of concurrently running subagents */
  private readonly maxConcurrency: number;

  /** Ordered pool of available agent roles */
  private readonly agentPool: AgentRole[];

  /**
   * Create a new TaskRouter.
   *
   * @param config - Router configuration
   * @param config.maxConcurrency - Maximum concurrent subagent executions
   * @param config.agentPool - Ordered list of available agent roles
   */
  constructor(config: { maxConcurrency: number; agentPool: AgentRole[] }) {
    this.maxConcurrency = config.maxConcurrency;
    this.agentPool = [...config.agentPool];
  }

  /**
   * Return tasks that are ready to execute: pending status with all
   * dependencies in "done" state.
   *
   * @param plan - The current execution plan
   * @returns Array of tasks ready to run
   */
  getReadyTasks(plan: Plan): Task[] {
    try {
      return dagGetReadyTasks(plan.tasks);
    } catch (err) {
      // Defensive: if dag.ts throws, surface as empty to avoid crashing router
      return [];
    }
  }

  /**
   * Route a task to the best-matching agent based on required skills.
   *
   * Three-tier matching algorithm:
   * 1. Exact match — agent has every skill the task requires.
   * 2. Intersection match — agent has the most required skills (best partial fit).
   * 3. Fallback — return the first agent in the pool.
   *
   * @param task - Task to route
   * @returns The selected AgentRole
   */
  routeBySkill(task: Task): AgentRole {
    if (this.agentPool.length === 0) {
      throw new RouterError("Agent pool is empty — cannot route task");
    }

    const required = new Set(task.skills);

    // Tier 1: Exact match
    for (const agent of this.agentPool) {
      const hasAll = Array.from(required).every((skill) => agent.skills.includes(skill));
      if (hasAll) {
        return agent;
      }
    }

    // Tier 2: Intersection match (most overlapping skills)
    let bestAgent: AgentRole = this.agentPool[0];
    let bestScore = 0;

    for (const agent of this.agentPool) {
      const score = Array.from(required).filter((skill) => agent.skills.includes(skill)).length;
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    // Tier 3: Fallback (bestAgent already set to first agent; if bestScore === 0
    // and no exact match, we return the first agent in the pool)
    return bestAgent;
  }

  /**
   * Check whether spawning another task would exceed the concurrency limit.
   *
   * @param plan - The current execution plan
   * @returns BlockResult indicating whether to block and why
   */
  checkConcurrency(plan: Plan): { block: boolean; reason?: string } {
    const runningCount = plan.tasks.filter((t) => t.status === "running").length;
    if (runningCount >= this.maxConcurrency) {
      return {
        block: true,
        reason: `Concurrency limit reached (${runningCount}/${this.maxConcurrency})`,
      };
    }
    return { block: false };
  }

  /**
   * Spawn a task: verify readiness, route to an agent, mark as running.
   *
   * @param plan - The current execution plan
   * @param task - The task to spawn
   * @returns The assigned AgentRole
   * @throws {RouterError} If the task is not in a spawnable state
   */
  async spawnTask(plan: Plan, task: Task): Promise<AgentRole> {
    // Verify task is pending
    if (task.status !== "pending") {
      throw new RouterError(
        `Cannot spawn task ${task.id}: expected status "pending" but got "${task.status}"`
      );
    }

    // Verify all dependencies are done
    const taskMap = new Map<string, Task>();
    for (const t of plan.tasks) {
      taskMap.set(t.id, t);
    }

    for (const depId of task.dependencies) {
      const dep = taskMap.get(depId);
      if (dep === undefined) {
        throw new RouterError(
          `Cannot spawn task ${task.id}: dependency ${depId} not found in plan`
        );
      }
      if (dep.status !== "done") {
        throw new RouterError(
          `Cannot spawn task ${task.id}: dependency ${depId} is "${dep.status}" (expected "done")`
        );
      }
    }

    // Route to agent
    const agent = this.routeBySkill(task);

    // Mark as running
    task.status = "running";
    task.assignedAgent = agent.agentId;
    task.startedAt = Date.now();

    return agent;
  }

  /**
   * Track subagent lifecycle events and update plan state.
   *
   * @param event - Lifecycle event
   * @param plan - The current execution plan (mutated in place)
   */
  async trackLifecycle(event: LifecycleEvent, plan: Plan): Promise<void> {
    try {
      if (event.type === "spawned") {
        // Map runId -> taskId
        plan.taskRunMap[event.runId] = event.taskId;

        // Update task status to running if still pending
        const task = plan.tasks.find((t) => t.id === event.taskId);
        if (task !== undefined) {
          if (task.status === "pending") {
            task.status = "running";
            if (task.startedAt === undefined) {
              task.startedAt = Date.now();
            }
          }
        }
      } else if (event.type === "ended") {
        // Update task status to done
        const task = plan.tasks.find((t) => t.id === event.taskId);
        if (task !== undefined) {
          if (task.status === "running") {
            task.status = "done";
            task.completedAt = Date.now();
            if (event.result !== undefined) {
              task.result = event.result;
            }
          } else {
            // Invalid transition — log silently (no logger injected here)
            // We store the result anyway for observability
            if (event.result !== undefined) {
              task.result = event.result;
            }
          }
        }
      }

      plan.updatedAt = Date.now();
    } catch (err) {
      // Defensive: swallow unexpected errors to avoid crashing the gateway
      const msg = err instanceof Error ? err.message : String(err);
      throw new RouterError(`trackLifecycle failed: ${msg}`);
    }
  }

  /**
   * Determine whether there is remaining work in the plan.
   *
   * @param plan - The current execution plan
   * @returns true if any tasks are pending or running
   */
  hasMoreWork(plan: Plan): boolean {
    return plan.tasks.some((t) => t.status === "pending" || t.status === "running");
  }

  /**
   * Compute execution progress counts.
   *
   * @param plan - The current execution plan
   * @returns Progress summary with counts per status
   */
  getProgress(plan: Plan): Progress {
    const counts: Record<TaskStatus, number> = {
      pending: 0,
      running: 0,
      done: 0,
      failed: 0,
      skipped: 0,
    };

    for (const task of plan.tasks) {
      counts[task.status]++;
    }

    return {
      total: plan.tasks.length,
      done: counts.done,
      failed: counts.failed,
      pending: counts.pending,
      running: counts.running,
    };
  }
}
