/**
 * Validation Rules Framework - Core Types
 *
 * Defines the type system for the validation rules engine.
 * All types are strict TypeScript with zero `any` usage.
 */

import { z } from "zod";
import type { Plan, Task, AgentRole } from "../types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Validation Strategy
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Strategy for handling validation failures.
 * - "block": Stop execution and return error
 * - "warn": Record warning but continue execution
 * - "autoFix": Attempt automatic repair, fall back to warn on failure
 */
export type ValidationStrategy = "block" | "warn" | "autoFix";

// ───────────────────────────────────────────────────────────────────────────────
// Validation Severity
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Severity level of a validation issue.
 */
export type ValidationSeverity = "error" | "warning" | "info";

// ───────────────────────────────────────────────────────────────────────────────
// Fix Action
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Action to take when auto-fixing a validation issue.
 */
export interface FixAction {
  /** Type of fix to apply */
  type: "split" | "merge" | "setDefault" | "reassign" | "suggest";

  /** Human-readable description of the fix */
  description: string;

  /** Optional automated fix data */
  payload?: Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────────────────────────
// Validation Result
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Result from executing a single validation rule.
 */
export interface ValidationResult {
  /** Whether the validation passed */
  passed: boolean;

  /** Unique identifier of the rule that produced this result */
  ruleId: string;

  /** Human-readable message describing the result */
  message?: string;

  /** Severity of the issue (when passed is false) */
  severity?: ValidationSeverity;

  /** Additional metadata about the validation */
  metadata?: Record<string, unknown>;

  /** Optional fix action when auto-fix strategy is used */
  fix?: FixAction;
}

/**
 * Aggregated result from executing multiple validation rules.
 */
export interface ValidationReport {
  /** Whether all rules passed */
  valid: boolean;

  /** Individual results from each rule */
  results: ValidationResult[];

  /** Timestamp when validation was performed */
  timestamp: number;

  /** Duration of validation in milliseconds */
  durationMs: number;
}

// ───────────────────────────────────────────────────────────────────────────────
// Validation Context
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Historical validation record for context access.
 */
export interface ValidationHistoryRecord {
  /** Unique record identifier */
  id: string;

  /** Timestamp of the validation */
  timestamp: number;

  /** Type of validation performed */
  type: "plan" | "task";

  /** Associated plan ID */
  planId?: string;

  /** Associated task ID */
  taskId?: string;

  /** Associated agent ID */
  agentId?: string;

  /** Validation results */
  results: ValidationResult[];
}

/**
 * Context object passed to each validation rule.
 * Provides access to current state and historical data.
 */
export interface ValidationContext {
  /** Current plan being validated (undefined during task-only validation) */
  plan?: Plan;

  /** Current task being validated (undefined during plan-only validation) */
  task?: Task;

  /** Agent assigned to the task (undefined during plan validation) */
  agent?: AgentRole;

  /** Session state object */
  session?: unknown;

  /** Blackboard for shared state */
  blackboard?: Record<string, unknown>;

  /** Historical validation records */
  history: ValidationHistoryRecord[];
}

// ───────────────────────────────────────────────────────────────────────────────
// Validation Rule
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Function signature for a validation rule implementation.
 */
export type ValidationRuleFunction = (context: ValidationContext) => ValidationResult | Promise<ValidationResult>;

/**
 * Definition of a validation rule.
 */
export interface ValidationRule {
  /** Unique rule identifier */
  id: string;

  /** Human-readable rule name */
  name: string;

  /** Rule description */
  description: string;

  /** Execution priority (higher = executed first) */
  priority: number;

  /** Strategy for handling failures */
  strategy: ValidationStrategy;

  /** Rule implementation function */
  execute: ValidationRuleFunction;

  /** Whether the rule is currently enabled */
  enabled: boolean;

  /** Optional timeout in milliseconds (defaults to 5000) */
  timeoutMs?: number;
}

/**
 * Handle returned when registering a rule, used for unregistering.
 */
export interface RuleHandle {
  /** Unique rule identifier */
  ruleId: string;
}

// ───────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Zod schema for ValidationSeverity.
 */
export const ValidationSeveritySchema = z.enum(["error", "warning", "info"]);

/**
 * Zod schema for ValidationStrategy.
 */
export const ValidationStrategySchema = z.enum(["block", "warn", "autoFix"]);

/**
 * Zod schema for FixAction.
 */
export const FixActionSchema = z.object({
  type: z.enum(["split", "merge", "setDefault", "reassign", "suggest"]),
  description: z.string().min(1),
  payload: z.record(z.unknown()).optional()
});

/**
 * Zod schema for ValidationResult.
 */
export const ValidationResultSchema = z.object({
  passed: z.boolean(),
  ruleId: z.string().min(1),
  message: z.string().optional(),
  severity: ValidationSeveritySchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  fix: FixActionSchema.optional()
});

/**
 * Zod schema for ValidationReport.
 */
export const ValidationReportSchema = z.object({
  valid: z.boolean(),
  results: z.array(ValidationResultSchema),
  timestamp: z.number(),
  durationMs: z.number().min(0)
});

/**
 * Zod schema for ValidationHistoryRecord.
 */
export const ValidationHistoryRecordSchema = z.object({
  id: z.string().min(1),
  timestamp: z.number(),
  type: z.enum(["plan", "task"]),
  planId: z.string().optional(),
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  results: z.array(ValidationResultSchema)
});

/**
 * Zod schema for ValidationContext.
 */
export const ValidationContextSchema = z.object({
  plan: z.unknown().optional(),
  task: z.unknown().optional(),
  agent: z.unknown().optional(),
  session: z.unknown().optional(),
  blackboard: z.record(z.unknown()).optional(),
  history: z.array(ValidationHistoryRecordSchema)
});

/**
 * Zod schema for ValidationRule (partial - function types can't be fully validated).
 */
export const ValidationRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().int(),
  strategy: ValidationStrategySchema,
  enabled: z.boolean(),
  timeoutMs: z.number().int().min(1).optional()
});

/**
 * Zod schema for RuleHandle.
 */
export const RuleHandleSchema = z.object({
  ruleId: z.string().min(1)
});

// ───────────────────────────────────────────────────────────────────────────────
// Configuration Types
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for validation history retention.
 */
export interface RetentionConfig {
  /** Maximum age of records (e.g., "7d", "24h") */
  maxAge?: string;

  /** Maximum number of records to keep */
  maxRecords?: number;
}

/**
 * Configuration for the validation framework.
 */
export interface ValidationConfig {
  /** Default timeout for rule execution in milliseconds */
  defaultTimeoutMs: number;

  /** Whether to skip all validations */
  skipValidation: boolean;

  /** History retention configuration */
  retention: RetentionConfig;

  /** IDs of rules that are disabled */
  disabledRules: string[];
}

/**
 * Zod schema for RetentionConfig.
 */
export const RetentionConfigSchema = z.object({
  maxAge: z.string().optional(),
  maxRecords: z.number().int().min(1).optional()
});

/**
 * Zod schema for ValidationConfig.
 */
export const ValidationConfigSchema = z.object({
  defaultTimeoutMs: z.number().int().min(1),
  skipValidation: z.boolean(),
  retention: RetentionConfigSchema,
  disabledRules: z.array(z.string())
});
