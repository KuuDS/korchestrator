import { ConfigManager, type ConfigDiff } from "./config.js";
import { watchConfig } from "./config-loader.js";
import { type PluginConfig, DEFAULT_CONFIG } from "./types.js";
import { Blackboard } from "./blackboard.js";
import { Planner } from "./planner.js";
import { Replanner } from "./replanner.js";
import { TaskRouter } from "./router.js";
import type { BeforeAgentReplyEvent, BeforePromptBuildEvent, BeforeAgentFinalizeEvent } from "./contracts/hooks.js";

/**
 * Hook context provided by the OpenClaw gateway.
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
}

/**
 * Plugin entry definition structure.
 */
export interface PluginEntry {
  id: string;
  name: string;
  version: string;
  hooks: Array<{
    event: string;
    handler: (ctx: HookContext) => Promise<void> | void;
    priority: number;
  }>;
}

let configManager: ConfigManager | null = null;
let watcherHandle: { stop: () => void } | null = null;
let activePlans: string[] = [];
let blackboard: Blackboard | null = null;
let planner: Planner | null = null;
let taskRouter: TaskRouter | null = null;
let replanner: Replanner | null = null;

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
  const bb = new Blackboard({
    basePath: "./workspace",
    metricsOutput: config.metricsOutput,
    metricsWebhook: config.metricsWebhook,
    metricsOtelEndpoint: config.metricsOtelEndpoint,
  });
  setBlackboard(bb);
  log(ctx, "info", "Blackboard initialized");

  // Create Planner with config-derived settings
  const pl = new Planner(
    {
      model: config.plannerModel,
      maxTasks: 20,
      classificationRules: config.classificationRules,
      skipClassification: config.skipClassification,
    },
    async (prompt: string) => {
      // Default LLM generate stub — in production this would call the gateway API
      log(ctx, "warn", `LLM generate called but no real backend wired. Prompt length: ${prompt.length}`);
      return "complex";
    }
  );
  setPlanner(pl);
  pl.registerSessionExtension();
  log(ctx, "info", "Planner initialized");

  // Instantiate TaskRouter with config-derived settings
  const tr = new TaskRouter({
    maxConcurrency: config.maxConcurrency,
    agentPool: config.agentRoles,
  });
  setTaskRouter(tr);
  log(ctx, "info", `TaskRouter initialized with maxConcurrency=${config.maxConcurrency}`);

  // Instantiate Replanner with config-derived settings
  const rp = new Replanner({
    model: config.replannerModel,
    maxRetries: 3,
    generate: async (prompt: string) => {
      log(ctx, "warn", `Replanner LLM generate called but no real backend wired. Prompt length: ${prompt.length}`);
      return JSON.stringify({ strategy: "retry", reason: "Default fallback" });
    },
  });
  setReplanner(rp);
  log(ctx, "info", "Replanner initialized");

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

  // Differentiated reload strategies
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
    // Re-create planner with new rules
    const pl = getPlanner();
    if (pl !== null) {
      setPlanner(null);
    }
  }
  if (diff.skipClassificationChanged) {
    log(ctx, "info", `skipClassification toggled to: ${newConfig.skipClassification}`);
  }

  // Preserve active plans during reload
  if (activePlans.length > 0) {
    log(ctx, "info", `Preserving ${activePlans.length} active plans during reload`);
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

  try {
    await tr.trackLifecycle(
      { type: "ended", runId, taskId, result: typeof result === "string" ? result : undefined },
      plan
    );
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
 * Define the plugin entry point.
 */
export function definePluginEntry(entry: Omit<PluginEntry, "hooks"> & { hooks?: PluginEntry["hooks"] }): PluginEntry {
  return {
    ...entry,
    hooks: [
      ...(entry.hooks ?? []),
      { event: "gateway_start", handler: handleGatewayStart, priority: 90 },
      { event: "gateway_stop", handler: handleGatewayStop, priority: 90 },
      { event: "before_agent_reply", handler: handleBeforeAgentReply, priority: 80 },
      { event: "before_prompt_build", handler: handleBeforePromptBuild, priority: 70 },
      { event: "subagent_delivery_target", handler: handleSubagentDeliveryTarget, priority: 70 },
      { event: "subagent_spawning", handler: handleSubagentSpawning, priority: 70 },
      { event: "before_agent_finalize", handler: handleBeforeAgentFinalize, priority: 60 },
      { event: "subagent_spawned", handler: handleSubagentSpawned, priority: 50 },
      { event: "subagent_ended", handler: handleSubagentEnded, priority: 50 },
      { event: "after_tool_call", handler: handleAfterToolCall, priority: 50 },
      { event: "agent_end", handler: handleAgentEnd, priority: 50 },
    ]
  };
}

/**
 * Plugin entry point for OpenClaw.
 */
export default definePluginEntry({
  id: "plan-subagent",
  name: "Plan-Task-Build Subagent Orchestrator",
  version: "0.1.0"
});
