import { readFileSync } from "node:fs";
import { ConfigManager, type ConfigDiff } from "./config.js";
import { watchConfig } from "./config-loader.js";
import { type PluginConfig, DEFAULT_CONFIG, PluginConfigSchema, PlanSchema } from "./types.js";
import { Blackboard } from "./blackboard.js";
import { Planner, type GenerateFn } from "./planner.js";
import { Replanner } from "./replanner.js";
import { TaskRouter } from "./router.js";
import { createLlmClient } from "./llm.js";
import type {
  BeforeAgentReplyEvent,
  BeforePromptBuildEvent,
  BeforeAgentFinalizeEvent,
  HeartbeatPromptContributionEvent,
  BeforeToolCallEvent,
  OpenClawApi,
} from "./contracts/hooks.js";
import {
  ValidationFramework,
  createPlanValidationHook,
  createTaskValidationHook,
  createValidationFramework,
} from "./validation/hooks.js";
import type { ValidationRule } from "./validation/types.js";

/**
 * Legacy hook context provided by the mock gateway.
 * Kept for backward compatibility with existing tests and old handlers.
 * @deprecated Use OpenClaw event types from contracts/hooks.ts instead.
 */
export interface HookContext {
  /** Path to the plugin configuration file */
  configPath?: string;
  /** Logger instance */
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
    warn: (msg: string) => void;
  };
  /** Register a hook handler */
  registerHook: (
    event: string,
    handler: (ctx: HookContext) => Promise<void> | void,
    priority: number
  ) => void;
  /** Persisted session state */
  sessionState?: Record<string, unknown>;
  /** Allow arbitrary properties for event bridging */
  [key: string]: unknown;
}

/**
 * Plugin entry definition conforming to OpenClaw SDK contract.
 */
export interface PluginEntry {
  id: string;
  name: string;
  register(api: OpenClawApi): void;
  allowConversationAccess: boolean;
}

let configManager: ConfigManager | null = null;
let watcherHandle: { stop: () => void } | null = null;
let activePlans: string[] = [];
let blackboard: Blackboard | null = null;
let planner: Planner | null = null;
let taskRouter: TaskRouter | null = null;
let replanner: Replanner | null = null;
let validationFramework: ValidationFramework | null = null;

/**
 * Get the global ConfigManager instance.
 * Creates one if it does not exist.
 */
export function getConfigManager(): ConfigManager {
  if (configManager === null) {
    configManager = new ConfigManager();
  }
  return configManager;
}

/**
 * Set the global ConfigManager instance (useful for testing).
 */
export function setConfigManager(cm: ConfigManager | null): void {
  configManager = cm;
}

/**
 * Get the global Blackboard instance.
 */
export function getBlackboard(): Blackboard | null {
  return blackboard;
}

/**
 * Set the global Blackboard instance (useful for testing).
 */
export function setBlackboard(bb: Blackboard | null): void {
  blackboard = bb;
}

/**
 * Get the global Planner instance.
 */
export function getPlanner(): Planner | null {
  return planner;
}

/**
 * Set the global Planner instance (useful for testing).
 */
export function setPlanner(p: Planner | null): void {
  planner = p;
}

/**
 * Get the global TaskRouter instance.
 */
export function getTaskRouter(): TaskRouter | null {
  return taskRouter;
}

/**
 * Set the global TaskRouter instance (useful for testing).
 */
export function setTaskRouter(tr: TaskRouter | null): void {
  taskRouter = tr;
}

/**
 * Get the global Replanner instance.
 */
export function getReplanner(): Replanner | null {
  return replanner;
}

/**
 * Set the global Replanner instance (useful for testing).
 */
export function setReplanner(r: Replanner | null): void {
  replanner = r;
}

/**
 * Get the global ValidationFramework instance.
 */
export function getValidationFramework(): ValidationFramework | null {
  return validationFramework;
}

/**
 * Set the global ValidationFramework instance (useful for testing).
 */
export function setValidationFramework(vf: ValidationFramework | null): void {
  validationFramework = vf;
}

/**
 * Register a custom validation rule.
 */
export function registerValidationRule(rule: ValidationRule): { ruleId: string } {
  const vf = getValidationFramework();
  if (vf === null) {
    throw new Error("ValidationFramework not initialized");
  }
  return vf.registerRule(rule);
}

/**
 * Validate a plan using the active validation framework.
 */
