/**
 * OpenClaw-compatible plugin entry point.
 *
 * This module adapts the plan-subagent plugin to OpenClaw's plugin API
 * (register(api) with api.on() for hook registration).
 */

import {
  setConfigManager,
  getBlackboard,
  setBlackboard,
  getPlanner,
  setPlanner,
  setTaskRouter,
  setReplanner,
  getActivePlans,
} from "./index.js";
import { ConfigManager } from "./config.js";
import { Blackboard } from "./blackboard.js";
import { Planner } from "./planner.js";
import { TaskRouter } from "./router.js";
import { Replanner } from "./replanner.js";
import { DEFAULT_CONFIG, PluginConfigSchema } from "./types.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

let watcherHandle: { stop: () => void } | null = null;

function resolvePluginPath(relativePath: string): string {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(currentFile), relativePath);
  } catch {
    return path.resolve(process.cwd(), relativePath);
  }
}

function loadConfigSync(configPath: string): unknown {
  const content = readFileSync(configPath, "utf-8");
  return JSON.parse(content) as unknown;
}

/**
 * Register the plugin with OpenClaw.
 */
export default function register(api: any): void {
  api.logger.info("Plan-subagent plugin registering...");

  // Initialize config manager
  const cm = new ConfigManager();
  setConfigManager(cm);

  const configPath = resolvePluginPath("../plugin.json");
  try {
    const raw = loadConfigSync(configPath);
    const parseResult = PluginConfigSchema.safeParse(raw);
    if (parseResult.success) {
      cm.setConfig(parseResult.data);
      api.logger.info(`Config loaded from ${configPath}`);
    } else {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      api.logger.error(`Config validation failed: ${issues}. Using default config.`);
      cm.setConfig(DEFAULT_CONFIG);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    api.logger.error(`Failed to load config: ${msg}. Using default config.`);
    cm.setConfig(DEFAULT_CONFIG);
  }

  const config = cm.getConfig();

  // Initialize Blackboard
  const bb = new Blackboard({
    basePath: resolvePluginPath("../workspace"),
    metricsOutput: config.metricsOutput,
    metricsWebhook: config.metricsWebhook,
    metricsOtelEndpoint: config.metricsOtelEndpoint,
  });
  setBlackboard(bb);
  api.logger.info("Blackboard initialized");

  // Initialize Planner
  const pl = new Planner(
    {
      model: config.plannerModel,
      maxTasks: 20,
      classificationRules: config.classificationRules,
      skipClassification: config.skipClassification,
    },
    async (prompt: string) => {
      api.logger.warn(`LLM generate called but no real backend wired. Prompt length: ${prompt.length}`);
      return "complex";
    }
  );
  setPlanner(pl);
  pl.registerSessionExtension();
  api.logger.info("Planner initialized");

  // Initialize TaskRouter
  const tr = new TaskRouter({
    maxConcurrency: config.maxConcurrency,
    agentPool: config.agentRoles,
  });
  setTaskRouter(tr);
  api.logger.info(`TaskRouter initialized with maxConcurrency=${config.maxConcurrency}`);

  // Initialize Replanner
  const rp = new Replanner({
    model: config.replannerModel,
    maxRetries: 3,
    generate: async (prompt: string) => {
      api.logger.warn(`Replanner LLM generate called but no real backend wired. Prompt length: ${prompt.length}`);
      return JSON.stringify({ strategy: "retry", reason: "Default fallback" });
    },
  });
  setReplanner(rp);
  api.logger.info("Replanner initialized");

  // Register hooks using OpenClaw api.on()
  api.on("gateway_start", async (_event: any, _ctx: any) => {
    api.logger.info("Gateway start hook fired");
  }, { priority: 90 });

  api.on("gateway_stop", async (_event: any, _ctx: any) => {
    if (watcherHandle !== null) {
      watcherHandle.stop();
      watcherHandle = null;
      api.logger.info("Stopped config file watcher");
    }
    const plans = getActivePlans();
    if (plans.length > 0) {
      api.logger.info(`Persisted ${plans.length} active plans`);
    }
  }, { priority: 90 });

  api.on("before_agent_start", async (event: any, _ctx: any) => {
    const pl = getPlanner();
    if (pl === null) {
      api.logger.warn("Planner not initialized, skipping before_agent_start");
      return;
    }
    const request = event.prompt;
    if (!request || request.length === 0) {
      return;
    }
    try {
      const classification = await pl.classify(request);
      api.logger.info(`Request classified as: ${classification}`);
      if (classification === "complex") {
        const plan = await pl.createPlan(request);
        api.logger.info(`Created plan ${plan.id} with ${plan.tasks.length} tasks`);
        const plans = getActivePlans();
        plans.push(plan.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      api.logger.error(`Classification/planning failed: ${msg}`);
    }
  }, { priority: 80 });

  api.on("before_prompt_build", async (_event: any, _ctx: any) => {
    const pl = getPlanner();
    if (pl === null) {
      api.logger.warn("Planner not initialized, skipping before_prompt_build");
      return;
    }
    // Note: OpenClaw passes prompt/messages but not a session object directly.
    // We skip injection here because the session abstraction differs.
    api.logger.info("Before prompt build hook fired");
  }, { priority: 70 });

  api.on("subagent_delivery_target", async (_event: any, _ctx: any) => {
    api.logger.info("Subagent delivery target hook fired");
  }, { priority: 70 });

  api.on("subagent_spawning", async (_event: any, _ctx: any) => {
    api.logger.info("Subagent spawning hook fired");
  }, { priority: 70 });

  api.on("subagent_spawned", async (_event: any, _ctx: any) => {
    api.logger.info("Subagent spawned hook fired");
  }, { priority: 50 });

  api.on("subagent_ended", async (_event: any, _ctx: any) => {
    api.logger.info("Subagent ended hook fired");
  }, { priority: 50 });

  api.on("after_tool_call", async (_event: any, _ctx: any) => {
    const bb = getBlackboard();
    if (bb === null) {
      api.logger.warn("Blackboard not initialized, skipping after_tool_call");
      return;
    }
    // Note: OpenClaw passes toolName/result but not runId directly.
    api.logger.info("After tool call hook fired");
  }, { priority: 50 });

  api.on("agent_end", async (_event: any, _ctx: any) => {
    const bb = getBlackboard();
    if (bb === null) {
      api.logger.warn("Blackboard not initialized, skipping agent_end");
      return;
    }
    // Note: OpenClaw passes messages/success/durationMs but not metrics object.
    api.logger.info("Agent end hook fired");
  }, { priority: 50 });

  api.logger.info("Plan-subagent plugin registered successfully");
}
