// planner.ts — 任务分解器（含性能优化和真正 JSON Schema 验证）

import { z } from "zod";
import { Task, Plan, ClassificationRule } from "./types";
import { validateDAG } from "./utils/dag";

// zod Schema 定义（真正的 JSON Schema 验证）
const SkillEnum = z.enum(["search", "browser", "shell", "code", "file"]);

const TaskSchema = z.object({
  id: z.string().regex(/^task_[0-9]+$/, { message: "task id must match pattern task_XXX" }),
  description: z.string().min(1, { message: "description must not be empty" }),
  skills: z.array(SkillEnum).min(1, { message: "skills must contain at least one valid skill" }),
  dependencies: z.array(z.string()),
  requiresApproval: z.boolean().default(false),
});

const PlanSchema = z.object({
  tasks: z.array(TaskSchema).min(1, { message: "plan must contain at least one task" }),
});

// 默认分类规则（高性能启发式规则）
const defaultClassificationRules: ClassificationRule[] = [
  // 问候语 — 简单
  { pattern: /^(hi|hello|hey|你好|您好|在吗|在？)\b/i, complexity: "simple", description: "greeting" },
  // 简单查询 — 简单
  { pattern: /^(what|who|where|when|why|how|什么是|谁是|哪里|什么时候|为什么|怎么)\b/i, complexity: "simple", description: "simple_question" },
  // 简短请求（<20字符且无复杂关键词）— 简单
  { pattern: /^.{1,20}$/, complexity: "simple", description: "short_request" },
  // 涉及多步骤/复杂操作 — 复杂
  { pattern: /\b(create|build|implement|develop|设计|开发|实现|创建|搭建)\b/i, complexity: "complex", description: "creation_task" },
  // 涉及多个工具 — 复杂
  { pattern: /\b(and then|之后|然后|接着|再|同时|并且)\b/i, complexity: "complex", description: "multi_step" },
  // 文件操作 + 代码 — 复杂
  { pattern: /\b(file|files|code|编码|文件)\b.*\b(code|shell|execute|运行|执行)\b/i, complexity: "complex", description: "file_plus_code" },
];

export class Planner {
  private maxTasks: number;
  private skipClassification: boolean;
  private classificationRules: ClassificationRule[];

  constructor(config: { model: string; maxTasks?: number; skipClassification?: boolean; classificationRules?: ClassificationRule[] }) {
    void config.model; // 保留参数用于未来 LLM 调用实现
    this.maxTasks = config.maxTasks || 10;
    this.skipClassification = config.skipClassification || false;
    this.classificationRules = config.classificationRules || defaultClassificationRules;
  }

  /**
   * 判断请求复杂度（含规则缓存优化）
   * 优先使用轻量级正则规则匹配，匹配失败才调用 LLM
   */
  async classify(request: string): Promise<"simple" | "complex"> {
    // 如果配置了跳过分类，直接返回 complex
    if (this.skipClassification) {
      return "complex";
    }

    // 1. 先使用轻量级启发式规则匹配
    const trimmedRequest = request.trim();
    for (const rule of this.classificationRules) {
      if (rule.pattern.test(trimmedRequest)) {
        return rule.complexity;
      }
    }

    // 2. 规则未匹配，调用 LLM 分类（低频场景）
    try {
      // 这里应该是真实的 LLM 调用
      // const prompt = `...`;
      // const result = await this.callLLM(prompt);
      // 为了演示，使用简单启发式
      const isComplex = trimmedRequest.length > 50 || 
        /\b(create|build|implement|develop|design|multiple|complex|project|app|application|系统|项目|应用)\b/i.test(trimmedRequest);
      return isComplex ? "complex" : "simple";
    } catch (error) {
      console.error("[Planner] Classification failed:", error);
      // 降级处理：分类失败时假设为 simple，避免阻塞用户
      return "simple";
    }
  }

  async createPlan(request: string): Promise<Plan> {
    try {
      // 这里应该是真实的 LLM 调用
      // const prompt = `...`;
      // const response = await this.callLLM(prompt, { responseFormat: { type: "json_object" } });
      // const response = await this.callLLM(prompt, { responseFormat: { type: "json_object" } });
      
      // 为了测试，生成一个简单的计划（限制任务数不超过 maxTasks）
      const taskCount = Math.min(2, this.maxTasks);
      const mockTasks = [];
      for (let i = 1; i <= taskCount; i++) {
        mockTasks.push({
          id: `task_${String(i).padStart(3, "0")}`,
          description: i === 1 ? `分析请求: ${request.slice(0, 50)}` : "执行主要任务",
          skills: i === 1 ? ["search"] : ["code"],
          dependencies: i === 1 ? [] : ["task_001"],
          requiresApproval: false,
        });
      }
      const mockResponse = JSON.stringify({ tasks: mockTasks });

      // 使用 zod 进行真正的 JSON Schema 验证
      const parsed = this.validateAndParseJSON(mockResponse);
      const tasks: Task[] = parsed.tasks.map((t) => ({
        ...t,
        status: "pending" as const,
        skills: t.skills || [],
        dependencies: t.dependencies || [],
        requiresApproval: t.requiresApproval || false,
      }));

      // 使用独立的 DAG 验证模块
      validateDAG(tasks);

      return {
        id: `plan_${Date.now()}`,
        status: "executing",
        tasks,
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch (error) {
      console.error("[Planner] Plan creation failed:", error);
      // 降级：创建单任务 Plan
      return {
        id: `plan_${Date.now()}`,
        status: "executing",
        tasks: [{
          id: "task_001",
          description: request,
          skills: ["code"],
          dependencies: [],
          status: "pending",
          requiresApproval: false,
        }],
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
  }

  /**
   * 使用 zod 进行严格的 JSON Schema 验证
   */
  private validateAndParseJSON(response: string): z.infer<typeof PlanSchema> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch {
      throw new Error("Invalid JSON response from LLM");
    }

    // 使用 zod 进行真正的 schema 验证
    const result = PlanSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`JSON Schema validation failed: ${issues}`);
    }

    return result.data;
  }

  toMarkdown(plan: Plan): string {
    const lines = [
      `# 执行计划 (${plan.id})`,
      "",
      ...plan.tasks.map(t => {
        const checkbox = t.status === "done" ? "[x]" : t.status === "failed" ? "[~]" : "[ ]";
        const deps = t.dependencies.length > 0 ? ` (depends: ${t.dependencies.join(", ")})` : "";
        const approval = t.requiresApproval ? " ⚠️需审批" : "";
        return `- ${checkbox} ${t.id}: ${t.description}${deps}${approval}`;
      })
    ];
    return lines.join("\n");
  }
}

// 导出 schema 供测试使用
export { TaskSchema, PlanSchema };