export async function validatePlan(
  session: unknown,
  plan: import("./types.js").Plan
): Promise<{ valid: boolean; results: import("./validation/types.js").ValidationResult[] }> {
  const vf = getValidationFramework();
  if (vf === null) {
    throw new Error("ValidationFramework not initialized");
  }
  const { ValidationContextBuilder } = await import("./validation/engine.js");
  const history: import("./validation/types.js").ValidationHistoryRecord[] = [];
  const context = ValidationContextBuilder.forPlan(plan, session, {}, history);
  return vf.validatePlan(context);
}

/**
 * Validate a task-agent match using the active validation framework.
 */
export async function validateTaskMatch(
  session: unknown,
  task: import("./types.js").Task,
  agent: import("./types.js").AgentRole,
  plan?: import("./types.js").Plan
): Promise<{ valid: boolean; results: import("./validation/types.js").ValidationResult[] }> {
  const vf = getValidationFramework();
  if (vf === null) {
    throw new Error("ValidationFramework not initialized");
  }
  const { ValidationContextBuilder } = await import("./validation/engine.js");
  const history: import("./validation/types.js").ValidationHistoryRecord[] = [];
  const context = ValidationContextBuilder.forTask(task, agent, plan, session, {}, history);
  return vf.validateTaskMatch(context);
}

/**
 * Get the list of active plan IDs (for preserving across reloads).
 */
export function getActivePlans(): string[] {
  return activePlans;
}

/**
 * Set the list of active plan IDs.
 */
export function setActivePlans(plans: string[]): void {
  activePlans = plans;
}

/**
 * Log a message using the context logger or fallback to console.
 */
function log(ctx: HookContext, level: "info" | "error" | "warn", message: string): void {
  if (ctx.logger !== undefined) {
    ctx.logger[level](message);
  } else {
    console[level](`[plan-subagent] ${message}`);
  }
}

/**
 * Initialize or reinitialize all plugin components with the given config.
 */
async function initializeComponents(config: PluginConfig, ctx: HookContext): Promise<void> {
  const bb = new Blackboard({
    basePath: "./workspace",
    metricsOutput: config.metricsOutput,
    metricsWebhook: config.metricsWebhook,
    metricsOtelEndpoint: config.metricsOtelEndpoint,
  });
  setBlackboard(bb);
  log(ctx, "info", "Blackboard initialized");

  // Create Planner with config-derived settings
  const apiKey = process.env.MOONSHOT_API_KEY;
  const plannerGenerate: GenerateFn = apiKey
    ? createLlmClient({ apiKey, model: config.plannerModel, logger: ctx.logger })
    : async (prompt: string) => {
        log(ctx, "warn", `MOONSHOT_API_KEY not set. Planner LLM generate fallback. Prompt length: ${prompt.length}`);
        return "complex";
      };
  const pl = new Planner(
    {
      model: config.plannerModel,
      maxTasks: 20,
      classificationRules: config.classificationRules,
      skipClassification: config.skipClassification,
    },
    plannerGenerate
  );
  setPlanner(pl);
  log(ctx, "info", "Planner initialized");

  // Instantiate TaskRouter with config-derived settings
  const tr = new TaskRouter({
    maxConcurrency: config.maxConcurrency,
    agentPool: config.agentRoles,
  });
  setTaskRouter(tr);
  log(ctx, "info", `TaskRouter initialized with maxConcurrency=${config.maxConcurrency}`);

  // Instantiate Replanner with config-derived settings
  const replannerGenerate = apiKey
    ? createLlmClient({ apiKey, model: config.replannerModel, logger: ctx.logger })
    : async (prompt: string) => {
        log(ctx, "warn", `MOONSHOT_API_KEY not set. Replanner LLM generate fallback. Prompt length: ${prompt.length}`);
        return JSON.stringify({ strategy: "retry", reason: "Default fallback" });
      };
  const rp = new Replanner({
    model: config.replannerModel,
    maxRetries: 3,
    generate: replannerGenerate,
  });
  setReplanner(rp);
  log(ctx, "info", "Replanner initialized");

  // Initialize Validation Framework
  const validationCfg = config.validation;
  const vf = createValidationFramework({
    defaultTimeoutMs: validationCfg?.defaultTimeoutMs ?? 5000,
    skipValidation: validationCfg?.skipValidation ?? false,
    retention: validationCfg?.retention ?? { maxAge: "7d", maxRecords: 1000 },
    disabledRules: validationCfg?.disabledRules ?? [],
  });
  setValidationFramework(vf);
  log(ctx, "info", "ValidationFramework initialized with default rules");
}

