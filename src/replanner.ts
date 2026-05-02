// replanner.ts — 动态重规划
import { Task, Plan, HealthCheck, RepairDecision } from "./types";

export class Replanner {
  // _model: string; // 保留用于未来的 LLM 调用实现
  // maxRetries: number; // 保留用于未来的重试限制实现

  constructor(_config: { model: string; maxRetries?: number }) {
    // this._model = config.model;
    // this.maxRetries = config.maxRetries || 3;
  }

  async check(plan: Plan): Promise<HealthCheck> {
    try {
      const failed = plan.tasks.filter(t => t.status === "failed");
      const running = plan.tasks.filter(t => t.status === "running");

      // 全部完成
      if (failed.length === 0 && running.length === 0 &&
          plan.tasks.every(t => t.status === "done" || t.status === "skipped")) {
        return { needsReroute: false, failedTasks: [] };
      }

      // 有失败任务需要重规划
      if (failed.length > 0) {
        // 修复：计算总重试次数，而非"有重试记录的任务数"
        const retryCount = failed.reduce((sum, t) => sum + (t._retryCount || 0), 0);
        return {
          needsReroute: true,
          failedTasks: failed,
          reason: `${failed.length} 个任务失败（已重试 ${retryCount} 次），需要重规划`
        };
      }

      // 还有运行中的任务，继续等待
      if (running.length > 0) {
        return { needsReroute: false, failedTasks: [] };
      }

      return { needsReroute: false, failedTasks: [] };
    } catch (error) {
      console.error("[Replanner] Health check failed:", error);
      return { needsReroute: false, failedTasks: [] };
    }
  }

  async replan(plan: Plan, failedTasks: Task[]): Promise<Plan> {
    try {
      // 这里应该是真实的 LLM 调用
      // const prompt = `...`;
      // const response = await this.callLLM(prompt, { responseFormat: { type: "json_object" } });
      
      // 默认使用 retry 策略
      const decision: RepairDecision = { 
        strategy: "retry", 
        reason: "默认重试策略" 
      };

      return this.applyFix(plan, failedTasks, decision);
    } catch (error) {
      console.error("[Replanner] Replan failed:", error);
      // 降级：默认 retry 策略
      return this.applyFix(plan, failedTasks, { 
        strategy: "retry", 
        reason: "重规划失败，默认重试" 
      });
    }
  }

  private applyFix(plan: Plan, failed: Task[], decision: RepairDecision): Plan {
    switch (decision.strategy) {
      case "retry": {
        // 重置失败任务为 pending，增加重试计数
        for (const task of plan.tasks) {
          if (failed.some(f => f.id === task.id)) {
            task.status = "pending";
            task._retryCount = (task._retryCount || 0) + 1;
          }
        }
        break;
      }

      case "decompose": {
        // 移除失败任务，插入新的子任务
        const failedIds = new Set(failed.map(f => f.id));
        plan.tasks = plan.tasks.filter(t => !failedIds.has(t.id));
        if (decision.newTasks && decision.newTasks.length > 0) {
          const newTasks = decision.newTasks.map(t => ({
            ...t,
            status: "pending" as const,
            dependencies: t.dependencies || []
          }));
          plan.tasks.push(...newTasks);
        }
        break;
      }

      case "skip": {
        // 标记失败任务为 skipped
        for (const task of plan.tasks) {
          if (failed.some(f => f.id === task.id)) {
            task.status = "skipped";
            task.result = "[skipped by replanner]";
          }
        }
        break;
      }

      case "escalate": {
        // 标记需要审批，重置为 pending
        for (const task of plan.tasks) {
          if (failed.some(f => f.id === task.id)) {
            task.status = "pending";
            task.requiresApproval = true;
          }
        }
        break;
      }

      default: {
        // 未知策略，默认 retry
        for (const task of plan.tasks) {
          if (failed.some(f => f.id === task.id)) {
            task.status = "pending";
          }
        }
      }
    }

    plan.updatedAt = Date.now();
    return plan;
  }
}
