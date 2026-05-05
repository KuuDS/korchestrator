/**
 * Validation Rules Framework - Hook Integration
 *
 * Integrates validation rules into OpenClaw's hook system.
 */

import type { ValidationRule, ValidationConfig, ValidationContext } from "./types.js";
import {
  RuleRegistry,
  RuleExecutor,
  ValidationContextBuilder,
} from "./engine.js";
import {
  ValidationHistoryRecorder,
  ValidationStatsCollector,
  readValidationState,
  writeValidationState,
} from "./persistence.js";

// ───────────────────────────────────────────────────────────────────────────────
// Default Rules
// ───────────────────────────────────────────────────────────────────────────────

import {
  createPlanStructureValidator,
  createCircularDependencyValidator,
  createTaskGranularityValidator,
  createTimeoutConstraintValidator,
} from "./rules/plan-rules.js";

import {
  createAgentCapabilityMatcher,
  createAgentLoadBalancer,
  createPriorityAlignmentValidator,
} from "./rules/task-agent-rules.js";

// ───────────────────────────────────────────────────────────────────────────────
// Validation Framework
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Main validation framework that integrates with OpenClaw hooks.
 */
export class ValidationFramework {
  readonly registry: RuleRegistry;
  readonly executor: RuleExecutor;
  readonly recorder: ValidationHistoryRecorder;
  readonly stats: ValidationStatsCollector;
  readonly config: ValidationConfig;

  constructor(config: ValidationConfig) {
    this.config = config;
    this.registry = new RuleRegistry();
    this.executor = new RuleExecutor(this.registry, this.config);
    this.recorder = new ValidationHistoryRecorder();
    this.stats = new ValidationStatsCollector(this.recorder);

    // Register default rules if not skipping validation
    if (!config.skipValidation) {
      this.registerDefaultRules();
    }
  }

  /**
   * Register a custom validation rule.
   */
  registerRule(rule: ValidationRule): { ruleId: string } {
    return this.registry.register(rule);
  }

  /**
   * Unregister a validation rule.
   */
  unregisterRule(handle: { ruleId: string }): void {
    this.registry.unregister(handle);
  }

  /**
   * Enable a previously disabled rule.
   */
  enableRule(ruleId: string): void {
    const rule = this.registry.getRule(ruleId);
    if (rule !== undefined) {
      rule.enabled = true;
    }
  }

  /**
   * Disable a rule.
   */
  disableRule(ruleId: string): void {
    const rule = this.registry.getRule(ruleId);
    if (rule !== undefined) {
      rule.enabled = false;
    }
  }

  /**
   * Validate a plan.
   */
  async validatePlan(context: ValidationContext): Promise<{
    valid: boolean;
    results: import("./types.js").ValidationResult[];
  }> {
    if (this.config.skipValidation) {
      return { valid: true, results: [] };
    }

    const report = await this.executor.execute(context);

    // Record to session if available
    if (context.session !== undefined) {
      const sessionId = this.getSessionId(context.session);
      const planId = context.plan?.id ?? "unknown";
      this.recorder.recordPlanValidation(sessionId, planId, report);

      // Persist to session extension
      const history = this.recorder.getHistory(sessionId);
      writeValidationState(context.session, history);
    }

    return { valid: report.valid, results: report.results };
  }

  /**
   * Validate a task-agent match.
   */
  async validateTaskMatch(context: ValidationContext): Promise<{
    valid: boolean;
    results: import("./types.js").ValidationResult[];
  }> {
    if (this.config.skipValidation) {
      return { valid: true, results: [] };
    }

    const report = await this.executor.execute(context);

    // Record to session if available
    if (context.session !== undefined) {
      const sessionId = this.getSessionId(context.session);
      const taskId = context.task?.id ?? "unknown";
      const agentId = context.agent?.agentId ?? "unknown";
      this.recorder.recordTaskValidation(sessionId, taskId, agentId, report);

      // Persist to session extension
      const history = this.recorder.getHistory(sessionId);
      writeValidationState(context.session, history);
    }

    return { valid: report.valid, results: report.results };
  }

  /**
   * Get validation statistics.
   */
  getStats(sessionId: string): import("./persistence.js").ValidationStats {
    return this.stats.getAllStats(sessionId);
  }

