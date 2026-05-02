// router.ts — Skill 匹配路由
import { Task, Plan, AgentRole } from "./types";

export const defaultRoles: AgentRole[] = [
  { agentId: "researcher", name: "Researcher", skills: ["search", "browser"], model: "gpt-4o-mini" },
  { agentId: "coder", name: "Coder", skills: ["shell", "code", "file"], model: "gpt-4o" },
  { agentId: "browser", name: "BrowserOperator", skills: ["browser"], model: "gpt-4o-mini" },
  { agentId: "reviewer", name: "Reviewer", skills: ["file", "code"], model: "gpt-4o-mini" }
];

export class TaskRouter {
  maxConcurrency: number;
  private agentPool: AgentRole[];

  constructor(config: { maxConcurrency: number; agentPool: AgentRole[] }) {
    this.maxConcurrency = config.maxConcurrency;
    this.agentPool = config.agentPool;
  }

  /** 获取依赖已满足的就绪任务 */
  getReadyTasks(plan: Plan): Task[] {
    const completedIds = new Set(
      plan.tasks.filter(t => t.status === "done" || t.status === "skipped").map(t => t.id)
    );

    return plan.tasks.filter(t =>
      t.status === "pending" &&
      t.dependencies.every(depId => completedIds.has(depId))
    );
  }

  /** 根据 Skill 匹配最佳 Subagent */
  routeBySkill(task: Task): AgentRole {
    // 1. 精确匹配：所有 skill 都被覆盖
    const exactMatches = this.agentPool.filter(agent =>
      task.skills.every(skill => agent.skills.includes(skill))
    );

    if (exactMatches.length > 0) {
      // 选择最专精的（skill 最少但满足需求的）
      return exactMatches.sort((a, b) => a.skills.length - b.skills.length)[0];
    }

    // 2. 最大交集匹配
    const scored = this.agentPool.map(agent => ({
      agent,
      score: task.skills.filter(s => agent.skills.includes(s)).length
    }));

    scored.sort((a, b) => b.score - a.score);

    if (scored[0].score === 0) {
      // 3. 降级：返回通用角色（Coder 默认）
      return this.agentPool.find(a => a.agentId === "coder") || this.agentPool[0];
    }

    return scored[0].agent;
  }

  /** 检查是否还有未完成工作 */
  hasMoreWork(plan: Plan): boolean {
    return plan.tasks.some(t => t.status === "pending" || t.status === "running");
  }

  /** 获取执行进度摘要 */
  getProgress(plan: Plan): { total: number; done: number; failed: number; pending: number; running: number } {
    const total = plan.tasks.length;
    const done = plan.tasks.filter(t => t.status === "done").length;
    const failed = plan.tasks.filter(t => t.status === "failed").length;
    const pending = plan.tasks.filter(t => t.status === "pending").length;
    const running = plan.tasks.filter(t => t.status === "running").length;
    return { total, done, failed, pending, running };
  }
}
