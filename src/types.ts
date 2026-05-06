/**
 * OpenSpec-Generated TypeScript Interfaces
 *
 * This file contains type definitions derived from the OpenSpec specification.
 * It serves as a proof-of-concept that TypeScript interfaces can be auto-generated
 * from OpenSpec schema definitions, ensuring type safety and spec-code alignment.
 *
 * Source of truth: openspec/specs/ directory
 * Generation command: scripts/spec-to-types.ts (TODO: implement)
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// Core Domain Types (from openspec/specs/planner/spec.md)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Task status lifecycle
 * @openspec-requirement: FR-PLAN-002, FR-TASK-004
 */
export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

/**
 * Plan execution status
 * @openspec-requirement: FR-PLAN-002
 */
export type PlanStatus = "planning" | "executing" | "reviewing" | "done";

/**
 * Allowed skill values for task assignment
 * @openspec-requirement: FR-PLAN-002
 */
export type Skill = "search" | "browser" | "shell" | "code" | "file";

/**
 * Individual task within a Plan
 * @openspec-requirement: FR-PLAN-002
 * @openspec-scenario: Valid plan generation
 */
export interface Task {
  /** Unique task identifier in task_NNN format */
  id: string;

  /** Human-readable task description (minimum 1 character) */
  description: string;

  /** Required skills from the allowed set */
  skills: Skill[];

  /** IDs of tasks that must complete before this task can run */
  dependencies: string[];

  /** Current execution status */
  status: TaskStatus;

  /** Whether this task requires human approval before execution */
  requiresApproval: boolean;

  /** ID of the agent role assigned to this task */
  assignedAgent?: string;

  /** Execution result or error message */
  result?: string;

  /** Unix timestamp when task started execution */
  startedAt?: number;

  /** Unix timestamp when task completed execution */
  completedAt?: number;

  /** Number of retry attempts (internal tracking) */
  _retryCount?: number;
}

/**
 * Execution plan containing a DAG of tasks
 * @openspec-requirement: FR-PLAN-002, FR-PLAN-003
 * @openspec-scenario: Plan state creation
 */
export interface Plan {
  /** Unique plan identifier */
  id: string;

  /** Current plan execution status */
  status: PlanStatus;

  /** Ordered list of tasks in the plan */
  tasks: Task[];

  /** Mapping of runId to taskId for tracking subagent executions */
  taskRunMap: Record<string, string>;

  /** Unix timestamp when plan was created */
  createdAt: number;

  /** Unix timestamp when plan was last updated */
  updatedAt: number;

  /** Optional metadata for plan-level extensibility */
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Role Types (from openspec/specs/task/spec.md)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Definition of a subagent role with skill assignments
 * @openspec-requirement: FR-TASK-002
 * @openspec-scenario: Role initialization
 */
export interface AgentRole {
  /** Unique agent identifier */
  agentId: string;

  /** Human-readable agent name */
  name: string;

  /** Skills this agent can perform */
  skills: Skill[];

  /** LLM model used by this agent */
  model: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Replanner Types (from openspec/specs/build/spec.md)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Repair strategy for failed tasks
 * @openspec-requirement: FR-BUILD-003
 * @openspec-scenario: Retry strategy, Decompose strategy, Skip strategy, Escalate strategy
 */
export type RepairStrategy = "retry" | "decompose" | "skip" | "escalate";

/**
 * Decision produced by the Replanner for fixing failed tasks
 * @openspec-requirement: FR-BUILD-003
 */
export interface RepairDecision {
  /** Selected repair strategy */
  strategy: RepairStrategy;

  /** New tasks to insert (required for decompose strategy) */
  newTasks?: Task[];

  /** Human-readable explanation for the chosen strategy */
  reason: string;
}

/**
 * Health check result evaluating plan execution status
 * @openspec-requirement: FR-BUILD-003
 * @openspec-scenario: All tasks completed, Failure detection and replanning
 */
export interface HealthCheck {
  /** Whether replanning is required */
  needsReroute: boolean;

