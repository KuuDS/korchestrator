// blackboard.ts — Markdown 驱动的共享状态（含差异化 cleanup 策略）
import { mkdir, readFile, writeFile, rm } from "fs/promises";
import { dirname, join } from "path";

export type CleanupReason = "reset" | "delete" | "disable" | "restart";

export class Blackboard {
  private basePath: string;

  constructor(basePath: string = "./workspace") {
    this.basePath = basePath;
  }

  async writeResult(taskId: string, content: string): Promise<void> {
    try {
      const path = join(this.basePath, "WORKSPACE", `${taskId}.md`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
    } catch (error) {
      console.error(`[Blackboard] Failed to write result for ${taskId}:`, error);
    }
  }

  async readResult(taskId: string): Promise<string> {
    try {
      const path = join(this.basePath, "WORKSPACE", `${taskId}.md`);
      return await readFile(path, "utf-8");
    } catch {
      return "";
    }
  }

  async writePlan(planId: string, content: string): Promise<void> {
    try {
      const path = join(this.basePath, "PLANS", `${planId}.md`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
    } catch (error) {
      console.error(`[Blackboard] Failed to write plan ${planId}:`, error);
    }
  }

  async writeMetrics(runId: string, content: string): Promise<void> {
    try {
      const path = join(this.basePath, "METRICS", `${runId}.json`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
    } catch (error) {
      console.error(`[Blackboard] Failed to write metrics for ${runId}:`, error);
    }
  }

  async aggregateResults(taskIds: string[]): Promise<string> {
    const results: string[] = [];
    for (const id of taskIds) {
      const content = await this.readResult(id);
      if (content) {
        results.push(`## Task: ${id}\n\n${content}`);
      }
    }
    return results.join("\n\n---\n\n");
  }

  /**
   * 根据 cleanup reason 采取差异化清理策略
   * 
   * - reset: 清空 WORKSPACE 和 METRICS，保留 PLANS（历史记录）
   * - delete: 清空所有目录（完全清理）
   * - disable: 不做清理，仅标记状态（保留所有数据）
   * - restart: 清空 WORKSPACE 和 METRICS，保留 PLANS（保留历史 Plan）
   */
  async cleanup(reason: CleanupReason): Promise<void> {
    try {
      const workspacePath = join(this.basePath, "WORKSPACE");
      const metricsPath = join(this.basePath, "METRICS");
      const plansPath = join(this.basePath, "PLANS");

      switch (reason) {
        case "reset": {
          // 清空 WORKSPACE 和 METRICS，保留 PLANS
          await rm(workspacePath, { recursive: true, force: true });
          await rm(metricsPath, { recursive: true, force: true });
          console.log("[Blackboard] Cleanup (reset): WORKSPACE and METRICS cleared, PLANS preserved");
          break;
        }

        case "delete": {
          // 清空所有目录（完全清理）
          await rm(workspacePath, { recursive: true, force: true });
          await rm(metricsPath, { recursive: true, force: true });
          await rm(plansPath, { recursive: true, force: true });
          console.log("[Blackboard] Cleanup (delete): all directories cleared");
          break;
        }

        case "disable": {
          // 不做清理，仅标记状态
          console.log("[Blackboard] Cleanup (disable): no cleanup performed, state preserved");
          break;
        }

        case "restart": {
          // 清空 WORKSPACE 和 METRICS，保留 PLANS（保留历史 Plan 记录）
          await rm(workspacePath, { recursive: true, force: true });
          await rm(metricsPath, { recursive: true, force: true });
          console.log("[Blackboard] Cleanup (restart): WORKSPACE and METRICS cleared, PLANS preserved");
          break;
        }

        default: {
          // 默认行为：保守处理，不清空
          console.log(`[Blackboard] Cleanup (unknown reason: ${reason}): no cleanup performed`);
        }
      }
    } catch (error) {
      console.error("[Blackboard] Cleanup failed:", error);
    }
  }
}
