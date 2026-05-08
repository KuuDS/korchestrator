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

function createMockApi(opts: { logs?: string[] } = {}) {
  const hooks: Record<string, Array<{ handler: Function; priority: number }>> = {};
  const logs = opts.logs ?? [];
  return {
    logger: {
      info: (msg: string) => logs.push(msg),
      error: (_msg: string) => {},
      warn: (msg: string) => logs.push(msg),
      debug: (_msg: string) => {},
    },
    on: vi.fn((hookName: string, handler: Function, opts: { priority: number }) => {
      if (!hooks[hookName]) hooks[hookName] = [];
      hooks[hookName].push({ handler, priority: opts.priority });
      hooks[hookName].sort((a, b) => a.priority - b.priority);
    }),
    registerSessionExtension: vi.fn(),
    resolvePath: vi.fn((input: string) => input),
    hooks,
  };
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
    const logs: string[] = [];
    const mockApi = createMockApi({ logs });
    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    entry.register(mockApi);

    const gatewayStart = mockApi.hooks["gateway_start"]?.[0];
    expect(gatewayStart).toBeDefined();

    // Reset blackboard so we can verify the handler creates it
    setBlackboard(null);

    await gatewayStart!.handler({
      context: {
        configPath: "/fake/plugin.json",
      },
    });

    const bb = getBlackboard();
    expect(bb).not.toBeNull();
  });

  it("after_tool_call writes result via blackboard when runId and result are present", async () => {
    const logs: string[] = [];
    const mockApi = createMockApi({ logs });
    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    entry.register(mockApi);

    // Set test blackboard AFTER register() so it overrides the one created during registration
    const bb = new Blackboard({ basePath: TEST_BASE });
    setBlackboard(bb);

    const afterToolCall = mockApi.hooks["after_tool_call"]?.[0];
    expect(afterToolCall).toBeDefined();
    await afterToolCall!.handler({
      runId: "run_tool_1",
      result: "tool output",
      context: {},
    });

    const content = await readFile(join(TEST_BASE, "results", "run_tool_1.md"), "utf-8");
    expect(content).toBe("tool output");
    expect(logs.some((l) => l.includes("Persisted result"))).toBe(true);
  });

  it("after_tool_call logs warning when blackboard is not initialized", async () => {
    const logs: string[] = [];
    const mockApi = createMockApi({ logs });
    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    entry.register(mockApi);

    // Null out the blackboard AFTER register() created one
    setBlackboard(null);

    const afterToolCall = mockApi.hooks["after_tool_call"]?.[0];
    await afterToolCall!.handler({
      runId: "run_tool_2",
      result: "tool output",
      context: {},
    });
    expect(logs.some((l) => l.includes("Blackboard not initialized"))).toBe(true);
  });

  it("agent_end writes metrics via blackboard when metrics are present", async () => {
    const logs: string[] = [];
    const mockApi = createMockApi({ logs });
    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    entry.register(mockApi);

    // Set test blackboard AFTER register() so it overrides the one created during registration
    const bb = new Blackboard({ basePath: TEST_BASE });
    setBlackboard(bb);

    const agentEnd = mockApi.hooks["agent_end"]?.[0];
    expect(agentEnd).toBeDefined();

    const metrics: ExecutionMetrics = {
      runId: "run_agent_1",
      durationMs: 500,
      success: true,
      timestamp: 1700000000,
    };
    await agentEnd!.handler({
      metrics,
      context: {},
    });

    const content = await readFile(join(TEST_BASE, "metrics", "run_agent_1.json"), "utf-8");
    const parsed = JSON.parse(content) as ExecutionMetrics;
    expect(parsed.runId).toBe("run_agent_1");
    expect(logs.some((l) => l.includes("Persisted metrics"))).toBe(true);
  });

  it("agent_end logs warning when blackboard is not initialized", async () => {
    const logs: string[] = [];
    const mockApi = createMockApi({ logs });
    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    entry.register(mockApi);

    // Null out the blackboard AFTER register() created one
    setBlackboard(null);

    const agentEnd = mockApi.hooks["agent_end"]?.[0];

    const metrics: ExecutionMetrics = {
      runId: "run_agent_2",
      durationMs: 500,
      success: true,
      timestamp: 1700000000,
    };
    await agentEnd!.handler({
      metrics,
      context: {},
    });
    expect(logs.some((l) => l.includes("Blackboard not initialized"))).toBe(true);
  });

  it("agent_end ignores context without valid metrics", async () => {
    const logs: string[] = [];
    const mockApi = createMockApi({ logs });
    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    entry.register(mockApi);

    // Set test blackboard AFTER register() so it overrides the one created during registration
    const bb = new Blackboard({ basePath: TEST_BASE });
    setBlackboard(bb);

    const agentEnd = mockApi.hooks["agent_end"]?.[0];
    await agentEnd!.handler({
      metrics: { invalid: true },
      context: {},
    });
    expect(logs.some((l) => l.includes("Persisted metrics"))).toBe(false);
  });

  it("gateway_stop persists active plans to session state", async () => {
    setActivePlans(["plan_1", "plan_2"]);
    const sessionState: Record<string, unknown> = {};
    const logs: string[] = [];
    const mockApi = createMockApi({ logs });
    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    entry.register(mockApi);

    const gatewayStop = mockApi.hooks["gateway_stop"]?.[0];
    expect(gatewayStop).toBeDefined();
    await gatewayStop!.handler({
      context: {
        sessionState,
      },
    });

    expect(sessionState.activePlans).toEqual(["plan_1", "plan_2"]);
    expect(logs.some((l) => l.includes("Persisted 2 active plans"))).toBe(true);
  });

  it("definePluginEntry registers all expected hooks", () => {
    const entry = definePluginEntry({ id: "test", name: "Test", version: "0.0.1" });
    const mockApi = createMockApi();
    entry.register(mockApi);
    expect(mockApi.hooks["gateway_start"]).toBeDefined();
    expect(mockApi.hooks["gateway_stop"]).toBeDefined();
    expect(mockApi.hooks["after_tool_call"]).toBeDefined();
    expect(mockApi.hooks["agent_end"]).toBeDefined();
  });
});
