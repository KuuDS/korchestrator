import { ConfigManager, type ConfigDiff } from "./config.js";
import { watchConfig } from "./config-loader.js";
import { type PluginConfig, DEFAULT_CONFIG } from "./types.js";

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
 * Handle gateway_start: load and validate config, start file watcher.
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
    // Rule cache clear would be invoked here when the cache module exists
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
 * Define the plugin entry point.
 */
export function definePluginEntry(entry: Omit<PluginEntry, "hooks"> & { hooks?: PluginEntry["hooks"] }): PluginEntry {
  return {
    ...entry,
    hooks: [
      ...(entry.hooks ?? []),
      { event: "gateway_start", handler: handleGatewayStart, priority: 90 },
      { event: "gateway_stop", handler: handleGatewayStop, priority: 90 }
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