  /** List of tasks that have failed */
  failedTasks: Task[];

  /** Explanation for the health check result */
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Monitoring Types (from openspec/specs/monitor/spec.md)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execution progress summary
 * @openspec-requirement: FR-MON-001, FR-MON-002
 * @openspec-scenario: Progress visibility, Active execution heartbeat
 */
export interface Progress {
  /** Total number of tasks in the plan */
  total: number;

  /** Number of completed tasks */
  done: number;

  /** Number of failed tasks */
  failed: number;

  /** Number of pending tasks */
  pending: number;

  /** Number of currently running tasks */
  running: number;
}

/**
 * Execution metrics collected at agent end
 * @openspec-requirement: FR-MON-003
 * @openspec-scenario: Structured metrics
 */
export interface ExecutionMetrics {
  /** Unique run identifier */
  runId: string;

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Whether execution succeeded */
  success: boolean;

  /** Unix timestamp when metrics were recorded */
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Types (from openspec/specs/config/spec.md)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Single classification rule for L1 rule-based classification
 * @openspec-requirement: FR-PLAN-001, FR-CONFIG-003
 */
export interface ClassificationRule {
  /** Regex pattern to match against user requests */
  pattern: string;

  /** Classification result when pattern matches */
  result: "simple" | "complex";
}

/**
 * Metrics output destination
 * @openspec-requirement: FR-BUILD-005, FR-CONFIG-004
 */
export type MetricsOutput = "blackboard" | "webhook" | "otel" | "none";

/**
 * Plugin configuration schema
 * @openspec-requirement: FR-CONFIG-001~004
 * @openspec-scenario: Valid configuration, Custom role override
 */
export interface PluginConfig {
  /** LLM model for plan generation and classification */
  plannerModel: string;

  /** LLM model for replanning decisions */
  replannerModel: string;

  /** Maximum concurrent subagent executions */
  maxConcurrency: number;

  /** Maximum steps per subagent before forced termination */
  maxStepsPerAgent: number;

  /** Whether to bypass complexity classification */
  skipClassification: boolean;

  /** L1 rule cache for fast classification */
  classificationRules: ClassificationRule[];

  /** Metrics output destination */
  metricsOutput: MetricsOutput;

  /** Webhook URL for metrics output (required when metricsOutput is "webhook") */
  metricsWebhook?: string;

  /** OpenTelemetry endpoint for metrics output (required when metricsOutput is "otel") */
  metricsOtelEndpoint?: string;

  /** Custom agent role definitions */
  agentRoles: AgentRole[];

  /** Validation framework configuration */
  validation?: ValidationPluginConfig;
}

/**
 * Validation Plugin Configuration (from plugin.json validation block)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Validation framework configuration as defined in plugin.json
 * @openspec-requirement: FR-CONFIG-004
 */
export interface ValidationPluginConfig {
  /** Whether the validation framework is enabled */
  enabled: boolean;

  /** Default timeout for rule execution in milliseconds */
  defaultTimeoutMs: number;

  /** Whether to skip all validations */
  skipValidation: boolean;

  /** History retention configuration */
  retention: {
    /** Maximum age of records (e.g., "7d", "24h") */
    maxAge?: string;

    /** Maximum number of records to keep */
    maxRecords?: number;
  };

  /** IDs of rules that are disabled */
  disabledRules: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Blackboard Types (from openspec/specs/build/spec.md)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Blackboard configuration for state persistence and metrics
 * @openspec-requirement: FR-BUILD-002, FR-BUILD-005
 */
export interface BlackboardConfig {
  /** Base path for file storage */
  basePath: string;

  /** Metrics output destination */
  metricsOutput?: MetricsOutput;

  /** Webhook URL for metrics (when metricsOutput is "webhook") */
  metricsWebhook?: string;

  /** OpenTelemetry endpoint for metrics (when metricsOutput is "otel") */
  metricsOtelEndpoint?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook Event Types (from PRD §4.2 — referenced in all specs)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard hook handler return type for blocking operations
 * @openspec-requirement: FR-TASK-003, FR-BUILD-001
 */
export interface BlockResult {
  /** Whether to block the operation */
  block: boolean;

