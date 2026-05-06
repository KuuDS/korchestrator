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
  getTaskRouter,
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

  api.on("before_agent_reply", async (event: any, _ctx: any) => {
    const pl = getPlanner();
    if (pl === null) {
      api.logger.warn("Planner not initialized, skipping before_agent_reply");
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

        // Store plan in session state if available
        const session = event.session ?? event.context?.session;
        if (session !== undefined) {
          pl.writePlanState(session, plan);
        }

        // Track active plan
        const plans = getActivePlans();
        plans.push(plan.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      api.logger.error(`Classification/planning failed: ${msg}`);
    }
  }, { priority: 80 });

  api.on("before_prompt_build", async (event: any, _ctx: any) => {
    const pl = getPlanner();
    if (pl === null) {
      api.logger.warn("Planner not initialized, skipping before_prompt_build");
      return;
    }

    const session = event.session ?? event.context?.session;
    if (session === undefined) {
      return;
    }

    try {
      const storedPlan = pl.readPlanState(session);
      if (storedPlan !== null) {
        const markdown = pl.toMarkdown(storedPlan);
        api.logger.info(`Injecting plan ${storedPlan.id} into prompt`);
        event.prependContext = markdown;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      api.logger.error(`Prompt build injection failed: ${msg}`);
    }
  }, { priority: 70 });

  api.on("subagent_delivery_target", async (event: any, _ctx: any) => {
    const tr = getTaskRouter();
    if (tr === null) {
      api.logger.warn("TaskRouter not initialized, skipping subagent_delivery_target");
      return;
    }

    const task = event.task;
    if (task === undefined) {
      api.logger.warn("No task provided for subagent_delivery_target");
      return;
    }

    try {
      const agent = tr.routeBySkill(task);
      api.logger.info(`Routed task ${task.id} to agent ${agent.agentId}`);
      event.targetAgentId = agent.agentId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      api.logger.error(`Task routing failed: ${msg}`);
    }
  }, { priority: 70 });

  api.on("subagent_spawning", async (event: any, _ctx: any) => {
    const tr = getTaskRouter();
    if (tr === null) {
      api.logger.warn("TaskRouter not initialized, skipping subagent_spawning");
      return;
    }

    const plan = event.plan ?? event.context?.session?.pluginExtensions?.plan_state;
    if (plan === undefined) {
      api.logger.warn("No plan provided for subagent_spawning");
      return;
    }

    try {
      const result = tr.checkConcurrency(plan);
      if (result.block) {
        api.logger.info(`Blocked spawn: ${result.reason ?? "unknown reason"}`);
        event.block = true;
        event.reason = result.reason;
      } else {
        event.block = false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      api.logger.error(`Concurrency check failed: ${msg}`);
      event.block = true;
      event.reason = msg;
    }
  }, { priority: 70 });

  api.on("subagent_spawned", async (event: any, _ctx: any) => {
    const tr = getTaskRouter();
    if (tr === null) {
      api.logger.warn("TaskRouter not initialized, skipping subagent_spawned");
      return;
    }

    const runId = event.runId;
    let taskId = event.taskId;
    const plan = event.plan ?? event.context?.session?.pluginExtensions?.plan_state;

    if (typeof runId !== "string" || plan === undefined) {
      api.logger.warn("Missing runId or plan for subagent_spawned");
      return;
    }

    // Fallback: infer taskId from plan if not provided directly
    if (typeof taskId !== "string") {
      const runningTask = plan.tasks.find(
        (t: import("./types.js").Task) => t.status === "running" && !plan.taskRunMap[runId]
      );
      if (runningTask !== undefined) {
        taskId = runningTask.id;
      }
    }

    if (typeof taskId !== "string") {
      api.logger.warn(`No taskId mapped or inferred for run ${runId} in subagent_spawned`);
      return;
    }

    try {
      await tr.trackLifecycle({ type: "spawned", runId, taskId }, plan);
      api.logger.info(`Tracked spawned lifecycle for run ${runId}, task ${taskId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      api.logger.error(`Lifecycle tracking (spawned) failed: ${msg}`);
    }
  }, { priority: 50 });

  api.on("subagent_ended", async (event: any, _ctx: any) => {
    const tr = getTaskRouter();
    if (tr === null) {
      api.logger.warn("TaskRouter not initialized, skipping subagent_ended");
      return;
    }

    const runId = event.runId;
    const result = event.result;
    const plan = event.plan ?? event.context?.session?.pluginExtensions?.plan_state;

    if (typeof runId !== "string" || plan === undefined) {
      api.logger.warn("Missing runId or plan for subagent_ended");
      return;
    }

    const taskId = plan.taskRunMap[runId];
    if (taskId === undefined) {
      api.logger.warn(`No taskId mapped for run ${runId} in subagent_ended`);
      return;
    }

    try {
      await tr.trackLifecycle(
        { type: "ended", runId, taskId, result: typeof result === "string" ? result : undefined },
        plan
      );
      api.logger.info(`Tracked ended lifecycle for run ${runId}, task ${taskId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      api.logger.error(`Lifecycle tracking (ended) failed: ${msg}`);
    }
  }, { priority: 50 });

  api.on("after_tool_call", async (event: any, _ctx: any) => {
    const bb = getBlackboard();
    if (bb === null) {
      api.logger.warn("Blackboard not initialized, skipping after_tool_call");
      return;
    }

    const runId = event.runId;
    const result = event.result;

    if (typeof runId === "string" && result !== undefined) {
      try {
        await bb.writeResult(runId, String(result));
        api.logger.info(`Persisted result for run ${runId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        api.logger.error(`Failed to persist result for run ${runId}: ${msg}`);
      }
    }
  }, { priority: 50 });

  api.on("agent_end", async (event: any, _ctx: any) => {
    const bb = getBlackboard();
    if (bb === null) {
      api.logger.warn("Blackboard not initialized, skipping agent_end");
      return;
    }

    let metrics: unknown = event.metrics;
    if (
      metrics === undefined &&
      typeof event.runId === "string" &&
      event.durationMs !== undefined
    ) {
      metrics = {
        runId: event.runId,
        durationMs: event.durationMs,
        success: event.success,
        timestamp: Date.now(),
      };
    }

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
        api.logger.info(`Persisted metrics for run ${runId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        api.logger.error(`Failed to persist metrics for run ${runId}: ${msg}`);
      }
    }
  }, { priority: 50 });

  api.logger.info("Plan-subagent plugin registered successfully");
}
