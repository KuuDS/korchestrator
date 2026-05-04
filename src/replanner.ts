import type { Plan, Task, HealthCheck, RepairDecision, RepairStrategy } from "./types.js";

/**
 * Configuration options for the Replanner constructor.
 */
export interface ReplannerConfig {
  /** LLM model identifier for repair strategy decisions */
  model: string;

  /** Maximum number of retry attempts before escalating */
  maxRetries?: number;

  /** Async function that calls the LLM (mockable for tests) */
  generate?: (prompt: string) => Promise<string>;
}

/**
 * The Replanner is responsible for:
 * - Checking plan health (detecting failed tasks)
 * - Selecting repair strategies via LLM
 * - Applying repair strategies to mutate the plan
 */
export class Replanner {
  private readonly generate: (prompt: string) => Promise<string>;

  /**
   * Creates a new Replanner instance.
   *
   * @param config - Replanner configuration
   */
  constructor(config: ReplannerConfig) {
    this.generate =
      config.generate ??
      (async (_prompt: string) => {
        throw new Error("No generate function provided");
      });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Health Check
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate the health of a plan by checking task statuses.
   *
   * - If all tasks are done or skipped: no reroute needed.
   * - If tasks are running with no failures: no reroute needed.
   * - If failures exist: reroute needed with failed tasks list.
   *
   * @param plan - The plan to evaluate
   * @returns HealthCheck result
   */
  check(plan: Plan): HealthCheck {
    try {
      const failedTasks = plan.tasks.filter((task) => task.status === "failed");

      if (failedTasks.length === 0) {
        return { needsReroute: false, failedTasks: [] };
      }

      return {
        needsReroute: true,
        failedTasks,
        reason: `${failedTasks.length} task${failedTasks.length > 1 ? "s" : ""} failed`,
      };
    } catch {
      // Fallback on any unexpected error during health check
      return { needsReroute: false, failedTasks: [] };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Repair Strategy Selection
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Call the LLM to select a repair strategy for failed tasks.
   *
   * Parses the LLM JSON response into a RepairDecision, validates the strategy,
   * and falls back to "retry" on any error.
   *
   * @param plan - The current plan
   * @param failedTasks - List of tasks that have failed
   * @returns RepairDecision with chosen strategy
   */
  async replan(plan: Plan, failedTasks: Task[]): Promise<RepairDecision> {
    try {
      const prompt = this.buildReplanPrompt(plan, failedTasks);
      const response = await this.generate(prompt);

      const parsed: unknown = JSON.parse(response);

      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Invalid LLM response: not an object");
      }

      const obj = parsed as Record<string, unknown>;

      if (typeof obj.strategy !== "string") {
        throw new Error("Invalid LLM response: missing strategy");
      }

      const strategy = obj.strategy as RepairStrategy;
      const validStrategies: RepairStrategy[] = ["retry", "decompose", "skip", "escalate"];

      if (!validStrategies.includes(strategy)) {
        throw new Error(`Invalid strategy: ${strategy}`);
      }

      if (typeof obj.reason !== "string" || obj.reason.length === 0) {
        throw new Error("Invalid LLM response: missing or empty reason");
      }

      const decision: RepairDecision = {
        strategy,
        reason: obj.reason,
      };

      if (strategy === "decompose" && Array.isArray(obj.newTasks)) {
        const newTasks: Task[] = obj.newTasks.map((t: unknown) => {
          if (typeof t !== "object" || t === null) {
            throw new Error("Invalid newTasks entry");
          }
          const taskObj = t as Record<string, unknown>;
          return {
            id: String(taskObj.id ?? ""),
            description: String(taskObj.description ?? ""),
            skills: Array.isArray(taskObj.skills) ? taskObj.skills.map(String) : [],
            dependencies: Array.isArray(taskObj.dependencies) ? taskObj.dependencies.map(String) : [],
            status: "pending",
            requiresApproval: Boolean(taskObj.requiresApproval),
          } as Task;
        });
        decision.newTasks = newTasks;
      }

      return decision;
    } catch {
      return { strategy: "retry", reason: "LLM failure fallback" };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Repair Strategy Application
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Apply a repair decision to the plan by mutating it in place.
   *
   * @param plan - The plan to mutate
   * @param failedTasks - List of tasks that failed
   * @param decision - The repair decision to apply
   */
  applyRepair(plan: Plan, failedTasks: Task[], decision: RepairDecision): void {
    const now = Date.now();

    switch (decision.strategy) {
      case "retry": {
        for (const task of failedTasks) {
          const planTask = plan.tasks.find((t) => t.id === task.id);
          if (planTask !== undefined) {
            planTask.status = "pending";
            planTask.result = undefined;
            planTask._retryCount = (planTask._retryCount ?? 0) + 1;
          }
        }
        break;
      }

      case "decompose": {
        // Remove failed tasks from the plan
        const failedIds = new Set(failedTasks.map((t) => t.id));
        plan.tasks = plan.tasks.filter((t) => !failedIds.has(t.id));

        // Append new tasks if provided
        if (decision.newTasks !== undefined && decision.newTasks.length > 0) {
          for (const newTask of decision.newTasks) {
            plan.tasks.push({
              ...newTask,
              status: "pending",
            });
          }
        }
        break;
      }

      case "skip": {
        for (const task of failedTasks) {
          const planTask = plan.tasks.find((t) => t.id === task.id);
          if (planTask !== undefined) {
            planTask.status = "skipped";
            planTask.result = "[skipped by replanner]";
          }
        }
        break;
      }

      case "escalate": {
        for (const task of failedTasks) {
          const planTask = plan.tasks.find((t) => t.id === task.id);
          if (planTask !== undefined) {
            planTask.status = "pending";
            planTask.result = undefined;
            planTask.requiresApproval = true;
          }
        }
        break;
      }

      default: {
        // Exhaustiveness check — should never reach here due to validation in replan()
        break;
      }
    }

    plan.updatedAt = now;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Prompt builders (private)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Build the replanning prompt for the LLM.
   */
  private buildReplanPrompt(plan: Plan, failedTasks: Task[]): string {
    const failedDescriptions = failedTasks
      .map((t) => `- ${t.id}: ${t.description} (retryCount: ${t._retryCount ?? 0})`)
      .join("\n");

    return [
      "You are a replanning assistant. Given a plan with failed tasks, select the best repair strategy.",
      "",
      "Allowed strategies:",
      '- "retry" — retry the same tasks again',
      '- "decompose" — break failed tasks into smaller sub-tasks (include newTasks array)',
      '- "skip" — mark failed tasks as skipped',
      '- "escalate" — escalate for human approval',
      "",
      "Respond ONLY with valid JSON in this exact shape:",
      '{"strategy":"retry","reason":"Transient error, retrying"}',
      "",
      "Plan:",
      `ID: ${plan.id}`,
      `Status: ${plan.status}`,
      `Tasks: ${plan.tasks.length}`,
      "",
      "Failed tasks:",
      failedDescriptions,
      "",
      "JSON:",
    ].join("\n");
  }
}
