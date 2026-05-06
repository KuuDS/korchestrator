/**
 * Plan Validation Rules
 *
 * Validation rules for Plan structures, dependency graphs,
 * task granularity, and timeout constraints.
 */

import type { ValidationResult, ValidationContext } from "../types.js";
import type { Plan, Task } from "../../types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ───────────────────────────────────────────────────────────────────────────────

function createPass(ruleId: string, message?: string): ValidationResult {
  return {
    passed: true,
    ruleId,
    message
  };
}

function createFail(
  ruleId: string,
  severity: "error" | "warning" | "info",
  message: string,
  metadata?: Record<string, unknown>
): ValidationResult {
  return {
    passed: false,
    ruleId,
    severity,
    message,
    metadata
  };
}

interface TaskWithMetadata extends Task {
  metadata?: {
    timeout?: number;
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// 1. Plan Structure Validator
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Validates that a Plan has all required fields.
 *
 * Required fields: id, tasks, taskRunMap, createdAt, updatedAt
 */
export function planStructureValidator(context: ValidationContext): ValidationResult {
  const { plan } = context;

  if (!plan) {
    return createPass("plan-structure", "No plan to validate");
  }

  const requiredFields: (keyof Plan)[] = ["id", "tasks", "taskRunMap", "createdAt", "updatedAt", "metadata"];
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (plan[field] === undefined || plan[field] === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return createFail("plan-structure", "error", `Plan missing required fields: ${missingFields.join(", ")}`, {
      code: "INVALID_PLAN_STRUCTURE",
      missingFields
    });
  }

  if (!Array.isArray(plan.tasks)) {
    return createFail("plan-structure", "error", "Plan tasks must be an array", {
      code: "INVALID_PLAN_STRUCTURE"
    });
  }

  if (typeof plan.taskRunMap !== "object" || plan.taskRunMap === null) {
    return createFail("plan-structure", "error", "Plan taskRunMap must be an object", {
      code: "INVALID_PLAN_STRUCTURE"
    });
  }

  return createPass("plan-structure", "Plan structure is valid");
}

// ───────────────────────────────────────────────────────────────────────────────
// 2. Circular Dependency Validator
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Detects cycles in the task dependency graph using DFS.
 *
 * Returns an error with the cycle path if a circular dependency is detected.
 */
export function circularDependencyValidator(context: ValidationContext): ValidationResult {
  const { plan } = context;

  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    return createPass("no-circular-dep", "No tasks to validate for circular dependencies");
  }

  const taskIds = new Set(plan.tasks.map((t) => t.id));
  const adjacency = new Map<string, string[]>();

  for (const task of plan.tasks) {
    adjacency.set(task.id, task.dependencies.filter((dep) => taskIds.has(dep)));
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(taskId: string, path: string[]): string[] | null {
    if (visiting.has(taskId)) {
      // Found a cycle — extract the cycle portion from the path
      const cycleStart = path.indexOf(taskId);
      return path.slice(cycleStart).concat(taskId);
    }

    if (visited.has(taskId)) {
      return null;
    }

    visiting.add(taskId);
    path.push(taskId);

    const deps = adjacency.get(taskId) ?? [];
    for (const dep of deps) {
      const cycle = dfs(dep, path);
      if (cycle) {
        return cycle;
      }
    }

    path.pop();
    visiting.delete(taskId);
    visited.add(taskId);

    return null;
  }

  for (const task of plan.tasks) {
    const cycle = dfs(task.id, []);
    if (cycle) {
      return createFail("no-circular-dep", "error", `Circular dependency detected: ${cycle.join(" -> ")}`, {
        code: "CIRCULAR_DEPENDENCY",
        cycle
      });
    }
  }

  // Clear state for next call (defensive)
  visiting.clear();
  visited.clear();

  return createPass("no-circular-dep", "No circular dependencies detected");
}

// ───────────────────────────────────────────────────────────────────────────────
// 3. Task Granularity Validator
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Counts the number of sub-steps in a task description.
 *
 * Detects numbered lists, bullet points, and step keywords.
 */
function countSubSteps(description: string): number {
  const stepPatterns = [
    // Numbered lists: "1. ", "2) ", "(3) "
    /^\s*(?:\d+[.\)]\s+|\(\d+\)\s+)/gm,
    // Bullet points: "- ", "* ", "• "
    /^\s*[-*•]\s+/gm,
    // Step keywords: "step 1:", "first,", "second," (case-insensitive)
    /\b(step\s+\d+[.:]|first,|second,|third,|fourth,|fifth,)\b/gi,
  ];

  let count = 0;
  for (const pattern of stepPatterns) {
    const matches = description.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

/**
 * Validates that each task description has reasonable granularity.
 *
 * - Description length > 500 characters: warning TASK_TOO_LARGE
 * - Description length < 10 characters: warning TASK_TOO_SMALL
 * - Sub-steps > 5: warning TASK_TOO_LARGE
 */
export function taskGranularityValidator(context: ValidationContext): ValidationResult {
  const { plan } = context;

  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    return createPass("task-granularity", "No tasks to validate for granularity");
  }

  const issues: Array<{ taskId: string; issue: string; length: number; subSteps: number }> = [];

  for (const task of plan.tasks) {
    const length = task.description?.length ?? 0;
    const subSteps = countSubSteps(task.description ?? "");

    if (length > 500 || subSteps > 5) {
      issues.push({ taskId: task.id, issue: "TASK_TOO_LARGE", length, subSteps });
    } else if (length < 10) {
      issues.push({ taskId: task.id, issue: "TASK_TOO_SMALL", length, subSteps });
    }
  }

  if (issues.length > 0) {
    const messages = issues.map(
      (i) => `${i.taskId}: ${i.issue} (length=${i.length}, subSteps=${i.subSteps})`
    );
    return createFail("task-granularity", "warning", `Task granularity issues: ${messages.join("; ")}`, {
      code: issues.length === 1 ? issues[0].issue : "MULTIPLE_GRANULARITY_ISSUES",
      issues
    });
  }

  return createPass("task-granularity", "All task descriptions have reasonable granularity");
}

// ───────────────────────────────────────────────────────────────────────────────
// 4. Timeout Constraint Validator
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Validates that tasks have reasonable timeout configuration.
 *
 * Warns if a task is missing a timeout or has a timeout value greater than 300.
 */
export function timeoutConstraintValidator(context: ValidationContext): ValidationResult {
  const { plan } = context;

  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    return createPass("timeout-constraint", "No tasks to validate for timeout constraints");
  }

  const issues: Array<{ taskId: string; timeout?: number; reason: string }> = [];

  for (const task of plan.tasks as TaskWithMetadata[]) {
    const timeout = task.metadata?.timeout;

    if (timeout === undefined || timeout === null) {
      issues.push({ taskId: task.id, reason: "missing" });
    } else if (timeout > 300) {
      issues.push({ taskId: task.id, timeout, reason: "too_high" });
    }
  }

  if (issues.length > 0) {
    const hasMissing = issues.some((i) => i.reason === "missing");
    const messages = issues.map((i) => {
      if (i.reason === "missing") {
        return `${i.taskId}: timeout not configured`;
      }
      return `${i.taskId}: timeout=${i.timeout} exceeds maximum of 300`;
    });

    const result: import("../types.js").ValidationResult = {
      passed: false,
      ruleId: "timeout-constraint",
      severity: "warning",
      message: `Timeout constraint issues: ${messages.join("; ")}`,
      metadata: {
        code: "TIMEOUT_NOT_CONFIGURED",
        issues
      }
    };

    if (hasMissing) {
      result.fix = {
        type: "setDefault",
        description: "Set default timeout to 60s",
        payload: { timeout: 60 }
      };
    }

    return result;
  }

  return createPass("timeout-constraint", "All tasks have reasonable timeout configuration");
}

// ───────────────────────────────────────────────────────────────────────────────
// Rule Factories
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Creates a ValidationRule for plan structure validation.
 */
export function createPlanStructureValidator(): import("../types.js").ValidationRule {
  return {
    id: "plan-structure",
    name: "Plan Structure Validator",
    description: "Validates that a Plan has all required fields",
    priority: 100,
    strategy: "block",
    enabled: true,
    execute: planStructureValidator,
  };
}

/**
 * Creates a ValidationRule for circular dependency detection.
 */
export function createCircularDependencyValidator(): import("../types.js").ValidationRule {
  return {
    id: "no-circular-dep",
    name: "Circular Dependency Validator",
    description: "Detects cycles in task dependencies using DFS",
    priority: 90,
    strategy: "block",
    enabled: true,
    execute: circularDependencyValidator,
  };
}

/**
 * Creates a ValidationRule for task granularity validation.
 */
export function createTaskGranularityValidator(): import("../types.js").ValidationRule {
  return {
    id: "task-granularity",
    name: "Task Granularity Validator",
    description: "Checks task descriptions for reasonable length and complexity",
    priority: 50,
    strategy: "warn",
    enabled: true,
    execute: taskGranularityValidator,
  };
}

/**
 * Creates a ValidationRule for timeout constraint validation.
 */
export function createTimeoutConstraintValidator(): import("../types.js").ValidationRule {
  return {
    id: "timeout-constraint",
    name: "Timeout Constraint Validator",
    description: "Validates that tasks have reasonable timeout configuration",
    priority: 40,
    strategy: "autoFix",
    enabled: true,
    execute: timeoutConstraintValidator,
  };
}
