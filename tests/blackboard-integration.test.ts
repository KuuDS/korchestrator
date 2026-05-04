import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  definePluginEntry,
  getBlackboard,
  setBlackboard,
  getConfigManager,
  setConfigManager,
  getActivePlans,
  setActivePlans,
} from "../src/index.js";
import { ConfigManager } from "../src/config.js";
import { Blackboard } from "../src/blackboard.js";
import type { ExecutionMetrics } from "../src/types.js";

const TEST_BASE = "./workspace-test-integration";

async function resetTestDir(): Promise<void> {
  try {
    await rm(TEST_BASE, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("Blackboard hook integration", () => {
  beforeEach(async () => {
    await resetTestDir();
    setConfigManager(null);
    setBlackboard(null);
    setActivePlans([]);
  });

  afterEach(async () => {
    await resetTestDir();
    setConfigManager(null);
    setBlackboard(null);
    setActivePlans([]);
  });

  it("gateway_start instantiates Blackboard with config metrics settings", async () => {
    const cm = new ConfigManager();
    cm.setConfig({
      plannerModel: "gpt-4o-mini",
      replannerModel: "gpt-4o-mini",
      maxConcurrency: 3,
      maxStepsPerAgent: 20,
      skipClassification: false,
      classificationRules: [],
      metricsOutput: "webhook",
      metricsWebhook: "https://example.com/hook",
      metricsOtelEndpoint: "",
      agentRoles: [],
    });
    setConfigManager(cm);

    const logs: string[] = [];
    const ctx = {
      logger: {
        info: (msg: string) => logs.push(msg),
        error: (_msg: string) => {},
        warn: (_msg: string) => {},
      },
      registerHook: () => {},
    };

    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    const gatewayStart = entry.hooks.find((h) => h.event === "gateway_start");
    expect(gatewayStart).toBeDefined();
    await gatewayStart!.handler(ctx);

    const bb = getBlackboard();
    expect(bb).not.toBeNull();
  });

  it("after_tool_call writes result via blackboard when runId and result are present", async () => {
    const bb = new Blackboard({ basePath: TEST_BASE });
    setBlackboard(bb);

    const logs: string[] = [];
    const ctx = {
      runId: "run_tool_1",
      result: "tool output",
      logger: {
        info: (msg: string) => logs.push(msg),
        error: (_msg: string) => {},
        warn: (_msg: string) => {},
      },
      registerHook: () => {},
    };

    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    const afterToolCall = entry.hooks.find((h) => h.event === "after_tool_call");
    expect(afterToolCall).toBeDefined();
    await afterToolCall!.handler(ctx);

    const content = await readFile(join(TEST_BASE, "results", "run_tool_1.md"), "utf-8");
    expect(content).toBe("tool output");
    expect(logs.some((l) => l.includes("Persisted result"))).toBe(true);
  });

  it("after_tool_call logs warning when blackboard is not initialized", async () => {
    setBlackboard(null);
    const logs: string[] = [];
    const ctx = {
      runId: "run_tool_2",
      result: "tool output",
      logger: {
        info: (_msg: string) => {},
        error: (_msg: string) => {},
        warn: (msg: string) => logs.push(msg),
      },
      registerHook: () => {},
    };

    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    const afterToolCall = entry.hooks.find((h) => h.event === "after_tool_call");
    await afterToolCall!.handler(ctx);
    expect(logs.some((l) => l.includes("Blackboard not initialized"))).toBe(true);
  });

  it("agent_end writes metrics via blackboard when metrics are present", async () => {
    const bb = new Blackboard({ basePath: TEST_BASE });
    setBlackboard(bb);

    const logs: string[] = [];
    const metrics: ExecutionMetrics = {
      runId: "run_agent_1",
      durationMs: 500,
      success: true,
      timestamp: 1700000000,
    };
    const ctx = {
      metrics,
      logger: {
        info: (msg: string) => logs.push(msg),
        error: (_msg: string) => {},
        warn: (_msg: string) => {},
      },
      registerHook: () => {},
    };

    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    const agentEnd = entry.hooks.find((h) => h.event === "agent_end");
    expect(agentEnd).toBeDefined();
    await agentEnd!.handler(ctx);

    const content = await readFile(join(TEST_BASE, "metrics", "run_agent_1.json"), "utf-8");
    const parsed = JSON.parse(content) as ExecutionMetrics;
    expect(parsed.runId).toBe("run_agent_1");
    expect(logs.some((l) => l.includes("Persisted metrics"))).toBe(true);
  });

  it("agent_end logs warning when blackboard is not initialized", async () => {
    setBlackboard(null);
    const logs: string[] = [];
    const metrics: ExecutionMetrics = {
      runId: "run_agent_2",
      durationMs: 500,
      success: true,
      timestamp: 1700000000,
    };
    const ctx = {
      metrics,
      logger: {
        info: (_msg: string) => {},
        error: (_msg: string) => {},
        warn: (msg: string) => logs.push(msg),
      },
      registerHook: () => {},
    };

    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    const agentEnd = entry.hooks.find((h) => h.event === "agent_end");
    await agentEnd!.handler(ctx);
    expect(logs.some((l) => l.includes("Blackboard not initialized"))).toBe(true);
  });

  it("agent_end ignores context without valid metrics", async () => {
    const bb = new Blackboard({ basePath: TEST_BASE });
    setBlackboard(bb);

    const logs: string[] = [];
    const ctx = {
      metrics: { invalid: true },
      logger: {
        info: (msg: string) => logs.push(msg),
        error: (_msg: string) => {},
        warn: (_msg: string) => {},
      },
      registerHook: () => {},
    };

    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    const agentEnd = entry.hooks.find((h) => h.event === "agent_end");
    await agentEnd!.handler(ctx);
    expect(logs.some((l) => l.includes("Persisted metrics"))).toBe(false);
  });

  it("gateway_stop persists active plans to session state", async () => {
    setActivePlans(["plan_1", "plan_2"]);
    const sessionState: Record<string, unknown> = {};
    const logs: string[] = [];
    const ctx = {
      sessionState,
      logger: {
        info: (msg: string) => logs.push(msg),
        error: (_msg: string) => {},
        warn: (_msg: string) => {},
      },
      registerHook: () => {},
    };

    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    const gatewayStop = entry.hooks.find((h) => h.event === "gateway_stop");
    expect(gatewayStop).toBeDefined();
    await gatewayStop!.handler(ctx);

    expect(sessionState.activePlans).toEqual(["plan_1", "plan_2"]);
    expect(logs.some((l) => l.includes("Persisted 2 active plans"))).toBe(true);
  });

  it("definePluginEntry registers all expected hooks", () => {
    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    const events = entry.hooks.map((h) => h.event);
    expect(events).toContain("gateway_start");
    expect(events).toContain("gateway_stop");
    expect(events).toContain("after_tool_call");
    expect(events).toContain("agent_end");
  });
});
