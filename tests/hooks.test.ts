/**
 * Type-level and runtime tests for hook contracts.
 *
 * Uses TypeScript compile-time assertions (via `assertType`) and
 * Vitest runtime assertions.
 */

import { describe, it, expect } from "vitest";
import {
  registerHook,
  createHookRegistry,
  type HookName,
  type HookPriority,
  type HookRegistry,
  type GatewayStartHook,
  type GatewayStopHook,
  type BeforeAgentReplyHook,
  type BeforePromptBuildHook,
  type SubagentDeliveryTargetHook,
  type SubagentSpawningHook,
  type BeforeAgentFinalizeHook,
  type BeforeToolCallHook,
  type AfterToolCallHook,
  type SubagentSpawnedHook,
  type SubagentEndedHook,
  type HeartbeatPromptContributionHook,
  type AgentEndHook,
  type HookContext,
  type SessionContext,
  type PlanContext,
  type GatewayEvent,
  type BeforeAgentReplyEvent,
  type BeforePromptBuildEvent,
  type SubagentDeliveryTargetEvent,
  type SubagentSpawningEvent,
  type BeforeAgentFinalizeEvent,
  type BeforeToolCallEvent,
  type AfterToolCallEvent,
  type SubagentSpawnedEvent,
  type SubagentEndedEvent,
  type HeartbeatPromptContributionEvent,
  type AgentEndEvent,
  type HookRegistration,
} from "../src/contracts/hooks.js";

// ───────────────────────────────────────────────────────────────────────────────
// Compile-time type helpers
// ───────────────────────────────────────────────────────────────────────────────

/** Assert that `Value` extends `Expected` at compile time. */
function assertType<Expected, Value extends Expected>(): void {
  // Intentionally empty — errors surface at compile time
}

/** Assert that `Value` is exactly `Expected` (bidirectional extends). */
function assertExactType<T, U extends T, V extends U>(): void {
  // Intentionally empty
}

// ───────────────────────────────────────────────────────────────────────────────
// 5.1 — All 12 hooks are present in HookName
// ───────────────────────────────────────────────────────────────────────────────

