// index.ts — Plan-Subagent 插件入口
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Planner } from "./planner";
import { TaskRouter, defaultRoles } from "./router";
import { Replanner } from "./replanner";
import { Blackboard } from "./blackboard";
import { PlanState, PluginConfig } from "./types";

export default definePluginEntry({
  id: "plan-subagent",
  name: "Plan-Subagent Orchestrator",

  register(api) {
    // 通过 event.context.pluginConfig 获取配置
    const config: PluginConfig = api.config || {};
    const planner = new Planner({ 
      model: config.plannerModel || "gpt-4o-mini",
      skipClassification: config.skipClassification || false,
      classificationRules: config.classificationRules
    });
    const router = new TaskRouter({
      maxConcurrency: config.maxConcurrency || 3,
      agentPool: config.agentRoles || defaultRoles
    });
    const replanner = new Replanner({ model: config.replannerModel || "gpt-4o-mini" });
    const blackboard = new Blackboard("./workspace");

    // 1. 注册会话扩展（Plan 状态持久化）
    api.registerSessionExtension({
      id: "plan_state",
      defaultValue: { id: "", status: "idle", tasks: [], taskRunMap: {}, createdAt: 0, updatedAt: 0 } as PlanState,
      onCleanup(reason: "reset" | "delete" | "disable" | "restart") {
        console.log(`[Plan-Subagent] Cleanup: ${reason}`);
        // 根据 reason 差异化清理 Blackboard 临时文件
        blackboard.cleanup(reason);
      }
    });

    // 2. before_agent_reply — 复杂任务检测 + Plan 生成
    api.on("before_agent_reply", async (event) => {
      try {
        const complexity = await planner.classify(event.prompt);
        if (complexity === "simple") return; // 不干预

        const plan = await planner.createPlan(event.prompt);
        
        // 通过 event.context.sessions.pluginPatch 更新 Session Extension
        await event.context.sessions.pluginPatch("plan_state", plan);

        // 方案A：直接在当前轮次执行，不返回 syntheticReply 短路
        return;
      } catch (error) {
        console.error("[Plan-Subagent] Plan generation failed:", error);
        return {
          syntheticReply: "任务分解失败，将使用标准流程处理您的请求。"
        };
      }
    }, { priority: 80 });

    // 3. before_prompt_build — Plan 上下文注入
    api.on("before_prompt_build", async (event) => {
      try {
        // 通过 event.context 获取 Plan 状态
        const plan = event.context.session?.pluginExtensions?.plan_state;
        if (!plan || plan.status === "idle") return;

        const readyTasks = router.getReadyTasks(plan);
        if (readyTasks.length === 0) return;

        return {
          prependContext: `
## 执行计划
${planner.toMarkdown(plan)}

当前就绪任务（${readyTasks.length}个）：
${readyTasks.map(t => `- ${t.id}: ${t.description} [skills: ${t.skills.join(", ")}]`).join("\n")}

请调度执行上述任务，每个任务调用对应工具完成。
          `
        };
      } catch (error) {
        console.error("[Plan-Subagent] Prompt build failed:", error);
        return;
      }
    }, { priority: 70 });

    // 4. subagent_spawning — 并发控制 + 任务状态标记
    api.on("subagent_spawning", async (event) => {
      try {
        const plan = event.context.session?.pluginExtensions?.plan_state;
        if (!plan || plan.status === "idle") return;

        // 检查并发数限制
        const runningCount = plan.tasks.filter((t: { status: string }) => t.status === "running").length;
        if (runningCount >= router.maxConcurrency) {
          return { block: true, reason: "并发数限制" };
        }

        // 标记任务为 running 状态
        const taskId = plan.taskRunMap[event.runId];
        if (taskId) {
          const task = plan.tasks.find((t: { id: string }) => t.id === taskId);
          if (task) {
            task.status = "running";
            task.startedAt = Date.now();
            await event.context.sessions.pluginPatch("plan_state", plan);
          }
        }
      } catch (error) {
        console.error("[Plan-Subagent] Subagent spawning failed:", error);
      }
    }, { priority: 70 });

    // 5. subagent_delivery_target — Skill 匹配路由
    api.on("subagent_delivery_target", async (event) => {
      try {
        const target = router.routeBySkill(event.task);
        return { targetAgentId: target.agentId };
      } catch (error) {
        console.error("[Plan-Subagent] Route failed:", error);
        return { targetAgentId: "coder" }; // 降级到默认角色
      }
    }, { priority: 70 });

    // 6. before_tool_call — 工具拦截 + 审批
    api.on("before_tool_call", async (event) => {
      try {
        const plan = event.context.session?.pluginExtensions?.plan_state;
        if (!plan || plan.status === "idle") return;

        // 通过 runId 查找对应 task
        const taskId = plan.taskRunMap[event.runId];
        const task = plan.tasks.find((t: { id: string }) => t.id === taskId);
        
        if (task?.requiresApproval) {
          return {
            requireApproval: true,
            onResolution: (decision: "approve" | "approveAll" | "reject") => {
              if (decision === "reject") {
                return { block: true, reason: "用户拒绝执行" };
              }
              task.requiresApproval = false;
              return { block: false };
            }
          };
        }

        // 参数验证和重写
        return { params: event.params };
      } catch (error) {
        console.error("[Plan-Subagent] Tool call intercept failed:", error);
        return;
      }
    }, { priority: 50 });

    // 7. after_tool_call — 结果收集 + 状态更新
    api.on("after_tool_call", async (event) => {
      try {
        const plan = event.context.session?.pluginExtensions?.plan_state;
        if (!plan || plan.status === "idle") return;

        // 通过 taskRunMap 查找对应任务
        const taskId = plan.taskRunMap[event.runId];
        const task = plan.tasks.find((t: { id: string }) => t.id === taskId);
        
        if (task) {
          task.status = event.error ? "failed" : "done";
          task.result = event.result?.content || "";
          task.completedAt = Date.now();

          // 写入 Blackboard
          await blackboard.writeResult(task.id, task.result);

          // 更新 Session Extension
          await event.context.sessions.pluginPatch("plan_state", plan);
        }
      } catch (error) {
        console.error("[Plan-Subagent] Result collection failed:", error);
      }
    });

    // 8. subagent_spawned — 生命周期跟踪（建立 runId→taskId 映射）
    api.on("subagent_spawned", async (event) => {
      try {
        const plan = event.context.session?.pluginExtensions?.plan_state;
        if (!plan || plan.status === "idle") return;

        // 建立 runId → taskId 映射
        const task = plan.tasks.find((t: { status: string }) => t.status === "running" && !plan.taskRunMap[event.runId]);
        if (task) {
          plan.taskRunMap[event.runId] = task.id;
          await event.context.sessions.pluginPatch("plan_state", plan);
        }

        console.log(`[Plan-Subagent] Subagent spawned: runId=${event.runId}, taskId=${task?.id}`);
      } catch (error) {
        console.error("[Plan-Subagent] Subagent spawned tracking failed:", error);
      }
    });

    // 9. subagent_ended — 生命周期跟踪（清理映射）
    api.on("subagent_ended", async (event) => {
      try {
        const plan = event.context.session?.pluginExtensions?.plan_state;
        if (!plan || plan.status === "idle") return;

        // 清理 taskRunMap
        delete plan.taskRunMap[event.runId];
        await event.context.sessions.pluginPatch("plan_state", plan);

        console.log(`[Plan-Subagent] Subagent ended: runId=${event.runId}`);
      } catch (error) {
        console.error("[Plan-Subagent] Subagent ended tracking failed:", error);
      }
    });

    // 10. before_agent_finalize — Replanner 重规划决策
    api.on("before_agent_finalize", async (event) => {
      try {
        const plan = event.context.session?.pluginExtensions?.plan_state;
        if (!plan || plan.status === "idle") return;

        const health = await replanner.check(plan);
        if (health.needsReroute) {
          const newPlan = await replanner.replan(plan, health.failedTasks);
          await event.context.sessions.pluginPatch("plan_state", newPlan);
          return { action: "revise", reason: health.reason };
        }

        // 全部完成，更新状态
        plan.status = "done";
        await event.context.sessions.pluginPatch("plan_state", plan);
        return { action: "finalize" };
      } catch (error) {
        console.error("[Plan-Subagent] Finalize decision failed:", error);
        return { action: "finalize" };
      }
    }, { priority: 60 });

    // 11. heartbeat_prompt_contribution — 执行进度汇报
    api.on("heartbeat_prompt_contribution", async (event) => {
      try {
        const plan = event.context.session?.pluginExtensions?.plan_state;
        if (!plan || plan.status === "idle") return;

        const progress = router.getProgress(plan);
        return {
          contribution: `
[Plan-Subagent] 当前计划执行进度：
- 总计：${progress.total} 个任务
- 已完成：${progress.done} 个
- 失败：${progress.failed} 个
- 进行中：${progress.running} 个
- 等待中：${progress.pending} 个
          `
        };
      } catch (error) {
        console.error("[Plan-Subagent] Heartbeat failed:", error);
        return;
      }
    });

    // 12. agent_end — 执行指标记录
    api.on("agent_end", async (event) => {
      try {
        // 结构化输出执行指标到 Blackboard
        const metrics = {
          runId: event.runId,
          durationMs: event.durationMs,
          success: event.success,
          timestamp: Date.now()
        };
        await blackboard.writeMetrics(event.runId, JSON.stringify(metrics, null, 2));
        console.log(`[Plan-Subagent] Agent ended: runId=${event.runId}, duration=${event.durationMs}ms, success=${event.success}`);
      } catch (error) {
        console.error("[Plan-Subagent] Metrics logging failed:", error);
      }
    });
  }
});
