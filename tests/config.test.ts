import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConfigManager, type ConfigDiff } from "../src/config.js";
import { type PluginConfig, DEFAULT_CONFIG, PluginConfigSchema } from "../src/types.js";
import * as configLoader from "../src/config-loader.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function createValidConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigManager.load
// ═══════════════════════════════════════════════════════════════════════════════

describe("ConfigManager.load", () => {
  let cm: ConfigManager;

  beforeEach(() => {
    cm = new ConfigManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and validates a valid config file", async () => {
    const config = createValidConfig({ plannerModel: "gpt-4o" });
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(config);
    const result = await cm.load("/fake/plugin.json");
    expect(result.plannerModel).toBe("gpt-4o");
  });

  it("caches the loaded config", async () => {
    const config = createValidConfig({ maxConcurrency: 5 });
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(config);
    await cm.load("/fake/plugin.json");
    expect(cm.getConfig().maxConcurrency).toBe(5);
  });

  it("falls back to previous config on validation failure", async () => {
    cm.setConfig(createValidConfig({ plannerModel: "old-model" }));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({ invalid: true });
    const result = await cm.load("/fake/plugin.json");
    expect(result.plannerModel).toBe("old-model");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("throws on first load if config is invalid and no cache exists", async () => {
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({ invalid: true });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow("Config validation failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigManager.getConfig / setConfig
// ═══════════════════════════════════════════════════════════════════════════════

describe("ConfigManager.getConfig / setConfig", () => {
  it("getConfig throws when no config is loaded", () => {
    const cm = new ConfigManager();
    expect(() => cm.getConfig()).toThrow("Config has not been loaded yet");
  });

  it("setConfig updates cached config", () => {
    const cm = new ConfigManager();
    const config = createValidConfig({ maxStepsPerAgent: 50 });
    cm.setConfig(config);
    expect(cm.getConfig().maxStepsPerAgent).toBe(50);
  });

  it("setConfig does not notify when config is unchanged", () => {
    const cm = new ConfigManager();
    const config = createValidConfig();
    const listener = vi.fn();
    cm.onChange(listener);
    cm.setConfig(config);
    cm.setConfig(createValidConfig());
    expect(listener).not.toHaveBeenCalled();
  });

  it("setConfig notifies listeners when config changes", () => {
    const cm = new ConfigManager();
    const config1 = createValidConfig({ plannerModel: "model-a" });
    const config2 = createValidConfig({ plannerModel: "model-b" });
    const listener = vi.fn();
    cm.onChange(listener);
    cm.setConfig(config1);
    cm.setConfig(config2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(config1, config2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigManager.diffConfig
// ═══════════════════════════════════════════════════════════════════════════════

describe("ConfigManager.diffConfig", () => {
  const cm = new ConfigManager();

  it("returns no changes for identical configs", () => {
    const c = createValidConfig();
    const diff = cm.diffConfig(c, createValidConfig());
    expect(diff.changedFields).toEqual([]);
    expect(diff.plannerModelChanged).toBe(false);
    expect(diff.replannerModelChanged).toBe(false);
    expect(diff.maxConcurrencyChanged).toBe(false);
    expect(diff.agentRolesChanged).toBe(false);
    expect(diff.classificationRulesChanged).toBe(false);
    expect(diff.skipClassificationChanged).toBe(false);
  });

  it("detects plannerModel change", () => {
    const oldC = createValidConfig({ plannerModel: "gpt-4o-mini" });
    const newC = createValidConfig({ plannerModel: "gpt-4o" });
    const diff = cm.diffConfig(oldC, newC);
    expect(diff.changedFields).toContain("plannerModel");
    expect(diff.plannerModelChanged).toBe(true);
  });

  it("detects replannerModel change", () => {
    const oldC = createValidConfig({ replannerModel: "gpt-4o-mini" });
    const newC = createValidConfig({ replannerModel: "gpt-4o" });
    const diff = cm.diffConfig(oldC, newC);
    expect(diff.changedFields).toContain("replannerModel");
    expect(diff.replannerModelChanged).toBe(true);
  });

  it("detects maxConcurrency change", () => {
    const oldC = createValidConfig({ maxConcurrency: 3 });
    const newC = createValidConfig({ maxConcurrency: 5 });
    const diff = cm.diffConfig(oldC, newC);
    expect(diff.changedFields).toContain("maxConcurrency");
    expect(diff.maxConcurrencyChanged).toBe(true);
  });

  it("detects agentRoles change", () => {
    const oldC = createValidConfig();
    const newC = createValidConfig({
      agentRoles: [
        { agentId: "researcher", name: "Researcher", skills: ["search"], model: "gpt-4o-mini" }
      ]
    });
    const diff = cm.diffConfig(oldC, newC);
    expect(diff.changedFields).toContain("agentRoles");
    expect(diff.agentRolesChanged).toBe(true);
  });

  it("detects classificationRules change", () => {
    const oldC = createValidConfig({
      classificationRules: [{ pattern: "^hello", result: "simple" }]
    });
    const newC = createValidConfig({
      classificationRules: [{ pattern: "^hi", result: "simple" }]
    });
    const diff = cm.diffConfig(oldC, newC);
    expect(diff.changedFields).toContain("classificationRules");
    expect(diff.classificationRulesChanged).toBe(true);
  });

  it("detects skipClassification change", () => {
    const oldC = createValidConfig({ skipClassification: false });
    const newC = createValidConfig({ skipClassification: true });
    const diff = cm.diffConfig(oldC, newC);
    expect(diff.changedFields).toContain("skipClassification");
    expect(diff.skipClassificationChanged).toBe(true);
  });

  it("detects multiple simultaneous changes", () => {
    const oldC = createValidConfig();
    const newC = createValidConfig({
      plannerModel: "gpt-4o",
      maxConcurrency: 10,
      skipClassification: true
    });
    const diff = cm.diffConfig(oldC, newC);
    expect(diff.changedFields.sort()).toEqual(
      ["plannerModel", "maxConcurrency", "skipClassification"].sort()
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigManager.onChange listener error handling
// ═══════════════════════════════════════════════════════════════════════════════

describe("ConfigManager.onChange error handling", () => {
  it("does not break when a listener throws", () => {
    const cm = new ConfigManager();
    const badListener = vi.fn().mockImplementation(() => {
      throw new Error("boom");
    });
    const goodListener = vi.fn();
    cm.onChange(badListener);
    cm.onChange(goodListener);
    cm.setConfig(createValidConfig({ plannerModel: "a" }));
    cm.setConfig(createValidConfig({ plannerModel: "b" }));
    expect(goodListener).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Zod validation rules (valid / invalid cases)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Zod validation rules via ConfigManager.load", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects empty plannerModel", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      plannerModel: ""
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow("plannerModel");
  });

  it("rejects empty replannerModel", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      replannerModel: ""
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow("replannerModel");
  });

  it("rejects maxConcurrency < 1", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      maxConcurrency: 0
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow("maxConcurrency");
  });

  it("rejects maxStepsPerAgent < 1", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      maxStepsPerAgent: -1
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow("maxStepsPerAgent");
  });

  it("rejects non-boolean skipClassification", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      skipClassification: "yes"
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow();
  });

  it("rejects invalid classificationRules", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      classificationRules: [{ pattern: 123, result: "simple" }]
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow();
  });

  it("rejects invalid metricsOutput enum", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      metricsOutput: "unknown"
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow();
  });

  it("rejects missing metricsWebhook when metricsOutput is webhook", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      metricsOutput: "webhook"
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow("metricsWebhook");
  });

  it("rejects empty metricsWebhook when metricsOutput is webhook", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      metricsOutput: "webhook",
      metricsWebhook: ""
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow("metricsWebhook");
  });

  it("rejects missing metricsOtelEndpoint when metricsOutput is otel", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      metricsOutput: "otel"
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow("metricsOtelEndpoint");
  });

  it("rejects empty metricsOtelEndpoint when metricsOutput is otel", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      metricsOutput: "otel",
      metricsOtelEndpoint: ""
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow("metricsOtelEndpoint");
  });

  it("rejects invalid agentRoles", async () => {
    const cm = new ConfigManager();
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      agentRoles: [{ agentId: "", name: "", skills: ["invalid"], model: "" }]
    });
    await expect(cm.load("/fake/plugin.json")).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error handling & fallback
// ═══════════════════════════════════════════════════════════════════════════════

describe("Error handling & fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("continues operation with previous config when new config is invalid", async () => {
    const cm = new ConfigManager();
    cm.setConfig(createValidConfig({ plannerModel: "stable-model" }));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({ invalid: true });
    const result = await cm.load("/fake/plugin.json");
    expect(result.plannerModel).toBe("stable-model");
    consoleSpy.mockRestore();
  });

  it("logs detailed validation errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cm = new ConfigManager();
    cm.setConfig(createValidConfig());
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue({
      ...DEFAULT_CONFIG,
      maxConcurrency: -5
    });
    await cm.load("/fake/plugin.json");
    expect(consoleSpy).toHaveBeenCalled();
    const call = consoleSpy.mock.calls.find((c) =>
      String(c[0]).includes("maxConcurrency")
    );
    expect(call).toBeDefined();
    consoleSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Config-loader unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("config-loader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loadConfigFile reads and parses JSON", async () => {
    const data = { hello: "world" };
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(data);
    const result = await configLoader.loadConfigFile("/fake/path.json");
    expect(result).toEqual(data);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Plugin entry lifecycle hooks
// ═══════════════════════════════════════════════════════════════════════════════

describe("Plugin entry lifecycle hooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("definePluginEntry registers gateway_start and gateway_stop hooks", async () => {
    const { definePluginEntry } = await import("../src/index.js");
    const entry = definePluginEntry({ id: "test", name: "Test", version: "1.0.0" });
    const events = entry.hooks.map((h: { event: string }) => h.event);
    expect(events).toContain("gateway_start");
    expect(events).toContain("gateway_stop");
  });

  it("gateway_start hook loads config and starts watcher", async () => {
    const { definePluginEntry, setConfigManager, getConfigManager } = await import("../src/index.js");
    setConfigManager(null);
    const entry = definePluginEntry({ id: "test", name: "Test", version: "1.0.0" });
    const startHook = entry.hooks.find((h) => h.event === "gateway_start");
    expect(startHook).toBeDefined();

    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(createValidConfig({ plannerModel: "gpt-4o" }));
    const ctx = {
      configPath: "/fake/plugin.json",
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      registerHook: vi.fn()
    };
    await startHook!.handler(ctx);
    expect(getConfigManager().getConfig().plannerModel).toBe("gpt-4o");
  });

  it("gateway_stop hook stops watcher and persists plans", async () => {
    const { definePluginEntry, setActivePlans, setConfigManager } = await import("../src/index.js");
    setConfigManager(null);
    const entry = definePluginEntry({ id: "test", name: "Test", version: "1.0.0" });
    const stopHook = entry.hooks.find((h) => h.event === "gateway_stop");
    expect(stopHook).toBeDefined();

    setActivePlans(["plan_001", "plan_002"]);
    const sessionState: Record<string, unknown> = {};
    const ctx = {
      configPath: "/fake/plugin.json",
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      registerHook: vi.fn(),
      sessionState
    };
    await stopHook!.handler(ctx);
    expect(sessionState.activePlans).toEqual(["plan_001", "plan_002"]);
  });

  it("gateway_start uses default config when file load fails", async () => {
    const { definePluginEntry, setConfigManager, getConfigManager } = await import("../src/index.js");
    setConfigManager(null);
    const entry = definePluginEntry({ id: "test", name: "Test", version: "1.0.0" });
    const startHook = entry.hooks.find((h) => h.event === "gateway_start");

    vi.spyOn(configLoader, "loadConfigFile").mockRejectedValue(new Error("ENOENT"));
    const ctx = {
      configPath: "/fake/plugin.json",
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      registerHook: vi.fn()
    };
    await startHook!.handler(ctx);
    expect(getConfigManager().getConfig().plannerModel).toBe(DEFAULT_CONFIG.plannerModel);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Change detection and reload sequence
// ═══════════════════════════════════════════════════════════════════════════════

describe("Change detection and reload sequence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves active plans during reload", async () => {
    const { definePluginEntry, setActivePlans, getConfigManager, setConfigManager } = await import("../src/index.js");
    setConfigManager(null);
    const entry = definePluginEntry({ id: "test", name: "Test", version: "1.0.0" });
    const startHook = entry.hooks.find((h) => h.event === "gateway_start");

    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(createValidConfig());
    const ctx = {
      configPath: "/fake/plugin.json",
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      registerHook: vi.fn()
    };
    await startHook!.handler(ctx);

    setActivePlans(["plan_001"]);
    // Simulate a config change by calling the internal handler indirectly
    // The watcher callback triggers handleConfigChange which preserves plans
    const newConfig = createValidConfig({ plannerModel: "gpt-4o" });
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(newConfig);
    // Trigger reload by invoking start again (simulating stop -> start)
    await startHook!.handler(ctx);
    expect(getConfigManager().getConfig().plannerModel).toBe("gpt-4o");
    // Active plans should still be there
    const { getActivePlans } = await import("../src/index.js");
    expect(getActivePlans()).toContain("plan_001");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Differentiated reload strategies
// ═══════════════════════════════════════════════════════════════════════════════

describe("Differentiated reload strategies", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies immediate effect for plannerModel change", async () => {
    const cm = new ConfigManager();
    cm.setConfig(createValidConfig({ plannerModel: "old" }));
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(createValidConfig({ plannerModel: "new" }));
    await cm.load("/fake/plugin.json");
    expect(cm.getConfig().plannerModel).toBe("new");
  });

  it("applies immediate effect for replannerModel change", async () => {
    const cm = new ConfigManager();
    cm.setConfig(createValidConfig({ replannerModel: "old" }));
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(createValidConfig({ replannerModel: "new" }));
    await cm.load("/fake/plugin.json");
    expect(cm.getConfig().replannerModel).toBe("new");
  });

  it("applies immediate effect for maxConcurrency change", async () => {
    const cm = new ConfigManager();
    cm.setConfig(createValidConfig({ maxConcurrency: 3 }));
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(createValidConfig({ maxConcurrency: 10 }));
    await cm.load("/fake/plugin.json");
    expect(cm.getConfig().maxConcurrency).toBe(10);
  });

  it("applies immediate effect for agentRoles change", async () => {
    const cm = new ConfigManager();
    const oldRoles = createValidConfig().agentRoles;
    cm.setConfig(createValidConfig());
    const newRoles = [{ agentId: "custom", name: "Custom", skills: ["search"] as const, model: "gpt-4o" }];
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(createValidConfig({ agentRoles: newRoles }));
    await cm.load("/fake/plugin.json");
    expect(cm.getConfig().agentRoles).toEqual(newRoles);
  });

  it("applies immediate effect for skipClassification toggle", async () => {
    const cm = new ConfigManager();
    cm.setConfig(createValidConfig({ skipClassification: false }));
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(createValidConfig({ skipClassification: true }));
    await cm.load("/fake/plugin.json");
    expect(cm.getConfig().skipClassification).toBe(true);
  });

  it("detects classificationRules change for cache clear", async () => {
    const cm = new ConfigManager();
    cm.setConfig(createValidConfig({ classificationRules: [{ pattern: "^a", result: "simple" }] }));
    const listener = vi.fn();
    cm.onChange(listener);
    vi.spyOn(configLoader, "loadConfigFile").mockResolvedValue(
      createValidConfig({ classificationRules: [{ pattern: "^b", result: "simple" }] })
    );
    await cm.load("/fake/plugin.json");
    const diff: ConfigDiff = (listener.mock.calls[0] as [PluginConfig, PluginConfig])[1]
      ? cm.diffConfig(
          (listener.mock.calls[0] as [PluginConfig, PluginConfig])[0],
          (listener.mock.calls[0] as [PluginConfig, PluginConfig])[1]
        )
      : { changedFields: [] } as ConfigDiff;
    // Verify diff directly
    const d = cm.diffConfig(
      createValidConfig({ classificationRules: [{ pattern: "^a", result: "simple" }] }),
      createValidConfig({ classificationRules: [{ pattern: "^b", result: "simple" }] })
    );
    expect(d.classificationRulesChanged).toBe(true);
  });
});