  /**
   * Register all default validation rules.
   */
  private registerDefaultRules(): void {
    const defaults: ValidationRule[] = [
      createPlanStructureValidator(),
      createCircularDependencyValidator(),
      createTaskGranularityValidator(),
      createTimeoutConstraintValidator(),
      createAgentCapabilityMatcher(),
      createAgentLoadBalancer(),
      createPriorityAlignmentValidator(),
    ];

    for (const rule of defaults) {
      try {
        this.registry.register(rule);
      } catch {
        // Rule might already be registered, skip
      }
    }
  }

  /**
   * Extract a session ID from a session object.
   */
  private getSessionId(session: unknown): string {
    if (session === null || session === undefined) {
      return "default";
    }

    const s = session as Record<string, unknown>;
    if (typeof s.id === "string") {
      return s.id;
    }
    if (
      typeof s.data === "object" &&
      s.data !== null &&
      typeof (s.data as Record<string, unknown>).id === "string"
    ) {
      return (s.data as Record<string, unknown>).id as string;
    }
    return "default";
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Hook Handlers
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Create a before_agent_reply hook handler that validates plans.
 *
 * @param framework - The validation framework instance
 * @returns Hook handler function
 */
export function createPlanValidationHook(
  framework: ValidationFramework
): (context: { session?: unknown; plan?: unknown }) => Promise<{
  block: boolean;
  reason?: string;
}> {
  return async (context: {
    session?: unknown;
    plan?: unknown;
  }): Promise<{ block: boolean; reason?: string }> => {
    if (framework.config.skipValidation) {
      return { block: false };
    }

    const session = context.session;
    const plan = context.plan as import("../types.js").Plan | undefined;

    if (plan === undefined) {
      return { block: false };
    }

    // Load history from session
    const history = session !== undefined ? readValidationState(session) : [];

    const validationContext = ValidationContextBuilder.forPlan(
      plan,
      session,
      {},
      history
    );

    const result = await framework.validatePlan(validationContext);

    if (!result.valid) {
      const errors = result.results
        .filter((r) => !r.passed && r.severity === "error")
        .map((r) => r.message ?? r.ruleId)
        .join("; ");

      if (errors.length > 0) {
        return { block: true, reason: `Plan validation failed: ${errors}` };
      }
    }

    return { block: false };
  };
}

/**
 * Create a subagent_delivery_target hook handler that validates task-agent matching.
 *
 * @param framework - The validation framework instance
 * @returns Hook handler function
 */
export function createTaskValidationHook(
  framework: ValidationFramework
): (context: {
  session?: unknown;
  task?: unknown;
  agent?: unknown;
  plan?: unknown;
}) => Promise<{ block: boolean; reason?: string }> {
  return async (context: {
    session?: unknown;
    task?: unknown;
    agent?: unknown;
    plan?: unknown;
  }): Promise<{ block: boolean; reason?: string }> => {
    if (framework.config.skipValidation) {
      return { block: false };
    }

    const session = context.session;
    const task = context.task as import("../types.js").Task | undefined;
    const agent = context.agent as import("../types.js").AgentRole | undefined;
    const plan = context.plan as import("../types.js").Plan | undefined;

    if (task === undefined || agent === undefined) {
      return { block: false };
    }

    // Load history from session
    const history = session !== undefined ? readValidationState(session) : [];

    const validationContext = ValidationContextBuilder.forTask(
      task,
      agent,
      plan,
      session,
      {},
      history
    );

    const result = await framework.validateTaskMatch(validationContext);

    if (!result.valid) {
      const errors = result.results
        .filter((r) => !r.passed && r.severity === "error")
        .map((r) => r.message ?? r.ruleId)
        .join("; ");

      if (errors.length > 0) {
        return {
          block: true,
          reason: `Task-Agent validation failed: ${errors}`,
        };
      }
    }

    return { block: false };
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Factory Function
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Create a default validation framework with the given configuration.
 */
export function createValidationFramework(
  config?: Partial<ValidationConfig>
): ValidationFramework {
  const fullConfig: ValidationConfig = {
    defaultTimeoutMs: 5000,
    skipValidation: false,
    retention: {},
    disabledRules: [],
    ...config,
  };

  return new ValidationFramework(fullConfig);
}
