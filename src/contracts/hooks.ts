/**
 * OpenClaw Hook Contracts — PRD §4.2
 *
 * Type definitions for all 12 plugin hooks, including context types,
 * event interfaces, handler signatures, and registry helpers.
 */

import type {
  Task,
  Plan,
  AgentRole,
  PluginConfig,
  ExecutionMetrics,
} from "../types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Minimal OpenClaw SDK stub types (imported as type-only)
// ───────────────────────────────────────────────────────────────────────────────

/** Stub for the OpenClaw API surface exposed to hooks */
export interface OpenClawApi {
  /** Send a message through the gateway */
  sendMessage(msg: unknown): Promise<unknown>;
  /** Access session-scoped key-value store */
  getSessionStore(): Record<string, unknown>;
}

/** Stub for session extension state */
export interface SessionState {
  /** Opaque session identifier */
  sessionId: string;
  /** Arbitrary extension data */
  data: Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────────────────────────
// Base Context Types
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Base context available to every hook.
 * Provides access to the OpenClaw API surface.
 */
export interface HookContext {
  /** Reference to the OpenClaw API */
  api: OpenClawApi;
}

/**
 * Session-related context for hooks that operate within a user session.
 */
export interface SessionContext extends HookContext {
  /** Current session state */
  session: SessionState;
}

/**
 * Plan state context for hooks that need access to the current execution plan.
 */
export interface PlanContext extends SessionContext {
  /** Current plan state from session extensions */
  plan: Plan;
}

// ───────────────────────────────────────────────────────────────────────────────
// Event Interfaces — 12 hooks from PRD §4.2
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Event for `gateway_start` hook — PRD §4.2
 * Fired when the plugin gateway initializes.
 */
export interface GatewayEvent extends HookContext {
  /** Plugin configuration */
  config: PluginConfig;
}

/**
 * Event for `before_agent_reply` hook — PRD §4.2
 * Fired before the agent constructs a reply to the user.
 */
export interface BeforeAgentReplyEvent extends SessionContext {
  /** Raw user request text */
  userRequest: string;
}

/**
 * Event for `before_prompt_build` hook — PRD §4.2
 * Fired before the LLM prompt is assembled.
 */
export interface BeforePromptBuildEvent extends PlanContext {
  /** Additional prompt fragments already accumulated */
  fragments: string[];
}

/**
 * Event for `subagent_delivery_target` hook — PRD §4.2
 * Fired when a task needs to be routed to a subagent.
 */
export interface SubagentDeliveryTargetEvent extends HookContext {
  /** Task being routed */
  task: Task;
  /** Available agent roles */
  agentPool: AgentRole[];
}

/**
 * Event for `subagent_spawning` hook — PRD §4.2
 * Fired just before a subagent process is spawned.
 */
export interface SubagentSpawningEvent extends HookContext {
  /** Unique run identifier for this execution */
  runId: string;
  /** Number of currently running tasks */
  runningCount: number;
  /** Maximum allowed concurrent executions */
  maxConcurrency: number;
}

/**
 * Event for `before_agent_finalize` hook — PRD §4.2
 * Fired before the agent finalizes its response.
 */
export interface BeforeAgentFinalizeEvent extends PlanContext {
  /** Current status of all tasks in the plan */
  taskStatuses: Record<string, Task["status"]>;
}

/**
 * Event for `before_tool_call` hook — PRD §4.2
 * Fired before a tool is invoked.
 */
export interface BeforeToolCallEvent extends HookContext {
  /** Name of the tool being called */
  toolName: string;
  /** Parameters passed to the tool */
  params: Record<string, unknown>;
  /** Unique run identifier */
  runId: string;
}

/**
 * Event for `after_tool_call` hook — PRD §4.2
 * Fired after a tool invocation completes.
 */
export interface AfterToolCallEvent extends HookContext {
  /** Name of the tool that was called */
  toolName: string;
  /** Result returned by the tool (if successful) */
  result?: unknown;
  /** Error message (if the call failed) */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Unique run identifier */
  runId: string;
}

/**
 * Event for `subagent_spawned` hook — PRD §4.2
 * Fired after a subagent process has been spawned.
 */
export interface SubagentSpawnedEvent extends HookContext {
  /** Unique run identifier */
  runId: string;
  /** Task identifier mapped to this run */
  taskId: string;
}

/**
 * Event for `subagent_ended` hook — PRD §4.2
 * Fired after a subagent process terminates.
 */
export interface SubagentEndedEvent extends HookContext {
  /** Unique run identifier */
  runId: string;
  /** Final result or output from the subagent */
  result?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Event for `heartbeat_prompt_contribution` hook — PRD §4.2
 * Fired during heartbeat to collect prompt contributions.
 */
export interface HeartbeatPromptContributionEvent extends PlanContext {
  /** Human-readable summary of current plan execution */
  planSummary: string;
}

/**
 * Event for `agent_end` hook — PRD §4.2
 * Fired when the agent turn ends.
 */
export interface AgentEndEvent extends HookContext {
  /** Collected execution metrics */
  metrics: ExecutionMetrics;
}

// ───────────────────────────────────────────────────────────────────────────────
// Hook Handler Types — sync or async
// ───────────────────────────────────────────────────────────────────────────────

/**
 * `gateway_start` hook — PRD §4.2
 * Priority: 90.  Void return.
 */
export type GatewayStartHook = (event: GatewayEvent) => void | Promise<void>;

/**
 * `gateway_stop` hook — PRD §4.2
 * Priority: 90.  Void return.
 */
export type GatewayStopHook = (event: GatewayEvent) => void | Promise<void>;

/**
 * `before_agent_reply` hook — PRD §4.2
 * Priority: 80.
 * May return a synthetic reply to short-circuit normal processing.
 */
export type BeforeAgentReplyHook = (
  event: BeforeAgentReplyEvent
) =>
  | { syntheticReply?: string }
  | undefined
  | Promise<{ syntheticReply?: string } | undefined>;

/**
 * `before_prompt_build` hook — PRD §4.2
 * Priority: 70.
 * May return context to prepend to the prompt.
 */
export type BeforePromptBuildHook = (
  event: BeforePromptBuildEvent
) =>
  | { prependContext?: string }
  | undefined
  | Promise<{ prependContext?: string } | undefined>;

/**
 * `subagent_delivery_target` hook — PRD §4.2
 * Priority: 70.
 * Must return the target agent identifier.
 */
export type SubagentDeliveryTargetHook = (
  event: SubagentDeliveryTargetEvent
) => { targetAgentId: string } | Promise<{ targetAgentId: string }>;

/**
 * `subagent_spawning` hook — PRD §4.2
 * Priority: 70.
 * May block spawning with an optional reason.
 */
export type SubagentSpawningHook = (
  event: SubagentSpawningEvent
) =>
  | { block?: boolean; reason?: string }
  | undefined
  | Promise<{ block?: boolean; reason?: string } | undefined>;

/**
 * `before_agent_finalize` hook — PRD §4.2
 * Priority: 60.
 * Returns whether to revise or finalize the response.
 */
export type BeforeAgentFinalizeHook = (
  event: BeforeAgentFinalizeEvent
) =>
  | { action: "revise" | "finalize"; reason?: string }
  | Promise<{ action: "revise" | "finalize"; reason?: string }>;

/**
 * `before_tool_call` hook — PRD §4.2
 * Priority: 50.
 * May mutate params, block the call, or require approval.
 */
export type BeforeToolCallHook = (
  event: BeforeToolCallEvent
) =>
  | {
      params?: Record<string, unknown>;
      block?: boolean;
      requireApproval?: boolean;
    }
  | undefined
  | Promise<
      | {
          params?: Record<string, unknown>;
          block?: boolean;
          requireApproval?: boolean;
        }
      | undefined
    >;

/**
 * `after_tool_call` hook — PRD §4.2
 * Priority: 50.  Void return.
 */
export type AfterToolCallHook = (
  event: AfterToolCallEvent
) => void | Promise<void>;

/**
 * `subagent_spawned` hook — PRD §4.2
 * Priority: 50.  Void return.
 */
export type SubagentSpawnedHook = (
  event: SubagentSpawnedEvent
) => void | Promise<void>;

/**
 * `subagent_ended` hook — PRD §4.2
 * Priority: 50.  Void return.
 */
export type SubagentEndedHook = (
  event: SubagentEndedEvent
) => void | Promise<void>;

/**
 * `heartbeat_prompt_contribution` hook — PRD §4.2
 * Priority: 40.
 * May return a contribution string for the heartbeat prompt.
 */
export type HeartbeatPromptContributionHook = (
  event: HeartbeatPromptContributionEvent
) =>
  | { contribution?: string }
  | undefined
  | Promise<{ contribution?: string } | undefined>;

/**
 * `agent_end` hook — PRD §4.2
 * No priority.  Void return.
 */
export type AgentEndHook = (event: AgentEndEvent) => void | Promise<void>;

// ───────────────────────────────────────────────────────────────────────────────
// Registry and Helpers
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Union of all 12 hook names defined in PRD §4.2.
 */
export type HookName =
  | "gateway_start"
  | "gateway_stop"
  | "before_agent_reply"
  | "before_prompt_build"
  | "subagent_delivery_target"
  | "subagent_spawning"
  | "before_agent_finalize"
  | "before_tool_call"
  | "after_tool_call"
  | "subagent_spawned"
  | "subagent_ended"
  | "heartbeat_prompt_contribution"
  | "agent_end";

/**
 * Allowed priority values for hooks, as documented in PRD §4.2.
 *
 * - `90` — Gateway lifecycle hooks (`gateway_start`, `gateway_stop`)
 * - `80` — Agent reply hooks (`before_agent_reply`)
 * - `70` — Prompt build, delivery target, and spawning hooks
 * - `60` — Finalize hooks (`before_agent_finalize`)
 * - `50` — Tool call and subagent lifecycle hooks
 * - `40` — Heartbeat contribution hooks
 */
export type HookPriority = 90 | 80 | 70 | 60 | 50 | 40;

/**
 * Mapped type that associates each hook name with its handler interface.
 * Used by the plugin framework to enforce correct signatures at compile time.
 */
export interface HookRegistry {
  gateway_start: GatewayStartHook;
  gateway_stop: GatewayStopHook;
  before_agent_reply: BeforeAgentReplyHook;
  before_prompt_build: BeforePromptBuildHook;
  subagent_delivery_target: SubagentDeliveryTargetHook;
  subagent_spawning: SubagentSpawningHook;
  before_agent_finalize: BeforeAgentFinalizeHook;
  before_tool_call: BeforeToolCallHook;
  after_tool_call: AfterToolCallHook;
  subagent_spawned: SubagentSpawnedHook;
  subagent_ended: SubagentEndedHook;
  heartbeat_prompt_contribution: HeartbeatPromptContributionHook;
  agent_end: AgentEndHook;
}

/**
 * Metadata attached to a registered hook handler.
 */
export interface HookRegistration<K extends HookName = HookName> {
  /** Hook name */
  name: K;
  /** Handler function */
  handler: HookRegistry[K];
  /** Execution priority (lower numbers run first) */
  priority: HookPriority;
}

/**
 * Register a hook handler with compile-time signature enforcement.
 *
 * @example
 * ```ts
 * const reg = registerHook("before_agent_reply", 80, async (event) => {
 *   if (event.userRequest.includes("urgent")) {
 *     return { syntheticReply: "Urgent request acknowledged." };
 *   }
 * });
 * ```
 */
export function registerHook<K extends HookName>(
  name: K,
  priority: HookPriority,
  handler: HookRegistry[K]
): HookRegistration<K> {
  return { name, priority, handler };
}

/**
 * Factory that creates an empty hook registry map.
 * Returns a mutable `Map` keyed by hook name.
 */
export function createHookRegistry(): Map<HookName, HookRegistration[]> {
  return new Map<HookName, HookRegistration[]>();
}