  /** Human-readable reason for blocking */
  reason?: string;
}

/**
 * Approval callback resolution values
 * @openspec-requirement: FR-BUILD-004
 * @openspec-scenario: Single approval, Bulk approval, Rejection
 */
export type ApprovalDecision = "approve" | "approveAll" | "reject";

/**
 * Result from before_agent_finalize hook
 * @openspec-requirement: FR-BUILD-003
 * @openspec-scenario: All tasks completed, Failure detection and replanning
 */
export interface FinalizeResult {
  /** Action to take */
  action: "revise" | "finalize";

  /** Explanation for revise action */
  reason?: string;
}

/**
 * Heartbeat contribution payload
 * @openspec-requirement: FR-MON-002
 * @openspec-scenario: Active execution heartbeat
 */
export interface HeartbeatContribution {
  /** Formatted progress summary for heartbeat prompt */
  contribution: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants (from openspec/specs/task/spec.md)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default agent roles as defined in the specification
 * @openspec-requirement: FR-TASK-002
 */
export const DEFAULT_AGENT_ROLES: AgentRole[] = [
  { agentId: "researcher", name: "Researcher", skills: ["search", "browser"], model: "gpt-4o-mini" },
  { agentId: "coder", name: "Coder", skills: ["shell", "code", "file"], model: "gpt-4o" },
  { agentId: "browser", name: "BrowserOperator", skills: ["browser"], model: "gpt-4o-mini" },
  { agentId: "reviewer", name: "Reviewer", skills: ["file", "code"], model: "gpt-4o-mini" }
];

/**
 * Default plugin configuration
 * @openspec-requirement: FR-CONFIG-001
 */
export const DEFAULT_CONFIG: PluginConfig = {
  plannerModel: "gpt-4o-mini",
  replannerModel: "gpt-4o-mini",
  maxConcurrency: 3,
  maxStepsPerAgent: 20,
  skipClassification: false,
  classificationRules: [
    { pattern: "^(hello|hi|hey|你好|您好)", result: "simple" },
    { pattern: "^(what|who|when|where|为什么|什么是)", result: "simple" },
    { pattern: "^(explain|解释|说明).{0,50}$", result: "simple" }
  ],
  metricsOutput: "blackboard",
  metricsWebhook: "",
  metricsOtelEndpoint: "",
  agentRoles: DEFAULT_AGENT_ROLES,
  validation: {
    enabled: true,
    defaultTimeoutMs: 5000,
    skipValidation: false,
    retention: { maxAge: "7d", maxRecords: 1000 },
    disabledRules: []
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Zod Schema Definitions (from openspec/specs/)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Zod schema for Task validation
 * @openspec-requirement: FR-PLAN-002, FR-TASK-004
 */
export const TaskSchema = z.object({
  id: z.string().min(1, "Task id must be non-empty"),
  description: z.string().min(1, "Task description must be non-empty"),
  skills: z.array(z.enum(["search", "browser", "shell", "code", "file"])),
  dependencies: z.array(z.string()),
  status: z.enum(["pending", "running", "done", "failed", "skipped"]),
  requiresApproval: z.boolean(),
  assignedAgent: z.string().optional(),
  result: z.string().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  _retryCount: z.number().optional()
});

/**
 * Zod schema for Plan validation
 * @openspec-requirement: FR-PLAN-002, FR-PLAN-003
 */
export const PlanSchema = z.object({
  id: z.string().min(1, "Plan id must be non-empty"),
  status: z.enum(["planning", "executing", "reviewing", "done"]),
  tasks: z.array(TaskSchema),
  taskRunMap: z.record(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.unknown()).optional()
});

/**
 * Zod schema for AgentRole validation
 * @openspec-requirement: FR-TASK-002
 */
export const AgentRoleSchema = z.object({
  agentId: z.string().min(1, "Agent id must be non-empty"),
  name: z.string().min(1, "Agent name must be non-empty"),
  skills: z.array(z.enum(["search", "browser", "shell", "code", "file"])),
  model: z.string().min(1, "Model must be non-empty")
});

/**
 * Zod schema for RepairDecision validation
 * @openspec-requirement: FR-BUILD-003
 */
export const RepairDecisionSchema = z.object({
  strategy: z.enum(["retry", "decompose", "skip", "escalate"]),
  newTasks: z.array(TaskSchema).optional(),
  reason: z.string().min(1, "Reason must be non-empty")
});

/**
 * Zod schema for HealthCheck validation
 * @openspec-requirement: FR-BUILD-003
 */
export const HealthCheckSchema = z.object({
  needsReroute: z.boolean(),
  failedTasks: z.array(TaskSchema),
  reason: z.string().optional()
});

/**
 * Zod schema for ClassificationRule validation
 * @openspec-requirement: FR-PLAN-001, FR-CONFIG-003
 */
export const ClassificationRuleSchema = z.object({
  pattern: z.string(),
  result: z.enum(["simple", "complex"])
});

/**
 * Zod schema for PluginConfig validation with conditional rules
 * @openspec-requirement: FR-CONFIG-001~004
 */
export const PluginConfigSchema = z
  .object({
    plannerModel: z.string().min(1, "plannerModel must be non-empty"),
    replannerModel: z.string().min(1, "replannerModel must be non-empty"),
    maxConcurrency: z.number().int().min(1, "maxConcurrency must be >= 1"),
    maxStepsPerAgent: z.number().int().min(1, "maxStepsPerAgent must be >= 1"),
    skipClassification: z.boolean(),
    classificationRules: z.array(ClassificationRuleSchema),
    metricsOutput: z.enum(["blackboard", "webhook", "otel", "none"]),
    metricsWebhook: z.string().optional(),
    metricsOtelEndpoint: z.string().optional(),
    agentRoles: z.array(AgentRoleSchema),
    validation: z.object({
      enabled: z.boolean(),
      defaultTimeoutMs: z.number().int().min(1, "defaultTimeoutMs must be >= 1"),
      skipValidation: z.boolean(),
      retention: z.object({
        maxAge: z.string().optional(),
        maxRecords: z.number().int().min(1, "maxRecords must be >= 1").optional()
      }),
      disabledRules: z.array(z.string())
    }).optional()
  })
  .refine(
    (data) => {
      if (data.metricsOutput === "webhook") {
        return data.metricsWebhook !== undefined && data.metricsWebhook.length > 0;
      }
      return true;
    },
    {
      message: "metricsWebhook is required when metricsOutput is 'webhook'",
      path: ["metricsWebhook"]
    }
  )
  .refine(
    (data) => {
      if (data.metricsOutput === "otel") {
        return data.metricsOtelEndpoint !== undefined && data.metricsOtelEndpoint.length > 0;
      }
      return true;
    },
    {
      message: "metricsOtelEndpoint is required when metricsOutput is 'otel'",
      path: ["metricsOtelEndpoint"]
    }
  );

// ═══════════════════════════════════════════════════════════════════════════════
// Inferred Types from Zod Schemas
// ═══════════════════════════════════════════════════════════════════════════════

/** Inferred Task type from Zod schema */
export type TaskZod = z.infer<typeof TaskSchema>;

/** Inferred Plan type from Zod schema */
export type PlanZod = z.infer<typeof PlanSchema>;

/** Inferred AgentRole type from Zod schema */
export type AgentRoleZod = z.infer<typeof AgentRoleSchema>;

/** Inferred RepairDecision type from Zod schema */
export type RepairDecisionZod = z.infer<typeof RepairDecisionSchema>;

/** Inferred HealthCheck type from Zod schema */
export type HealthCheckZod = z.infer<typeof HealthCheckSchema>;

/** Inferred PluginConfig type from Zod schema */
export type PluginConfigZod = z.infer<typeof PluginConfigSchema>;
