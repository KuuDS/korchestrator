import { PluginConfigSchema, type PluginConfig } from "./types.js";
import { loadConfigFile } from "./config-loader.js";

/**
 * Description of which configuration fields changed between two configs.
 */
export interface ConfigDiff {
  /** Fields that have different values */
  changedFields: string[];
  /** Whether plannerModel changed */
  plannerModelChanged: boolean;
  /** Whether replannerModel changed */
  replannerModelChanged: boolean;
  /** Whether maxConcurrency changed */
  maxConcurrencyChanged: boolean;
  /** Whether agentRoles changed */
  agentRolesChanged: boolean;
  /** Whether classificationRules changed */
  classificationRulesChanged: boolean;
  /** Whether skipClassification changed */
  skipClassificationChanged: boolean;
}

/**
 * Callback invoked when configuration changes.
 */
export type ConfigChangeCallback = (
  oldConfig: PluginConfig,
  newConfig: PluginConfig
) => void;

/**
 * Manages plugin configuration: loading, validation, caching, diffing,
 * and notifying listeners of changes.
 */
export class ConfigManager {
  private cachedConfig: PluginConfig | null = null;
  private readonly listeners: ConfigChangeCallback[] = [];

  /**
   * Load and validate configuration from a file path.
   * Falls back to the previously cached config if validation fails.
   * Notifies listeners only when the validated config differs from the previous one.
   * @param configPath - Path to the JSON config file.
   * @returns The validated PluginConfig.
   * @throws If no valid config is available (first load fails).
   */
  async load(configPath: string): Promise<PluginConfig> {
    let raw: unknown;
    try {
      raw = await loadConfigFile(configPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read config file: ${message}`);
    }

    const parseResult = PluginConfigSchema.safeParse(raw);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      if (this.cachedConfig !== null) {
        // Fallback: retain old config and log error
        this.emitError(`Config validation failed, retaining previous config. Issues: ${issues}`);
        return this.cachedConfig;
      }
      throw new Error(`Config validation failed: ${issues}`);
    }

    const newConfig = parseResult.data;
    const oldConfig = this.cachedConfig;

    if (oldConfig !== null) {
      const diff = this.diffConfig(oldConfig, newConfig);
      if (diff.changedFields.length > 0) {
        this.cachedConfig = newConfig;
        this.notifyChange(oldConfig, newConfig);
      }
      return this.cachedConfig as PluginConfig;
    }

    this.cachedConfig = newConfig;
    return newConfig;
  }

  /**
   * Get the currently cached configuration.
   * @returns The cached PluginConfig.
   * @throws If no config has been loaded yet.
   */
  getConfig(): PluginConfig {
    if (this.cachedConfig === null) {
      throw new Error("Config has not been loaded yet");
    }
    return this.cachedConfig;
  }

  /**
   * Update the cached configuration directly.
   * Notifies listeners if the new config differs from the old one.
   * @param config - The new configuration to cache.
   */
  setConfig(config: PluginConfig): void {
    const oldConfig = this.cachedConfig;
    if (oldConfig !== null) {
      const diff = this.diffConfig(oldConfig, config);
      if (diff.changedFields.length > 0) {
        this.cachedConfig = config;
        this.notifyChange(oldConfig, config);
      }
      return;
    }
    this.cachedConfig = config;
  }

  /**
   * Register a callback to be invoked when configuration changes.
   * @param callback - Function called with old and new config.
   */
  onChange(callback: ConfigChangeCallback): void {
    this.listeners.push(callback);
  }

  /**
   * Compare two configurations and return a diff description.
   * @param oldConfig - Previous configuration.
   * @param newConfig - New configuration.
   * @returns ConfigDiff describing what changed.
   */
  diffConfig(oldConfig: PluginConfig, newConfig: PluginConfig): ConfigDiff {
    const changedFields: string[] = [];

    if (oldConfig.plannerModel !== newConfig.plannerModel) {
      changedFields.push("plannerModel");
    }
    if (oldConfig.replannerModel !== newConfig.replannerModel) {
      changedFields.push("replannerModel");
    }
    if (oldConfig.maxConcurrency !== newConfig.maxConcurrency) {
      changedFields.push("maxConcurrency");
    }
    if (oldConfig.maxStepsPerAgent !== newConfig.maxStepsPerAgent) {
      changedFields.push("maxStepsPerAgent");
    }
    if (oldConfig.skipClassification !== newConfig.skipClassification) {
      changedFields.push("skipClassification");
    }
    if (oldConfig.metricsOutput !== newConfig.metricsOutput) {
      changedFields.push("metricsOutput");
    }
    if (oldConfig.metricsWebhook !== newConfig.metricsWebhook) {
      changedFields.push("metricsWebhook");
    }
    if (oldConfig.metricsOtelEndpoint !== newConfig.metricsOtelEndpoint) {
      changedFields.push("metricsOtelEndpoint");
    }
    if (JSON.stringify(oldConfig.classificationRules) !== JSON.stringify(newConfig.classificationRules)) {
      changedFields.push("classificationRules");
    }
    if (JSON.stringify(oldConfig.agentRoles) !== JSON.stringify(newConfig.agentRoles)) {
      changedFields.push("agentRoles");
    }

    return {
      changedFields,
      plannerModelChanged: changedFields.includes("plannerModel"),
      replannerModelChanged: changedFields.includes("replannerModel"),
      maxConcurrencyChanged: changedFields.includes("maxConcurrency"),
      agentRolesChanged: changedFields.includes("agentRoles"),
      classificationRulesChanged: changedFields.includes("classificationRules"),
      skipClassificationChanged: changedFields.includes("skipClassification")
    };
  }

  private notifyChange(oldConfig: PluginConfig, newConfig: PluginConfig): void {
    for (const listener of this.listeners) {
      try {
        listener(oldConfig, newConfig);
      } catch {
        // Listener errors should not break config updates
      }
    }
  }

  private emitError(message: string): void {
    // In a real plugin environment this would use the OpenClaw logger.
    // For now we write to stderr so tests can spy if needed.
    console.error(`[ConfigManager] ${message}`);
  }
}