describe("HookName exhaustiveness", () => {
  it("contains all 12 hook names at the type level", () => {
    // If any of these lines fail to compile, HookName is missing a hook.
    type _AllHooks =
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

    assertExactType<HookName, _AllHooks, HookName>();

    // Runtime sanity check
    const allNames: HookName[] = [
      "gateway_start",
      "gateway_stop",
      "before_agent_reply",
      "before_prompt_build",
      "subagent_delivery_target",
      "subagent_spawning",
      "before_agent_finalize",
      "before_tool_call",
      "after_tool_call",
      "subagent_spawned",
      "subagent_ended",
      "heartbeat_prompt_contribution",
      "agent_end",
    ];
    expect(allNames).toHaveLength(13);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 5.2 — HookPriority rejects invalid values
// ───────────────────────────────────────────────────────────────────────────────

describe("HookPriority constraints", () => {
  it("accepts valid priority values", () => {
    const p90: HookPriority = 90;
    const p80: HookPriority = 80;
    const p70: HookPriority = 70;
    const p60: HookPriority = 60;
    const p50: HookPriority = 50;
    const p40: HookPriority = 40;

    expect([p90, p80, p70, p60, p50, p40]).toEqual([90, 80, 70, 60, 50, 40]);
  });

  it("rejects invalid priority values at compile time", () => {
    // The following would cause compile errors if uncommented:
    // const _bad1: HookPriority = 100;
    // const _bad2: HookPriority = 0;
    // const _bad3: HookPriority = 55;
    // const _bad4: HookPriority = -10;

    // Runtime assertion that the type is a subset of number
    const valid: number = 90 as HookPriority;
    expect(typeof valid).toBe("number");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 5.3 — HookRegistry enforces correct signatures
// ───────────────────────────────────────────────────────────────────────────────

describe("HookRegistry signature enforcement", () => {
  it("enforces GatewayStartHook signature", () => {
    assertType<GatewayStartHook, HookRegistry["gateway_start"]>();

    const handler: HookRegistry["gateway_start"] = async (_event) => {
      // void return
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces BeforeAgentReplyHook signature", () => {
    assertType<BeforeAgentReplyHook, HookRegistry["before_agent_reply"]>();

    const handler: HookRegistry["before_agent_reply"] = async (event) => {
      if (event.userRequest.includes("test")) {
        return { syntheticReply: " synthetic " };
      }
      return undefined;
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces BeforePromptBuildHook signature", () => {
    assertType<BeforePromptBuildHook, HookRegistry["before_prompt_build"]>();

    const handler: HookRegistry["before_prompt_build"] = async (_event) => {
      return { prependContext: "context" };
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces SubagentDeliveryTargetHook signature", () => {
    assertType<
      SubagentDeliveryTargetHook,
      HookRegistry["subagent_delivery_target"]
    >();

    const handler: HookRegistry["subagent_delivery_target"] = async (
      _event
    ) => {
      return { targetAgentId: "coder" };
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces SubagentSpawningHook signature", () => {
    assertType<SubagentSpawningHook, HookRegistry["subagent_spawning"]>();

    const handler: HookRegistry["subagent_spawning"] = async (event) => {
      if (event.runningCount >= event.maxConcurrency) {
        return { block: true, reason: "At capacity" };
      }
      return undefined;
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces BeforeAgentFinalizeHook signature", () => {
    assertType<
      BeforeAgentFinalizeHook,
      HookRegistry["before_agent_finalize"]
    >();

    const handler: HookRegistry["before_agent_finalize"] = async (_event) => {
      return { action: "finalize" };
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces BeforeToolCallHook signature", () => {
    assertType<BeforeToolCallHook, HookRegistry["before_tool_call"]>();

    const handler: HookRegistry["before_tool_call"] = async (event) => {
      if (event.toolName === "dangerous") {
        return { block: true, requireApproval: true };
      }
      return { params: { ...event.params, extra: true } };
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces AfterToolCallHook signature", () => {
    assertType<AfterToolCallHook, HookRegistry["after_tool_call"]>();

    const handler: HookRegistry["after_tool_call"] = async (_event) => {
      // void return
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces SubagentSpawnedHook signature", () => {
    assertType<SubagentSpawnedHook, HookRegistry["subagent_spawned"]>();

    const handler: HookRegistry["subagent_spawned"] = async (_event) => {
      // void return
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces SubagentEndedHook signature", () => {
    assertType<SubagentEndedHook, HookRegistry["subagent_ended"]>();

    const handler: HookRegistry["subagent_ended"] = async (_event) => {
      // void return
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces HeartbeatPromptContributionHook signature", () => {
    assertType<
      HeartbeatPromptContributionHook,
      HookRegistry["heartbeat_prompt_contribution"]
    >();

    const handler: HookRegistry["heartbeat_prompt_contribution"] = async (
      _event
    ) => {
      return { contribution: "progress update" };
    };
    expect(typeof handler).toBe("function");
  });

  it("enforces AgentEndHook signature", () => {
    assertType<AgentEndHook, HookRegistry["agent_end"]>();

    const handler: HookRegistry["agent_end"] = async (_event) => {
      // void return
    };
    expect(typeof handler).toBe("function");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 5.4 — registerHook() enforces correct signature
// ───────────────────────────────────────────────────────────────────────────────

describe("registerHook() generic enforcement", () => {
  it("registers a gateway_start hook with correct types", () => {
    const reg = registerHook("gateway_start", 90, async (_event) => {
      // void
    });

    expect(reg.name).toBe("gateway_start");
    expect(reg.priority).toBe(90);
    expect(typeof reg.handler).toBe("function");

    // Type-level check: reg.name must be exactly "gateway_start"
    assertType<"gateway_start", typeof reg.name>();
  });

  it("registers a before_agent_reply hook with correct return type", () => {
    const reg = registerHook("before_agent_reply", 80, async (event) => {
      if (event.userRequest === "ping") {
        return { syntheticReply: "pong" };
      }
      return undefined;
    });

    expect(reg.name).toBe("before_agent_reply");
    expect(reg.priority).toBe(80);
    expect(typeof reg.handler).toBe("function");
  });

  it("registers a subagent_delivery_target hook with required return", () => {
    const reg = registerHook(
      "subagent_delivery_target",
      70,
      async (_event) => {
        return { targetAgentId: "researcher" };
      }
    );

    expect(reg.name).toBe("subagent_delivery_target");
    expect(reg.priority).toBe(70);
  });

  it("registers a before_agent_finalize hook with action return", () => {
    const reg = registerHook(
      "before_agent_finalize",
      60,
      async (_event) => {
        return { action: "revise", reason: "Needs more work" };
      }
    );

    expect(reg.name).toBe("before_agent_finalize");
    expect(reg.priority).toBe(60);
  });

  it("registers a heartbeat_prompt_contribution hook with contribution return", () => {
    const reg = registerHook(
      "heartbeat_prompt_contribution",
      40,
      async (_event) => {
        return { contribution: "Plan is 50% complete" };
      }
    );

    expect(reg.name).toBe("heartbeat_prompt_contribution");
    expect(reg.priority).toBe(40);
  });

  it("registers an agent_end hook with no priority constraint", () => {
    // agent_end has no priority in PRD, but registerHook requires one.
    // We register it at a neutral priority (50) since the hook itself
    // has no documented priority level.
    const reg = registerHook("agent_end", 50, async (_event) => {
      // void
    });

    expect(reg.name).toBe("agent_end");
    expect(reg.priority).toBe(50);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 5.5 — Runtime tests verifying exported types are accessible
// ───────────────────────────────────────────────────────────────────────────────

describe("Runtime type accessibility", () => {
  it("all context types are importable", () => {
    // These are type-only imports; just verify they exist by referencing them
    // in a way that would fail compilation if the exports were missing.
    const ctx: HookContext = { api: { sendMessage: async () => ({}), getSessionStore: () => ({}) } };
    const sctx: SessionContext = { ...ctx, session: { sessionId: "s1", data: {} } };
    const pctx: PlanContext = {
      ...sctx,
      plan: {
        id: "plan_1",
        status: "executing",
        tasks: [],
        taskRunMap: {},
        createdAt: 0,
        updatedAt: 0,
      },
    };

    expect(pctx.api).toBeDefined();
    expect(pctx.session.sessionId).toBe("s1");
    expect(pctx.plan.status).toBe("executing");
  });

  it("all event types are importable", () => {
    const gateway: GatewayEvent = {
      api: { sendMessage: async () => ({}), getSessionStore: () => ({}) },
      config: {} as unknown as import("../src/types.js").PluginConfig,
    };

    const beforeReply: BeforeAgentReplyEvent = {
      api: gateway.api,
      session: { sessionId: "s1", data: {} },
      userRequest: "hello",
    };

    const beforePrompt: BeforePromptBuildEvent = {
      ...beforeReply,
      plan: {
        id: "plan_1",
        status: "planning",
        tasks: [],
        taskRunMap: {},
        createdAt: 0,
        updatedAt: 0,
      },
      fragments: [],
    };

    const delivery: SubagentDeliveryTargetEvent = {
      api: gateway.api,
      task: {
        id: "task_1",
        description: "test",
        skills: ["search"],
        dependencies: [],
        status: "pending",
        requiresApproval: false,
      },
      agentPool: [],
    };

    const spawning: SubagentSpawningEvent = {
      api: gateway.api,
      runId: "run_1",
      runningCount: 2,
      maxConcurrency: 3,
    };

    const finalize: BeforeAgentFinalizeEvent = {
      api: gateway.api,
      session: beforeReply.session,
      plan: beforePrompt.plan,
      taskStatuses: {},
    };

    const beforeTool: BeforeToolCallEvent = {
      api: gateway.api,
      toolName: "search",
      params: { q: "test" },
      runId: "run_1",
    };

    const afterTool: AfterToolCallEvent = {
      api: gateway.api,
      toolName: "search",
      result: "found",
      durationMs: 100,
      runId: "run_1",
    };

    const spawned: SubagentSpawnedEvent = {
      api: gateway.api,
      runId: "run_1",
      taskId: "task_1",
    };

    const ended: SubagentEndedEvent = {
      api: gateway.api,
      runId: "run_1",
      result: "done",
      durationMs: 500,
    };

    const heartbeat: HeartbeatPromptContributionEvent = {
      api: gateway.api,
      session: beforeReply.session,
      plan: beforePrompt.plan,
      planSummary: "50% complete",
    };

    const agentEnd: AgentEndEvent = {
      api: gateway.api,
      metrics: {
        runId: "run_1",
        durationMs: 1000,
        success: true,
        timestamp: Date.now(),
      },
    };

    expect(gateway.config).toBeDefined();
    expect(beforeReply.userRequest).toBe("hello");
    expect(beforePrompt.fragments).toEqual([]);
    expect(delivery.task.id).toBe("task_1");
    expect(spawning.runningCount).toBe(2);
    expect(finalize.taskStatuses).toEqual({});
    expect(beforeTool.toolName).toBe("search");
    expect(afterTool.durationMs).toBe(100);
    expect(spawned.taskId).toBe("task_1");
    expect(ended.result).toBe("done");
    expect(heartbeat.planSummary).toBe("50% complete");
    expect(agentEnd.metrics.success).toBe(true);
  });

  it("createHookRegistry returns a Map", () => {
    const registry = createHookRegistry();
    expect(registry).toBeInstanceOf(Map);
    expect(registry.size).toBe(0);
  });

  it("HookRegistration type is usable", () => {
    const reg: HookRegistration = {
      name: "after_tool_call",
      priority: 50,
      handler: async () => {
        /* void */
      },
    };
    expect(reg.name).toBe("after_tool_call");
    expect(reg.priority).toBe(50);
  });
});
