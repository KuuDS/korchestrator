/**
 * Validation Rules Framework - Rule Engine
 *
 * Core engine for registering, orchestrating, and executing validation rules.
 */

import type {
  ValidationRule,
  ValidationContext,
  ValidationResult,
  ValidationReport,
  RuleHandle,
  ValidationConfig,
} from "./types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Custom Errors
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Error thrown when attempting to register a rule with a duplicate ID.
 */
export class DuplicateRuleIdError extends Error {
  constructor(ruleId: string) {
    super(`Rule with id "${ruleId}" is already registered`);
    this.name = "DuplicateRuleIdError";
  }
}

/**
 * Error thrown when a rule is not found.
 */
export class RuleNotFoundError extends Error {
  constructor(ruleId: string) {
    super(`Rule with id "${ruleId}" not found`);
    this.name = "RuleNotFoundError";
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// RuleRegistry
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Registry for managing validation rules.
 * Rules are stored in a Map and sorted by priority when retrieved.
 */
export class RuleRegistry {
  private readonly rules: Map<string, ValidationRule> = new Map();

  /**
   * Register a new validation rule.
   *
   * @param rule - The rule to register
   * @returns A handle for unregistering the rule
   * @throws {DuplicateRuleIdError} If a rule with the same ID already exists
   */
  register(rule: ValidationRule): RuleHandle {
    if (this.rules.has(rule.id)) {
      throw new DuplicateRuleIdError(rule.id);
    }
    this.rules.set(rule.id, rule);
    return { ruleId: rule.id };
  }

  /**
   * Unregister a validation rule.
   *
   * @param handle - The handle returned by register()
   * @throws {RuleNotFoundError} If the rule is not found
   */
  unregister(handle: RuleHandle): void {
    if (!this.rules.has(handle.ruleId)) {
      throw new RuleNotFoundError(handle.ruleId);
    }
    this.rules.delete(handle.ruleId);
  }

  /**
   * Get a rule by its ID.
   *
   * @param ruleId - The rule ID
   * @returns The rule or undefined if not found
   */
  getRule(ruleId: string): ValidationRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all registered rules sorted by priority (highest first).
   *
   * @returns Array of rules sorted by priority descending
   */
  getAllRules(): ValidationRule[] {
    return Array.from(this.rules.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get all enabled rules sorted by priority.
   *
   * @returns Array of enabled rules sorted by priority descending
   */
  getEnabledRules(): ValidationRule[] {
    return this.getAllRules().filter((rule) => rule.enabled);
  }

  /**
   * Check if a rule with the given ID exists.
   *
   * @param ruleId - The rule ID to check
   * @returns true if the rule exists
   */
  hasRule(ruleId: string): boolean {
    return this.rules.has(ruleId);
  }

  /**
   * Get the total number of registered rules.
   */
  get size(): number {
    return this.rules.size;
  }

  /**
   * Clear all registered rules.
   */
  clear(): void {
    this.rules.clear();
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Fix Application
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Apply an automatic fix action to the validation context.
 *
 * @param fix - The fix action to apply
 * @param context - The validation context to mutate
 * @returns true if the fix was applied successfully
 */
function applyFix(fix: import("./types.js").FixAction, context: ValidationContext): boolean {
  try {
    switch (fix.type) {
      case "setDefault": {
        // Set a default value on task metadata
        const task = context.task as Record<string, unknown> | undefined;
        if (task !== undefined && fix.payload !== undefined) {
          const metadata = (task.metadata as Record<string, unknown> | undefined) ?? {};
          for (const [key, value] of Object.entries(fix.payload)) {
            metadata[key] = value;
          }
          task.metadata = metadata;
        }
        return true;
      }
      case "suggest": {
        // Suggestion fixes are informational only, no mutation
        return true;
      }
      case "split":
      case "merge":
      case "reassign": {
        // Complex fixes require external handling; mark as applied
        // The caller should inspect the fix payload and take action
        return true;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Timeout Wrapper
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Execute a function with a timeout.
 *
 * @param fn - The function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param ruleId - Rule ID for error messaging
 * @returns The function result or a timeout error result
 */
async function executeWithTimeout(
  fn: () => Promise<ValidationResult>,
  timeoutMs: number,
  ruleId: string
): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        passed: false,
        ruleId,
        message: `Rule execution timeout (${timeoutMs}ms)`,
        severity: "warning",
        metadata: { timedOut: true, timeoutMs },
      });
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        const message = err instanceof Error ? err.message : String(err);
        resolve({
          passed: false,
          ruleId,
          message: `Rule execution error: ${message}`,
          severity: "error",
          metadata: { error: true },
        });
      });
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// RuleExecutor
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Executes validation rules according to their strategies.
 * Supports block, warn, and autoFix strategies.
 */
export class RuleExecutor {
  private readonly registry: RuleRegistry;
  private readonly config: ValidationConfig;

  /**
   * Create a new RuleExecutor.
   *
   * @param registry - The rule registry
   * @param config - Validation configuration
   */
  constructor(registry: RuleRegistry, config: ValidationConfig) {
    this.registry = registry;
    this.config = config;
  }

  /**
   * Execute all enabled rules against the given context.
   * Rules are executed in priority order (highest first).
   *
   * @param context - The validation context
   * @returns A validation report with all results
   */
  async execute(context: ValidationContext): Promise<ValidationReport> {
    const startTime = Date.now();
    const results: ValidationResult[] = [];
    const rules = this.registry.getEnabledRules();

    for (const rule of rules) {
      // Skip disabled rules
      if (this.config.disabledRules.includes(rule.id)) {
        continue;
      }

      const timeoutMs = rule.timeoutMs ?? this.config.defaultTimeoutMs;

      try {
        const result = await executeWithTimeout(
          () => Promise.resolve(rule.execute(context)),
          timeoutMs,
          rule.id
        );

        results.push(result);

        // Handle strategy
        if (!result.passed) {
          if (rule.strategy === "block") {
            // Stop execution immediately
            break;
          } else if (rule.strategy === "autoFix" && result.fix !== undefined) {
            // Attempt to apply the fix
            const fixApplied = applyFix(result.fix, context);
            result.metadata = {
              ...result.metadata,
              fixApplied,
              fixType: result.fix.type,
            };
            result.severity = result.severity ?? "warning";
            // Continue execution after attempting fix
          }
          // "warn" strategy: continue to next rule
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          passed: false,
          ruleId: rule.id,
          message: `Unexpected error: ${message}`,
          severity: "error",
        });

        if (rule.strategy === "block") {
          break;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const valid = results.every((r) => r.passed);

    return {
      valid,
      results,
      timestamp: startTime,
      durationMs,
    };
  }

  /**
   * Execute a single rule by ID.
   *
   * @param ruleId - The rule ID to execute
   * @param context - The validation context
   * @returns The validation result
   * @throws {RuleNotFoundError} If the rule is not found
   */
  async executeRule(ruleId: string, context: ValidationContext): Promise<ValidationResult> {
    const rule = this.registry.getRule(ruleId);
    if (rule === undefined) {
      throw new RuleNotFoundError(ruleId);
    }

    const timeoutMs = rule.timeoutMs ?? this.config.defaultTimeoutMs;

    return executeWithTimeout(
      () => Promise.resolve(rule.execute(context)),
      timeoutMs,
      rule.id
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// ValidationContextBuilder
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Builder for constructing validation contexts.
 */
export class ValidationContextBuilder {
  private context: ValidationContext = {
    history: [],
  };

  /**
   * Set the plan in the context.
   */
  withPlan(plan: ValidationContext["plan"]): this {
    this.context = { ...this.context, plan };
    return this;
  }

  /**
   * Set the task in the context.
   */
  withTask(task: ValidationContext["task"]): this {
    this.context = { ...this.context, task };
    return this;
  }

  /**
   * Set the agent in the context.
   */
  withAgent(agent: ValidationContext["agent"]): this {
    this.context = { ...this.context, agent };
    return this;
  }

  /**
   * Set the session in the context.
   */
  withSession(session: unknown): this {
    this.context = { ...this.context, session };
    return this;
  }

  /**
   * Set the blackboard in the context.
   */
  withBlackboard(blackboard: Record<string, unknown>): this {
    this.context = { ...this.context, blackboard };
    return this;
  }

  /**
   * Set the history in the context.
   */
  withHistory(history: ValidationContext["history"]): this {
    this.context = { ...this.context, history };
    return this;
  }

  /**
   * Build the validation context.
   */
  build(): ValidationContext {
    return { ...this.context };
  }

  /**
   * Create a context for plan validation.
   */
  static forPlan(
    plan: ValidationContext["plan"],
    session: unknown,
    blackboard: Record<string, unknown>,
    history: ValidationContext["history"]
  ): ValidationContext {
    return new ValidationContextBuilder()
      .withPlan(plan)
      .withSession(session)
      .withBlackboard(blackboard)
      .withHistory(history)
      .build();
  }

  /**
   * Create a context for task validation.
   */
  static forTask(
    task: ValidationContext["task"],
    agent: ValidationContext["agent"],
    plan: ValidationContext["plan"],
    session: unknown,
    blackboard: Record<string, unknown>,
    history: ValidationContext["history"]
  ): ValidationContext {
    return new ValidationContextBuilder()
      .withTask(task)
      .withAgent(agent)
      .withPlan(plan)
      .withSession(session)
      .withBlackboard(blackboard)
      .withHistory(history)
      .build();
  }
}