/**
 * Handle gateway_start: load and validate config, start file watcher,
 * instantiate the Blackboard, and create the Planner.
 */
async function handleGatewayStart(ctx: HookContext): Promise<void> {
  const cm = getConfigManager();
  const configPath = ctx.configPath ?? "./plugin.json";

  try {
    await cm.load(configPath);
    log(ctx, "info", `Config loaded successfully from ${configPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `Failed to load config: ${msg}. Using default config.`);
    cm.setConfig(DEFAULT_CONFIG);
  }

  const config = cm.getConfig();
  await initializeComponents(config, ctx);

  // Start watching for config changes if not already watching
  if (watcherHandle === null) {
    watcherHandle = watchConfig(configPath, () => {
      void handleConfigChange(ctx);
    });
    log(ctx, "info", `Started watching config file: ${configPath}`);
  }
}

/**
 * Handle gateway_stop: stop file watcher, persist active plans.
 */
async function handleGatewayStop(ctx: HookContext): Promise<void> {
  if (watcherHandle !== null) {
    watcherHandle.stop();
    watcherHandle = null;
    log(ctx, "info", "Stopped config file watcher");
  }

  // Persist active plans to session state if available
  if (ctx.sessionState !== undefined && activePlans.length > 0) {
    ctx.sessionState.activePlans = [...activePlans];
    log(ctx, "info", `Persisted ${activePlans.length} active plans to session state`);
  }
}

/**
 * Handle config file change: perform differentiated reload.
 */
async function handleConfigChange(ctx: HookContext): Promise<void> {
  const cm = getConfigManager();
  const configPath = ctx.configPath ?? "./plugin.json";
  let oldConfig: PluginConfig;
  try {
    oldConfig = cm.getConfig();
  } catch {
    log(ctx, "warn", "No cached config available, loading fresh");
    try {
      await cm.load(configPath);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(ctx, "error", `Config reload failed: ${msg}`);
      return;
    }
  }

  try {
    await cm.load(configPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `Config reload failed: ${msg}`);
    return;
  }

  let newConfig: PluginConfig;
  try {
    newConfig = cm.getConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `Failed to get cached config after reload: ${msg}`);
    return;
  }

  const diff: ConfigDiff = cm.diffConfig(oldConfig, newConfig);
  if (diff.changedFields.length === 0) {
    log(ctx, "info", "Config file changed but no effective differences detected");
    return;
  }

  log(ctx, "info", `Config changed fields: ${diff.changedFields.join(", ")}`);

  // Trigger gateway_stop sequence
  await handleGatewayStop(ctx);

  // Apply differentiated reload strategies
  if (diff.plannerModelChanged) {
    log(ctx, "info", `Planner model updated to: ${newConfig.plannerModel}`);
  }
  if (diff.replannerModelChanged) {
    log(ctx, "info", `Replanner model updated to: ${newConfig.replannerModel}`);
  }
  if (diff.maxConcurrencyChanged) {
    log(ctx, "info", `Max concurrency updated to: ${newConfig.maxConcurrency}`);
  }
  if (diff.agentRolesChanged) {
    log(ctx, "info", `Agent roles updated: ${newConfig.agentRoles.length} roles`);
  }
  if (diff.classificationRulesChanged) {
    log(ctx, "info", "Classification rules changed — clearing rule cache");
  }
  if (diff.skipClassificationChanged) {
    log(ctx, "info", `skipClassification toggled to: ${newConfig.skipClassification}`);
  }

  // Re-initialize all components with new config
  await initializeComponents(newConfig, ctx);

  // Preserve active plans during reload
  if (activePlans.length > 0) {
    log(ctx, "info", `Preserving ${activePlans.length} active plans during reload`);
  }

  // Restart watcher
  if (watcherHandle === null) {
    watcherHandle = watchConfig(configPath, () => {
      void handleConfigChange(ctx);
    });
    log(ctx, "info", `Restarted config file watcher: ${configPath}`);
  }
}

/**
 * Handle before_agent_reply (priority 80): classify user request complexity.
 * If the request is simple, no plan is created. If complex, a plan is generated
 * and stored in session state.
 */
export async function handleBeforeAgentReply(ctx: HookContext): Promise<void> {
  const pl = getPlanner();
  if (pl === null) {
    log(ctx, "warn", "Planner not initialized, skipping before_agent_reply");
    return;
  }

  const event = ctx as unknown as BeforeAgentReplyEvent;
  const request = event.userRequest;
  if (request === undefined || request.length === 0) {
    return;
  }

  try {
    const classification = await pl.classify(request);
    log(ctx, "info", `Request classified as: ${classification}`);

    if (classification === "complex") {
      const plan = await pl.createPlan(request);
      log(ctx, "info", `Created plan ${plan.id} with ${plan.tasks.length} tasks`);

      // Store plan in session state
      if (event.session !== undefined) {
        pl.writePlanState(event.session, plan);
      }

      // Track active plan
      activePlans.push(plan.id);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `Classification/planning failed: ${msg}`);
  }
}

/**
 * Handle before_prompt_build (priority 70): inject plan context into the prompt.
 * If a plan exists in session state, serializes it to Markdown and prepends.
 */
export async function handleBeforePromptBuild(ctx: HookContext): Promise<void> {
  const pl = getPlanner();
  if (pl === null) {
    log(ctx, "warn", "Planner not initialized, skipping before_prompt_build");
    return;
  }

  const event = ctx as unknown as BeforePromptBuildEvent;
  if (event.session === undefined || event.plan === undefined) {
    return;
  }

  try {
    const storedPlan = pl.readPlanState(event.session);
    if (storedPlan !== null) {
      const markdown = pl.toMarkdown(storedPlan);
      log(ctx, "info", `Injecting plan ${storedPlan.id} into prompt`);

      // The hook contract allows returning { prependContext: string }
      // We attach it to the context for the gateway to pick up
      const extendedCtx = ctx as unknown as Record<string, unknown>;
      extendedCtx.prependContext = markdown;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `Prompt build injection failed: ${msg}`);
  }
}

/**
 * Handle heartbeat_prompt_contribution (priority 40): return plan progress
 * contribution when a plan is executing.
 */
async function handleHeartbeatPromptContribution(ctx: HookContext): Promise<void> {
  const pl = getPlanner();
  if (pl === null) {
    return;
  }

  const event = ctx as unknown as HeartbeatPromptContributionEvent;
  const session = event.session;
  if (session === undefined) {
    return;
  }

  const plan = pl.readPlanState(session);
  if (plan === null) {
    const extendedCtx = ctx as unknown as Record<string, unknown>;
    extendedCtx.contribution = "";
    return;
  }

  const tr = getTaskRouter();
  if (tr === null) {
    return;
  }

  const progress = tr.getProgress(plan);
  const contribution = `Plan execution progress: ${progress.done}/${progress.total} completed, ${progress.failed} failed, ${progress.running} running, ${progress.pending} pending.`;

  const extendedCtx = ctx as unknown as Record<string, unknown>;
  extendedCtx.contribution = contribution;
  log(ctx, "info", `Heartbeat contribution for plan ${plan.id}: ${contribution}`);
}

/**
 * Handle subagent_delivery_target (priority 70): route task to best-matching agent.
 */
async function handleSubagentDeliveryTarget(ctx: HookContext): Promise<void> {
  const tr = getTaskRouter();
  if (tr === null) {
    log(ctx, "warn", "TaskRouter not initialized, skipping subagent_delivery_target");
    return;
  }

  const extendedCtx = ctx as unknown as Record<string, unknown>;
  const task = extendedCtx.task as import("./types.js").Task | undefined;
  if (task === undefined) {
    log(ctx, "warn", "No task provided for subagent_delivery_target");
    return;
  }

  try {
    const agent = tr.routeBySkill(task);
    log(ctx, "info", `Routed task ${task.id} to agent ${agent.agentId}`);
    extendedCtx.targetAgentId = agent.agentId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `Task routing failed: ${msg}`);
  }
}

/**
 * Handle subagent_spawning (priority 70): enforce concurrency limits.
 */
async function handleSubagentSpawning(ctx: HookContext): Promise<void> {
  const tr = getTaskRouter();
  if (tr === null) {
    log(ctx, "warn", "TaskRouter not initialized, skipping subagent_spawning");
    return;
  }

  const extendedCtx = ctx as unknown as Record<string, unknown>;
  const plan = extendedCtx.plan as import("./types.js").Plan | undefined;
  if (plan === undefined) {
    log(ctx, "warn", "No plan provided for subagent_spawning");
    return;
  }

  try {
    const result = tr.checkConcurrency(plan);
    if (result.block) {
      log(ctx, "info", `Blocked spawn: ${result.reason ?? "unknown reason"}`);
      extendedCtx.block = true;
      extendedCtx.reason = result.reason;
    } else {
      extendedCtx.block = false;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `Concurrency check failed: ${msg}`);
    extendedCtx.block = true;
    extendedCtx.reason = msg;
  }
}

/**
 * Handle before_tool_call (priority 50): log and optionally validate tool calls.
 */
async function handleBeforeToolCall(ctx: HookContext): Promise<void> {
  const event = ctx as unknown as BeforeToolCallEvent;
  const { toolName, params, runId } = event;

  if (typeof toolName === "string" && typeof runId === "string") {
    log(ctx, "info", `Before tool call: ${toolName} (runId=${runId})`);
    if (params !== undefined && typeof params === "object") {
      log(ctx, "info", `Tool params: ${JSON.stringify(params)}`);
    }
  }
}

/**
 * Handle subagent_spawned (priority 50): track lifecycle start.
 */
async function handleSubagentSpawned(ctx: HookContext): Promise<void> {
  const tr = getTaskRouter();
  if (tr === null) {
    log(ctx, "warn", "TaskRouter not initialized, skipping subagent_spawned");
    return;
  }

  const extendedCtx = ctx as unknown as Record<string, unknown>;
  const runId = extendedCtx.runId;
  const taskId = extendedCtx.taskId;
  const plan = extendedCtx.plan as import("./types.js").Plan | undefined;

  if (
    typeof runId !== "string" ||
    typeof taskId !== "string" ||
    plan === undefined
  ) {
    log(ctx, "warn", "Missing runId, taskId, or plan for subagent_spawned");
    return;
  }

  try {
    await tr.trackLifecycle({ type: "spawned", runId, taskId }, plan);
    log(ctx, "info", `Tracked spawned lifecycle for run ${runId}, task ${taskId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `Lifecycle tracking (spawned) failed: ${msg}`);
  }
}

/**
 * Handle subagent_ended (priority 50): track lifecycle end.
 */
async function handleSubagentEnded(ctx: HookContext): Promise<void> {
  const tr = getTaskRouter();
  if (tr === null) {
    log(ctx, "warn", "TaskRouter not initialized, skipping subagent_ended");
    return;
  }

  const extendedCtx = ctx as unknown as Record<string, unknown>;
  const runId = extendedCtx.runId;
  const result = extendedCtx.result;
  const plan = extendedCtx.plan as import("./types.js").Plan | undefined;

  if (typeof runId !== "string" || plan === undefined) {
    log(ctx, "warn", "Missing runId or plan for subagent_ended");
    return;
  }

  const taskId = plan.taskRunMap[runId];
  if (taskId === undefined) {
    log(ctx, "warn", `No taskId mapped for run ${runId} in subagent_ended`);
    return;
  }

  let success: boolean | undefined;
  if (typeof extendedCtx.success === "boolean") {
    success = extendedCtx.success;
  } else if (typeof extendedCtx.error === "string" && extendedCtx.error.length > 0) {
    success = false;
  }

  try {
    await tr.trackLifecycle(
      { type: "ended", runId, taskId, result: typeof result === "string" ? result : undefined, success },
      plan
    );
    delete plan.taskRunMap[runId];
    log(ctx, "info", `Tracked ended lifecycle for run ${runId}, task ${taskId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `Lifecycle tracking (ended) failed: ${msg}`);
  }
}

/**
 * Handle after_tool_call: persist tool results to the blackboard.
 */
async function handleAfterToolCall(ctx: HookContext): Promise<void> {
  const bb = getBlackboard();
  if (bb === null) {
    log(ctx, "warn", "Blackboard not initialized, skipping after_tool_call");
    return;
  }

  // The OpenClaw gateway injects tool call details into the context.
  // We expect runId and result to be present for persistence.
  const extendedCtx = ctx as unknown as Record<string, unknown>;
  const runId = extendedCtx.runId;
  const result = extendedCtx.result;

  if (typeof runId === "string" && result !== undefined) {
    try {
      await bb.writeResult(runId, String(result));
      log(ctx, "info", `Persisted result for run ${runId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(ctx, "error", `Failed to persist result for run ${runId}: ${msg}`);
    }
  }
}

/**
 * Handle agent_end: persist execution metrics to the blackboard.
 */
async function handleAgentEnd(ctx: HookContext): Promise<void> {
  const bb = getBlackboard();
  if (bb === null) {
    log(ctx, "warn", "Blackboard not initialized, skipping agent_end");
    return;
  }

  const extendedCtx2 = ctx as unknown as Record<string, unknown>;
  const metrics = extendedCtx2.metrics;
  if (
    metrics !== undefined &&
    typeof metrics === "object" &&
    metrics !== null &&
    "runId" in metrics &&
    typeof (metrics as Record<string, unknown>).runId === "string"
  ) {
    const runId = (metrics as Record<string, unknown>).runId as string;
    try {
      await bb.writeMetrics(runId, metrics as import("./types.js").ExecutionMetrics);
      log(ctx, "info", `Persisted metrics for run ${runId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(ctx, "error", `Failed to persist metrics for run ${runId}: ${msg}`);
    }
  }
}

/**
 * Handle before_agent_finalize (priority 60): check plan health and decide
 * whether to revise or finalize.
 */
export async function handleBeforeAgentFinalize(ctx: HookContext): Promise<void> {
  const rp = getReplanner();
  const pl = getPlanner();

  if (rp === null || pl === null) {
    log(ctx, "warn", "Replanner or Planner not initialized, falling back to finalize");
    return;
  }

  try {
    const event = ctx as unknown as BeforeAgentFinalizeEvent;
    const session = event.session;
    if (session === undefined) {
      return;
    }

    const plan = pl.readPlanState(session);
    if (plan === null) {
      return;
    }

    const health = rp.check(plan);

    if (health.needsReroute) {
      const decision = await rp.replan(plan, health.failedTasks);
      rp.applyRepair(plan, health.failedTasks, decision);
      pl.writePlanState(session, plan);
      log(ctx, "info", `Plan revised with strategy: ${decision.strategy}`);
      const extendedCtx = ctx as unknown as Record<string, unknown>;
      extendedCtx.action = "revise";
      extendedCtx.reason = decision.reason;
      return;
    }

    plan.status = "done";
    pl.writePlanState(session, plan);
    log(ctx, "info", "Plan finalized — all tasks completed");
    const extendedCtx = ctx as unknown as Record<string, unknown>;
    extendedCtx.action = "finalize";
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(ctx, "error", `before_agent_finalize error: ${msg}`);
    return;
  }
}

/**
 * Create a wrapper for the plan validation hook that accesses the current framework.
 */
function createPlanValidationHookWrapper(): (ctx: HookContext) => Promise<void> {
  return async (ctx: HookContext) => {
    const vf = getValidationFramework();
    if (vf === null) {
      log(ctx, "warn", "ValidationFramework not initialized, skipping plan validation");
      return;
    }

    const extendedCtx = ctx as unknown as Record<string, unknown>;
    const session = extendedCtx.session;
    const plan = extendedCtx.plan as import("./types.js").Plan | undefined;

    if (plan === undefined) {
      return;
    }

    const hook = createPlanValidationHook(vf);
    const result = await hook({ session, plan });

    if (result.block) {
      extendedCtx.block = true;
      extendedCtx.reason = result.reason;
      log(ctx, "warn", `Plan validation blocked: ${result.reason ?? "unknown reason"}`);
    }
  };
}

/**
 * Create a wrapper for the task validation hook that accesses the current framework.
 */
function createTaskValidationHookWrapper(): (ctx: HookContext) => Promise<void> {
  return async (ctx: HookContext) => {
    const vf = getValidationFramework();
    if (vf === null) {
      log(ctx, "warn", "ValidationFramework not initialized, skipping task validation");
      return;
    }

    const extendedCtx = ctx as unknown as Record<string, unknown>;
    const session = extendedCtx.session;
    const task = extendedCtx.task as import("./types.js").Task | undefined;
    const agent = extendedCtx.agent as import("./types.js").AgentRole | undefined;
    const plan = extendedCtx.plan as import("./types.js").Plan | undefined;

    if (task === undefined || agent === undefined) {
      return;
    }

    const hook = createTaskValidationHook(vf);
    const result = await hook({ session, task, agent, plan });

    if (result.block) {
      extendedCtx.block = true;
      extendedCtx.reason = result.reason;
      log(ctx, "warn", `Task validation blocked: ${result.reason ?? "unknown reason"}`);
    }
  };
}

/**
 * Build a legacy HookContext from an OpenClaw event object.
 * Used to bridge new event-based handlers to legacy ctx-based handlers.
 */
function buildLegacyContext(api: OpenClawApi, event: unknown): HookContext {
  const evt = event as Record<string, unknown>;
  const context = evt.context as Record<string, unknown> | undefined;
  return {
    configPath: typeof context?.configPath === "string" ? context.configPath : undefined,
    logger: api.logger,
    registerHook: () => {},
    sessionState: context?.sessionState as Record<string, unknown> | undefined,
    ...evt,
  };
}

/**
 * Define the plugin entry point conforming to OpenClaw SDK contract.
 */
export function definePluginEntry(
  entry: Omit<PluginEntry, "register" | "allowConversationAccess"> & {
    version?: string;
    allowConversationAccess?: boolean;
  }
): PluginEntry {
  return {
    id: entry.id,
    name: entry.name,
    allowConversationAccess: entry.allowConversationAccess ?? true,
    register(api: OpenClawApi): void {
      api.logger.info("Plan-subagent plugin registering...");

      // ── Register session extension for plan state persistence ──
      if (typeof api.registerSessionExtension === "function") {
        api.registerSessionExtension("plan_state", {
          serializer: (plan: unknown) => plan,
          deserializer: (data: unknown) => {
            const result = PlanSchema.safeParse(data);
            return result.success ? result.data : null;
          },
        });
        api.logger.info("Registered plan_state session extension");
      } else {
        api.logger.warn("api.registerSessionExtension not available — plan state persistence will use direct session mutation");
      }

      // ── Initialize config manager ──
      const cm = new ConfigManager();
      setConfigManager(cm);

      const configPath = api.resolvePath("../plugin.json");
      try {
        const content = readFileSync(configPath, "utf-8");
        const raw = JSON.parse(content) as unknown;
        const parseResult = PluginConfigSchema.safeParse(raw);
        if (parseResult.success) {
          cm.setConfig(parseResult.data);
          api.logger.info(`Config loaded from ${configPath}`);
        } else {
          const issues = parseResult.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          api.logger.error(
            `Config validation failed: ${issues}. Using default config.`
          );
          cm.setConfig(DEFAULT_CONFIG);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        api.logger.error(
          `Failed to load config: ${msg}. Using default config.`
        );
        cm.setConfig(DEFAULT_CONFIG);
      }

      const config = cm.getConfig();

      // ── Initialize Blackboard ──
      const bb = new Blackboard({
        basePath: api.resolvePath("../workspace"),
        metricsOutput: config.metricsOutput,
        metricsWebhook: config.metricsWebhook,
        metricsOtelEndpoint: config.metricsOtelEndpoint,
      });
      setBlackboard(bb);
      api.logger.info("Blackboard initialized");

      // ── Initialize Planner ──
      const apiKey = process.env.MOONSHOT_API_KEY;
      const plannerGenerate: GenerateFn = apiKey
        ? createLlmClient({ apiKey, model: config.plannerModel, logger: api.logger })
        : async (prompt: string) => {
            api.logger.warn(
              `MOONSHOT_API_KEY not set. Planner LLM generate fallback. Prompt length: ${prompt.length}`
            );
            return "complex";
          };
      const pl = new Planner(
        {
          model: config.plannerModel,
          maxTasks: 20,
          classificationRules: config.classificationRules,
          skipClassification: config.skipClassification,
        },
        plannerGenerate
      );
      setPlanner(pl);
      api.logger.info("Planner initialized");

      // ── Initialize TaskRouter ──
      const tr = new TaskRouter({
        maxConcurrency: config.maxConcurrency,
        agentPool: config.agentRoles,
      });
      setTaskRouter(tr);
      api.logger.info(
        `TaskRouter initialized with maxConcurrency=${config.maxConcurrency}`
      );

      // ── Initialize Replanner ──
      const replannerGenerate = apiKey
        ? createLlmClient({ apiKey, model: config.replannerModel, logger: api.logger })
        : async (prompt: string) => {
            api.logger.warn(
              `MOONSHOT_API_KEY not set. Replanner LLM generate fallback. Prompt length: ${prompt.length}`
            );
            return JSON.stringify({ strategy: "retry", reason: "Default fallback" });
          };
      const rp = new Replanner({
        model: config.replannerModel,
        maxRetries: 3,
        generate: replannerGenerate,
      });
      setReplanner(rp);
      api.logger.info("Replanner initialized");

      // ── Initialize Validation Framework ──
      const validationCfg = config.validation;
      const vf = createValidationFramework({
        defaultTimeoutMs: validationCfg?.defaultTimeoutMs ?? 5000,
        skipValidation: validationCfg?.skipValidation ?? false,
        retention: validationCfg?.retention ?? { maxAge: "7d", maxRecords: 1000 },
        disabledRules: validationCfg?.disabledRules ?? [],
      });
      setValidationFramework(vf);
      api.logger.info("ValidationFramework initialized with default rules");

      // ── Register hooks ──

      api.on(
        "gateway_start",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleGatewayStart(ctx);
        },
        { priority: 90 }
      );

      api.on(
        "gateway_stop",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleGatewayStop(ctx);
        },
        { priority: 90 }
      );

      api.on(
        "before_agent_reply",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleBeforeAgentReply(ctx);
          return undefined;
        },
        { priority: 80 }
      );

      api.on(
        "before_agent_reply",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          const wrapper = createPlanValidationHookWrapper();
          await wrapper(ctx);
          return undefined;
        },
        { priority: 75 }
      );

      api.on(
        "before_prompt_build",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleBeforePromptBuild(ctx);
          const prependContext = (event as Record<string, unknown>).prependContext as
            | string
            | undefined;
          if (prependContext !== undefined) {
            return { prependContext };
          }
          return undefined;
        },
        { priority: 70 }
      );

      api.on(
        "subagent_delivery_target",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleSubagentDeliveryTarget(ctx);
          const targetAgentId = (event as Record<string, unknown>).targetAgentId as
            | string
            | undefined;
          if (targetAgentId === undefined) {
            throw new Error("subagent_delivery_target did not produce targetAgentId");
          }
          return { targetAgentId };
        },
        { priority: 70 }
      );

      api.on(
        "subagent_delivery_target",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          const wrapper = createTaskValidationHookWrapper();
          await wrapper(ctx);
          const block = (event as Record<string, unknown>).block as boolean | undefined;
          if (block === true) {
            return {
              targetAgentId: "",
            };
          }
          // Return a dummy targetAgentId if the validation wrapper didn't block.
          // The primary delivery_target handler (priority 70) already computed the real one.
          return undefined;
        },
        { priority: 65 }
      );

      api.on(
        "subagent_spawning",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleSubagentSpawning(ctx);
          const block = (event as Record<string, unknown>).block as boolean | undefined;
          if (block === true) {
            return { block: true, reason: (event as Record<string, unknown>).reason as string | undefined };
          }
          return undefined;
        },
        { priority: 70 }
      );

      api.on(
        "before_agent_finalize",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleBeforeAgentFinalize(ctx);
          const action = (event as Record<string, unknown>).action as
            | "revise"
            | "finalize"
            | undefined;
          if (action === undefined) {
            return { action: "finalize" as const };
          }
          return {
            action,
            reason: (event as Record<string, unknown>).reason as string | undefined,
          };
        },
        { priority: 60 }
      );

      api.on(
        "before_tool_call",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleBeforeToolCall(ctx);
          return undefined;
        },
        { priority: 50 }
      );

      api.on(
        "subagent_spawned",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleSubagentSpawned(ctx);
          return undefined;
        },
        { priority: 50 }
      );

      api.on(
        "subagent_ended",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleSubagentEnded(ctx);
          return undefined;
        },
        { priority: 50 }
      );

      api.on(
        "after_tool_call",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleAfterToolCall(ctx);
          return undefined;
        },
        { priority: 50 }
      );

      api.on(
        "agent_end",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleAgentEnd(ctx);
          return undefined;
        },
        { priority: 50 }
      );

      api.on(
        "heartbeat_prompt_contribution",
        async (event) => {
          const ctx = buildLegacyContext(api, event);
          await handleHeartbeatPromptContribution(ctx);
          const contribution = (event as Record<string, unknown>).contribution as
            | string
            | undefined;
          if (contribution !== undefined && contribution.length > 0) {
            return { contribution };
          }
          return undefined;
        },
        { priority: 40 }
      );

      api.logger.info("Plan-subagent plugin registered successfully");
    },
  };
}

/**
 * Plugin entry point for OpenClaw.
 */
export default definePluginEntry({
  id: "openclaw-plugin-plan-subagent",
  name: "Plan-Task-Build Subagent Orchestrator",
});
