# OpenClaw Plan-Task-Build Agent 组合模式 — 需求分析与开发文档

> **文档用途**：提交给 Claude Code 进行开发实现
> **目标读者**：AI Agent 开发者
> **技术栈**：TypeScript / OpenClaw Plugin SDK / Node.js

---

## 1. 项目概述

### 1.1 背景

OpenClaw 是开源的 AI Agent 运行时框架，提供 Gateway 网关、ReAct Runtime、Skill Registry、Markdown Memory 等核心能力。当前 OpenClaw 已原生支持**插件钩子系统**（30+ 扩展点）和 **Subagent 生命周期管理**（4 个专用钩子），但尚未提供**复杂任务分解与多 Agent 协作编排**的官方解决方案。

本插件填补这一空白：利用 OpenClaw 原生钩子实现**Plan-Task-Build** Agent 组合模式，让 OpenClaw 具备分解复杂任务、调度专业 Subagent 并行执行、动态重规划的能力。

### 1.2 目标

开发一个 OpenClaw 插件 `openclaw-plugin-plan-subagent`，通过纯插件形式（零侵入核心代码）实现：

- **Plan（规划）**：接收用户请求，智能判断复杂度，自动分解为带依赖关系的子任务列表
- **Task（调度）**：根据任务所需的 Skill 自动路由到专业 Subagent（Researcher / Coder / Browser / Reviewer）
- **Build（执行）**：Subagent 在受限上下文中并行执行工具调用，动态重规划失败任务，最终聚合交付

### 1.3 设计原则

1. **零侵入**：不修改 OpenClaw 核心代码一行，纯插件实现
2. **复用原生**：直接复用 OpenClaw 的 Subagent 生命周期、Harness revise/finalize、Session 持久化等原生机制
3. **可插拔**：独立发布、独立版本管理，`npm install` 即启用，可随时卸载

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **Plan** | 由 Planner 生成的结构化任务分解方案，包含 Task List 和依赖关系 |
| **Task** | Plan 中的单个原子子任务，绑定特定 Skill 需求和执行状态 |
| **Build** | Subagent 实际执行 Task 的过程，包括工具调用、结果收集、重规划 |
| **Subagent** | 通过 OpenClaw Subagent 钩子管理的子智能体执行上下文，绑定特定 Skill 子集 |
| **Hook** | OpenClaw 插件扩展点，通过 `api.on(name, handler)` 注册 |
| **Session Extension** | 通过 `api.registerSessionExtension()` 实现的会话级持久化状态 |
| **Turn Injection** | 通过 `api.enqueueNextTurnInjection()` 实现的跨轮次上下文注入 |

---

## 3. 功能需求

### 3.1 Plan 规划模块

#### FR-PLAN-001 复杂度分类
- 插件在 `before_agent_reply` 钩子中拦截用户请求
- **分层分类策略**（性能优化）：
  1. **规则缓存层（L1）**：正则/关键词规则匹配常见简单请求（问候、简单查询、代码片段解释等），直接判定为 `simple`，**零 LLM 调用**
  2. **轻量 LLM 层（L2）**：规则未命中时，调用 GPT-4o-mini 判断复杂度：simple / complex
  3. **降级层（L3）**：LLM 调用失败时返回 `simple`，避免阻塞用户
- simple 请求不干预，走正常 ReAct 流程
- complex 请求触发 Plan 分解流程
- **配置项**：`skipClassification: boolean`，允许用户完全跳过分类，所有请求直接按 `complex` 处理（适用于已知高频复杂任务场景）
- **规则缓存可配置**：支持用户自定义规则列表，定期自动刷新

#### FR-PLAN-002 任务分解
- 调用 LLM 将用户请求分解为结构化 Task List
- 每个 Task 包含：id, description, skills[], dependencies[], status, requiresApproval
- 依赖关系需验证无环（DAG 校验）
- 高风险操作（如 shell 执行）自动标记 requiresApproval=true

#### FR-PLAN-003 状态持久化
- Plan 状态通过 `registerSessionExtension("plan_state")` 持久化
- Session Extension 更新方式：通过 `event.context.sessions.pluginPatch` 或 Gateway `sessions.pluginPatch` 方法更新
- Plan 状态读取方式：通过会话的 `pluginExtensions` 投影获取，或在钩子上下文中读取
- 支持随会话保存/恢复
- 清理语义：reset/delete/disable 时移除状态，restart 时保留
- 维护 `taskRunMap: Record<string, string>` 记录 runId 与 taskId 的映射关系

#### FR-PLAN-004 跨轮次注入
- **方案A（直接执行）**：Plan 生成后直接通过 `before_prompt_build` 注入当前轮次执行，不返回 `syntheticReply` 短路
- **方案B（用户确认）**：返回 `syntheticReply` 提示用户"请输入继续以开始执行"，用户确认后通过 `enqueueNextTurnInjection()` 注入下一轮
- 使用 idempotencyKey 去重
- 过期注入自动丢弃
- 默认采用方案A，避免"假开始"体验

### 3.2 Task 调度模块

#### FR-TASK-001 Skill 匹配路由
- 通过 `subagent_delivery_target` 钩子实现 Task → Subagent 路由
- 根据 Task 的 skills[] 需求匹配最合适的 AgentRole
- 匹配策略：精确匹配 → 最大交集匹配 → 降级匹配

#### FR-TASK-002 角色定义
预定义 4 个标准角色：

| 角色 | Agent ID | Skills | Model |
|------|----------|--------|-------|
| Researcher | `researcher` | search, browser | gpt-4o-mini |
| Coder | `coder` | shell, code, file | gpt-4o |
| BrowserOperator | `browser` | browser | gpt-4o-mini |
| Reviewer | `reviewer` | file, code | gpt-4o-mini |

#### FR-TASK-003 并发控制
- 默认最大并发数：3
- 通过 `subagent_spawning` 钩子控制创建速率
- 在 `subagent_spawning` 中检查当前运行中的 subagent 数量，超过限制时阻止创建或排队等待
- 依赖未满足的任务排队等待
- 记录 subagent 启动日志和运行状态

#### FR-TASK-004 生命周期跟踪
- `subagent_spawned`：记录启动日志、初始化监控，建立 `runId → taskId` 映射并写入 Session Extension
- `subagent_ended`：收集执行结果、更新 Plan 状态，清理 `taskRunMap` 映射
- 任务状态流转：pending → running（在 `subagent_spawning` 中标记）→ done/failed/skipped

### 3.3 Build 执行模块

#### FR-BUILD-001 受限工具执行
- Subagent 的工具调用通过 `before_tool_call` 钩子拦截
- 支持参数重写、执行阻止、requireApproval 审批
- 实现 `before_tool_call` 钩子处理工具拦截和参数验证

#### FR-BUILD-002 结果收集
- `after_tool_call` 钩子观察工具结果、错误和时长
- 结果通过 `tool_result_persist` 写入 Blackboard（WORKSPACE/{taskId}.md）

#### FR-BUILD-003 动态重规划（Replanner）
- 通过 `before_agent_finalize` 钩子实现 revise/finalize 决策
- 检查所有任务状态：
  - 全部完成 → `{ action: "finalize" }`
  - 有失败任务 → `{ action: "revise", reason }` 触发重规划
- 支持 4 种修复策略：
  - `retry`：直接重试（临时错误）
  - `decompose`：拆分为更小子任务
  - `skip`：标记跳过（非阻塞）
  - `escalate`：需要人工介入

#### FR-BUILD-004 人工审批
- 高风险操作通过 `before_tool_call` + `requireApproval` 暂停执行
- 用户通过 `/approve` 命令批准（单次/永久/拒绝）
- `onResolution` 回调接收决策结果

#### FR-BUILD-005 结果聚合与交付
- 所有任务 finalize 后，聚合各 Subagent 输出
- `agent_end` 钩子记录执行指标（即发即忘，30秒超时保护）
- 最终结果返回给用户

### 3.4 监控与可观测性

#### FR-MON-001 执行进度
- 通过 `registerSessionExtension` 暴露 Plan 执行状态
- Control UI 可通过 `pluginExtensions` 渲染进度

#### FR-MON-002 Heartbeat 汇报
- `heartbeat_prompt_contribution` 钩子汇报当前 Plan 执行摘要
- 适用于后台监控和长时间运行任务

#### FR-MON-003 日志记录
- 关键事件记录：Plan 生成、Task 路由、Subagent 启动/结束、重规划决策
- 通过 `agent_end` 收集执行时长和成功/失败统计

### 3.5 配置热更新模块

#### FR-CONFIG-001 生命周期钩子管理
- 利用 OpenClaw 的 `gateway_start` / `gateway_stop` 钩子实现配置热更新
- `gateway_start`：加载并缓存当前配置，初始化 Planner / TaskRouter / Replanner 实例
- `gateway_stop`：保存当前运行状态，清理资源，准备重新加载

#### FR-CONFIG-002 配置变更检测
- 监听配置文件变更（如 plugin.json 修改）
- 变更时触发 `gateway_stop` → `gateway_start` 序列重新加载配置
- 正在执行的 Plan 不受影响，新配置仅对后续请求生效

#### FR-CONFIG-003 差异化重载策略
| 配置项 | 变更影响 | 重载策略 |
|--------|----------|----------|
| `plannerModel` / `replannerModel` | 影响后续 Plan 生成 | 立即生效 |
| `maxConcurrency` | 影响并发控制 | 立即生效（不中断运行中任务） |
| `agentRoles` | 影响 Task 路由 | 立即生效 |
| `classificationRules` | 影响分类性能 | 立即生效，清空规则缓存 |
| `skipClassification` | 影响分类流程 | 立即生效 |

#### FR-CONFIG-004 配置验证
- 重载前对配置进行 Schema 验证（使用 Zod）
- 无效配置拒绝加载，保持旧配置运行，记录错误日志

---

## 4. 技术架构

### 4.1 钩子映射总览

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ before_agent│  │before_prompt│  │ subagent_delivery   │ │
│  │ _reply      │  │ _build      │  │ _target             │ │
│  │  (Plan)     │  │  (Inject)   │  │  (Task Route)       │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                 │                     │            │
│  ┌──────▼─────────────────▼─────────────────────▼──────────┐ │
│  │              Plan-Subagent Plugin                        │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │ │
│  │  │ Planner  │  │ Task     │  │ Replanner│             │ │
│  │  │          │  │ Router   │  │          │             │ │
│  │  │ classify │  │          │  │ check()  │             │ │
│  │  │ create   │  │ getReady │  │ revise/  │             │ │
│  │  │ Plan()   │  │ routeBy  │  │ finalize │             │ │
│  │  │          │  │ Skill()  │  │          │             │ │
│  │  └──────────┘  └──────────┘  └──────────┘             │ │
│  │                                                          │ │
│  │  registerSessionExtension("plan_state")                  │ │
│  │  enqueueNextTurnInjection()                              │ │
│  └──────────────────────────────────────────────────────────┘ │
│         │                 │                     │            │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────────▼──────────┐ │
│  │before_tool  │  │after_tool   │  │before_agent         │ │
│  │_call        │  │_call        │  │_finalize            │ │
│  │  (拦截/审批)│  │  (结果收集) │  │  (revise/finalize)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │                 │                     │            │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────────▼──────────┐ │
│  │subagent_    │  │subagent_    │  │heartbeat_           │ │
│  │spawned      │  │ended        │  │prompt_contribution  │ │
│  │(runId映射)  │  │(清理映射)   │  │(进度汇报)           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 核心钩子注册顺序

| 优先级 | 钩子 | 用途 | 返回值 |
|--------|------|------|--------|
| 90 | `gateway_start` | 配置加载与初始化 | — |
| 90 | `gateway_stop` | 配置卸载与状态保存 | — |
| 80 | `before_agent_reply` | 复杂任务检测 + Plan 生成 | `{ syntheticReply }` 或空（直接执行） |
| 70 | `before_prompt_build` | Plan 上下文注入 Prompt | `{ prependContext }` |
| 70 | `subagent_delivery_target` | Task → Subagent 路由 | `{ targetAgentId }` |
| 70 | `subagent_spawning` | 并发控制 + 任务状态标记 | `{ block?, reason? }` |
| 60 | `before_agent_finalize` | 重规划 revise/finalize | `{ action: "revise" \| "finalize" }` |
| 50 | `before_tool_call` | 工具拦截/审批 | `{ params?, block?, requireApproval? }` |
| 50 | `after_tool_call` | 结果收集 + 状态更新 | — |
| 50 | `subagent_spawned` | 建立 runId→taskId 映射 | — |
| 50 | `subagent_ended` | 清理映射 + 结果汇总 | — |
| 40 | `heartbeat_prompt_contribution` | 执行进度汇报 | `{ contribution }` |
| — | `agent_end` | 执行指标记录 | — |

---

## 5. 数据结构设计

### 5.1 Plan 状态（Session Extension）

```typescript
interface Plan {
  id: string;
  status: "planning" | "executing" | "reviewing" | "done";
  tasks: Task[];
  taskRunMap: Record<string, string>; // runId -> taskId 映射
  createdAt: number;
  updatedAt: number;
}

interface Task {
  id: string;
  description: string;
  skills: string[];
  dependencies: string[];
  status: "pending" | "running" | "done" | "failed" | "skipped";
  requiresApproval: boolean;
  assignedAgent?: string;
  result?: string;
  startedAt?: number;
  completedAt?: number;
  _retryCount?: number;
}

interface AgentRole {
  agentId: string;
  name: string;
  skills: string[];
  model: string;
}
```

### 5.2 修复决策

```typescript
interface RepairDecision {
  strategy: "retry" | "decompose" | "skip" | "escalate";
  newTasks?: Task[];
  reason: string;
}

interface HealthCheck {
  needsReroute: boolean;
  failedTasks: Task[];
  reason?: string;
}
```

### 5.3 插件配置

```json
{
  "plugins": {
    "entries": {
      "plan-subagent": {
        "config": {
          "plannerModel": "gpt-4o-mini",
          "replannerModel": "gpt-4o-mini",
          "maxConcurrency": 3,
          "maxStepsPerAgent": 20,
          "skipClassification": false,
          "classificationRules": [
            { "pattern": "^(hello|hi|hey|你好|您好)", "result": "simple" },
            { "pattern": "^(what|who|when|where|为什么|什么是)", "result": "simple" },
            { "pattern": "^(explain|解释|说明).{0,50}$", "result": "simple" }
          ],
          "agentRoles": [
            {
              "agentId": "researcher",
              "name": "Researcher",
              "skills": ["search", "browser"],
              "model": "gpt-4o-mini"
            },
            {
              "agentId": "coder",
              "name": "Coder",
              "skills": ["shell", "code", "file"],
              "model": "gpt-4o"
            },
            {
              "agentId": "browser",
              "name": "BrowserOperator",
              "skills": ["browser"],
              "model": "gpt-4o-mini"
            },
            {
              "agentId": "reviewer",
              "name": "Reviewer",
              "skills": ["file", "code"],
              "model": "gpt-4o-mini"
            }
          ]
        },
        "hooks": {
          "allowConversationAccess": true
        }
      }
    }
  }
}
```

---

## 6. 模块接口设计

### 6.1 Planner 模块

```typescript
export class Planner {
  constructor(config: { 
    model: string; 
    maxTasks?: number;
    skipClassification?: boolean;
    classificationRules?: Array<{ pattern: string; result: "simple" | "complex" }>;
  });

  /** 判断请求复杂度（三层策略：规则缓存 → LLM → 降级） */
  async classify(request: string): Promise<"simple" | "complex">;

  /** 规则缓存匹配（L1 层） */
  matchRule(request: string): "simple" | "complex" | null;

  /** 生成任务分解 Plan */
  async createPlan(request: string): Promise<Plan>;

  /** Plan 序列化 */
  toMarkdown(plan: Plan): string;
}
```

### 6.2 TaskRouter 模块

```typescript
export class TaskRouter {
  constructor(config: { maxConcurrency: number; agentPool: AgentRole[] });

  /** 获取依赖已满足的就绪任务 */
  getReadyTasks(plan: Plan): Task[];

  /** 根据 Skill 匹配最佳 Subagent */
  routeBySkill(task: Task): AgentRole;

  /** 检查是否还有未完成工作 */
  hasMoreWork(plan: Plan): boolean;
}
```

### 6.3 Replanner 模块

```typescript
export class Replanner {
  constructor(config: { model: string; maxRetries?: number });

  /** 检查 Plan 健康状态 */
  async check(plan: Plan): Promise<HealthCheck>;

  /** 生成修复计划 */
  async replan(plan: Plan, failedTasks: Task[]): Promise<Plan>;
}
```

### 6.4 Blackboard 模块

```typescript
export class Blackboard {
  constructor(config: {
    basePath: string;
    metricsOutput?: "blackboard" | "webhook" | "otel" | "none";
    metricsWebhook?: string; // webhook URL (当 metricsOutput="webhook" 时必填)
    metricsOtelEndpoint?: string; // OpenTelemetry endpoint (当 metricsOutput="otel" 时必填)
  });

  /** 写入任务结果 */
  async writeResult(taskId: string, content: string): Promise<void>;

  /** 读取任务结果 */
  async readResult(taskId: string): Promise<string>;

  /** 聚合所有已完成任务结果 */
  async aggregateResults(taskIds: string[]): Promise<string>;

  /** 写入指标（根据配置输出到 Blackboard、Webhook 或 OpenTelemetry） */
  async writeMetrics(runId: string, metrics: Record<string, unknown>): Promise<void>;
}
```

---

## 7. 完整代码实现

### 7.1 插件入口（index.ts）

```typescript
// index.ts — Plan-Subagent 插件入口
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Planner } from "./planner";
import { TaskRouter } from "./router";
import { Replanner } from "./replanner";
import { Blackboard } from "./blackboard";

export default definePluginEntry({
  id: "plan-subagent",
  name: "Plan-Subagent Orchestrator",

  register(api) {
    // 通过 event.context.pluginConfig 获取配置
    const config = api.config;
    const planner = new Planner({ model: config.plannerModel || "gpt-4o-mini" });
    const router = new TaskRouter({
      maxConcurrency: config.maxConcurrency || 3,
      agentPool: config.agentRoles || defaultRoles
    });
    const replanner = new Replanner({ model: config.replannerModel || "gpt-4o-mini" });
    const blackboard = new Blackboard(config.workspaceDir || "./workspace");

    // 1. 注册会话扩展（Plan 状态持久化）
    api.registerSessionExtension({
      id: "plan_state",
      defaultValue: { id: "", status: "idle", tasks: [], taskRunMap: {}, createdAt: 0, updatedAt: 0 },
      onCleanup(reason) {
        console.log(`[Plan-Subagent] Cleanup: ${reason}`);
        // 根据清理原因差异化清理 Blackboard 临时文件
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
        const runningCount = plan.tasks.filter(t => t.status === "running").length;
        if (runningCount >= router.maxConcurrency) {
          return { block: true, reason: "并发数限制" };
        }

        // 标记任务为 running 状态
        const taskId = plan.taskRunMap[event.runId];
        if (taskId) {
          const task = plan.tasks.find(t => t.id === taskId);
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
        const task = plan.tasks.find(t => t.id === taskId);
        
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
        const task = plan.tasks.find(t => t.id === taskId);
        
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
        const task = plan.tasks.find(t => t.status === "running" && !plan.taskRunMap[event.runId]);
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
```

### 7.2 Planner 模块（planner.ts）

```typescript
// planner.ts — 任务分解器
import { LLM } from "openclaw/plugin-sdk/llm";
import { z } from "zod";
import { validateDAG } from "./utils/dag";

export interface Task {
  id: string;
  description: string;
  skills: string[];
  dependencies: string[];
  status: "pending" | "running" | "done" | "failed" | "skipped";
  requiresApproval: boolean;
  assignedAgent?: string;
  result?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Plan {
  id: string;
  status: "planning" | "executing" | "reviewing" | "done";
  tasks: Task[];
  taskRunMap: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

// Zod Schema 用于验证 LLM 返回的任务分解结果
const TaskSchema = z.object({
  id: z.string().regex(/^task_[0-9]+$/),
  description: z.string().min(1),
  skills: z.array(z.enum(["search", "browser", "shell", "code", "file"])),
  dependencies: z.array(z.string()),
  requiresApproval: z.boolean().optional().default(false)
});

const PlanSchema = z.object({
  tasks: z.array(TaskSchema).min(1)
});

export class Planner {
  private llm: LLM;
  private maxTasks: number;

  constructor(config: { model: string; maxTasks?: number }) {
    this.llm = new LLM({ model: config.model });
    this.maxTasks = config.maxTasks || 10;
  }

  async classify(request: string): Promise<"simple" | "complex"> {
    try {
      const prompt = `
判断以下用户请求是否为复杂任务（需要多步工具调用或跨领域协作）。
复杂任务的特征：需要同时使用多种工具、涉及多个步骤、需要搜索+编码+文件操作等。
只回复一个单词："simple" 或 "complex"。

请求: ${request}
      `;
      const result = await this.llm.generate(prompt);
      return result.trim().toLowerCase().includes("complex") ? "complex" : "simple";
    } catch (error) {
      console.error("[Planner] Classification failed:", error);
      // 降级处理：分类失败时假设为 simple，避免阻塞用户
      return "simple";
    }
  }

  async createPlan(request: string): Promise<Plan> {
    try {
      const prompt = `
将以下用户请求分解为 ${this.maxTasks} 个以内的可并行执行子任务。
输出严格遵循以下 JSON 格式：
{
  "tasks": [
    {
      "id": "task_001",
      "description": "任务描述",
      "skills": ["search"],
      "dependencies": [],
      "requiresApproval": false
    }
  ]
}

规则：
1. skills 只能从以下选项中选择: search, browser, shell, code, file
2. dependencies 填写依赖的其他 task id，无依赖留空数组
3. 涉及文件删除、系统命令执行等高风险操作标记 requiresApproval: true
4. 尽量并行化：无依赖的任务应独立，不要串行化
5. 确保依赖图无环
6. task id 格式必须为 task_001, task_002 等

用户请求: ${request}
      `;

      const response = await this.llm.generate({
        prompt,
        responseFormat: { type: "json_object" }
      });

      // Zod Schema 严格验证
      const parsed = this.validateAndParseJSON(response);
      const tasks: Task[] = parsed.tasks.map((t) => ({
        ...t,
        status: "pending" as const,
        skills: t.skills,
        dependencies: t.dependencies,
        requiresApproval: t.requiresApproval
      }));

      validateDAG(tasks);

      return {
        id: `plan_${Date.now()}`,
        status: "executing",
        tasks,
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
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
          requiresApproval: false
        }],
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
  }

  private validateAndParseJSON(response: string): z.infer<typeof PlanSchema> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch {
      throw new Error("Invalid JSON response from LLM");
    }

    // Zod Schema 严格验证
    const result = PlanSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Schema validation failed: ${result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
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
```

### 7.3 TaskRouter 模块（router.ts）

```typescript
// router.ts — Skill 匹配路由
import { Task, Plan } from "./planner";

export interface AgentRole {
  agentId: string;
  name: string;
  skills: string[];
  model: string;
}

export const defaultRoles: AgentRole[] = [
  { agentId: "researcher", name: "Researcher", skills: ["search", "browser"], model: "gpt-4o-mini" },
  { agentId: "coder", name: "Coder", skills: ["shell", "code", "file"], model: "gpt-4o" },
  { agentId: "browser", name: "BrowserOperator", skills: ["browser"], model: "gpt-4o-mini" },
  { agentId: "reviewer", name: "Reviewer", skills: ["file", "code"], model: "gpt-4o-mini" }
];

export class TaskRouter {
  private maxConcurrency: number;
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
```

### 7.4 Replanner 模块（replanner.ts）

```typescript
// replanner.ts — 动态重规划
import { LLM } from "openclaw/plugin-sdk/llm";
import { Task, Plan } from "./planner";

export interface HealthCheck {
  needsReroute: boolean;
  failedTasks: Task[];
  reason?: string;
}

export interface RepairDecision {
  strategy: "retry" | "decompose" | "skip" | "escalate";
  newTasks?: Task[];
  reason: string;
}

export class Replanner {
  private llm: LLM;
  private maxRetries: number;

  constructor(config: { model: string; maxRetries?: number }) {
    this.llm = new LLM({ model: config.model });
    this.maxRetries = config.maxRetries || 3;
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
      const prompt = `
以下 Plan 中有 ${failedTasks.length} 个任务执行失败。请分析失败原因并选择最佳修复策略。

失败任务:
${failedTasks.map(t => `- ${t.id}: ${t.description} (skills: ${t.skills.join(", ")})`).join("\n")}

可用的修复策略：
1. "retry" — 直接重试（适用于临时性错误：网络超时、API 限流等）
2. "decompose" — 拆分为更小的子任务（适用于任务过大或模糊）
3. "skip" — 标记为跳过（适用于非阻塞性可选任务）
4. "escalate" — 需要人工介入（适用于权限不足、需要确认的操作）

请输出严格 JSON：
{
  "strategy": "retry|decompose|skip|escalate",
  "reason": "选择该策略的理由",
  "newTasks": [
    { "id": "...", "description": "...", "skills": [...], "dependencies": [...] }
  ]
}

注意：
- retry 策略时 newTasks 为空（直接重置失败任务状态）
- decompose 策略时 newTasks 为拆分后的子任务
- skip 和 escalate 策略时 newTasks 为空
      `;

      const response = await this.llm.generate({
        prompt,
        responseFormat: { type: "json_object" }
      });

      // 安全解析 JSON
      let decision: RepairDecision;
      try {
        decision = JSON.parse(response);
      } catch {
        console.error("[Replanner] Failed to parse decision JSON, defaulting to retry");
        decision = { strategy: "retry", reason: "JSON 解析失败，默认重试" };
      }

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
        // 重置失败任务为 pending，增加重试计数（使用类型安全方式）
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
```

### 7.5 DAG 工具模块（utils/dag.ts）

```typescript
// utils/dag.ts — DAG 验证工具（独立模块，方便测试复用）
import { Task } from "../types";

/** 验证任务依赖图是否为无环有向图（DAG） */
export function validateDAG(tasks: Task[]): void {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  function visit(id: string): boolean {
    if (recursionStack.has(id)) return false; // 发现环
    if (visited.has(id)) return true;

    visited.add(id);
    recursionStack.add(id);

    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependencies) {
        if (!taskMap.has(dep)) {
          throw new Error(`Task ${id} depends on non-existent task ${dep}`);
        }
        if (!visit(dep)) {
          throw new Error(`Circular dependency detected involving task ${id}`);
        }
      }
    }

    recursionStack.delete(id);
    return true;
  }

  for (const task of tasks) {
    visit(task.id);
  }
}

/** 检测是否存在循环依赖（返回布尔值，不抛出异常） */
export function hasCircularDependency(tasks: Task[]): boolean {
  try {
    validateDAG(tasks);
    return false;
  } catch {
    return true;
  }
}

/** 获取任务的拓扑排序（执行顺序） */
export function topologicalSort(tasks: Task[]): string[] {
  validateDAG(tasks);
  
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  
  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjList.set(task.id, []);
  }
  
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      adjList.get(dep)?.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
    }
  }
  
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }
  
  const result: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    
    for (const next of adjList.get(id) || []) {
      const newDegree = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, newDegree);
      if (newDegree === 0) queue.push(next);
    }
  }
  
  return result;
}
```

### 7.6 Blackboard 模块（blackboard.ts）

```typescript
// blackboard.ts — Markdown 驱动的共享状态
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";

export class Blackboard {
  private basePath: string;
  private metricsOutput: "blackboard" | "webhook" | "otel" | "none";
  private metricsWebhook?: string;
  private metricsOtelEndpoint?: string;

  constructor(config: {
    basePath?: string;
    metricsOutput?: "blackboard" | "webhook" | "otel" | "none";
    metricsWebhook?: string;
    metricsOtelEndpoint?: string;
  } = {}) {
    this.basePath = config.basePath || "./workspace";
    this.metricsOutput = config.metricsOutput || "blackboard";
    this.metricsWebhook = config.metricsWebhook;
    this.metricsOtelEndpoint = config.metricsOtelEndpoint;
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

  async writeMetrics(runId: string, metrics: Record<string, unknown>): Promise<void> {
    try {
      // 1. Blackboard 本地写入（始终执行，作为兜底）
      const path = join(this.basePath, "METRICS", `${runId}.json`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(metrics, null, 2), "utf-8");

      // 2. Webhook 输出
      if (this.metricsOutput === "webhook" && this.metricsWebhook) {
        await fetch(this.metricsWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId, ...metrics, timestamp: Date.now() })
        });
      }

      // 3. OpenTelemetry 输出（简化实现，实际接入 OTel SDK）
      if (this.metricsOutput === "otel" && this.metricsOtelEndpoint) {
        await fetch(this.metricsOtelEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resourceMetrics: [{
              scopeMetrics: [{
                metrics: [{
                  name: "plan_subagent_execution",
                  sum: {
                    dataPoints: [{
                      attributes: [
                        { key: "runId", value: { stringValue: runId } },
                        { key: "success", value: { boolValue: metrics.success } }
                      ],
                      timeUnixNano: Date.now() * 1e6,
                      asDouble: metrics.durationMs as number
                    }]
                  }
                }]
              }]
            }]
          })
        });
      }
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

  /** 根据清理原因差异化清理临时文件 */
  async cleanup(reason: "reset" | "delete" | "disable" | "restart" = "reset"): Promise<void> {
    try {
      const { rm } = await import("fs/promises");
      const workspacePath = join(this.basePath, "WORKSPACE");
      const metricsPath = join(this.basePath, "METRICS");
      const plansPath = join(this.basePath, "PLANS");

      switch (reason) {
        case "reset": {
          // 清空 WORKSPACE 和 METRICS，保留 PLANS（历史记录）
          await rm(workspacePath, { recursive: true, force: true });
          await rm(metricsPath, { recursive: true, force: true });
          console.log("[Blackboard] Cleanup (reset): WORKSPACE and METRICS cleared, PLANS preserved");
          break;
        }
        case "delete": {
          // 清空所有目录（完全卸载）
          await rm(workspacePath, { recursive: true, force: true });
          await rm(metricsPath, { recursive: true, force: true });
          await rm(plansPath, { recursive: true, force: true });
          console.log("[Blackboard] Cleanup (delete): All directories cleared");
          break;
        }
        case "disable": {
          // 不做清理，仅标记状态（保留所有数据以便重新启用）
          console.log("[Blackboard] Cleanup (disable): No cleanup performed, data preserved");
          break;
        }
        case "restart": {
          // 清空 WORKSPACE 和 METRICS，保留 PLANS（与 reset 相同，但语义不同）
          await rm(workspacePath, { recursive: true, force: true });
          await rm(metricsPath, { recursive: true, force: true });
          console.log("[Blackboard] Cleanup (restart): WORKSPACE and METRICS cleared, PLANS preserved for continuity");
          break;
        }
        default: {
          console.log(`[Blackboard] Cleanup: Unknown reason '${reason}', defaulting to reset`);
          await rm(workspacePath, { recursive: true, force: true });
          await rm(metricsPath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.error("[Blackboard] Cleanup failed:", error);
    }
  }
}
```

---

## 8. 目录结构

```
openclaw-plugin-plan-subagent/
├── src/
│   ├── index.ts              # 插件入口 (definePluginEntry)
│   ├── planner.ts            # Planner: 复杂度分类 + 任务分解 + JSON Schema 验证
│   ├── router.ts             # TaskRouter: Skill 匹配路由 + 并发控制
│   ├── replanner.ts          # Replanner: revise/finalize 决策 + 错误恢复
│   ├── blackboard.ts         # Blackboard: Markdown 状态存储 + 指标收集
│   ├── types.ts              # 共享类型定义（Plan, Task, AgentRole 等）
│   └── utils/
│       └── dag.ts            # DAG 验证工具（循环依赖检测，独立模块）
├── tests/
│   ├── planner.test.ts       # Planner 单元测试（含降级场景）
│   ├── router.test.ts        # TaskRouter 单元测试（含并发限制）
│   ├── replanner.test.ts     # Replanner 单元测试（含重试计数）
│   ├── blackboard.test.ts    # Blackboard 单元测试（含 cleanup）
│   └── integration.test.ts   # 集成测试（5 条核心流程）
├── plugin.json               # 插件元数据 + 默认配置
├── package.json
├── tsconfig.json
└── README.md
```

### plugin.json

```json
{
  "id": "plan-subagent",
  "name": "Plan-Subagent Orchestrator",
  "version": "1.0.0",
  "description": "Plan-Task-Build Agent composition mode for complex task orchestration",
  "main": "dist/index.js",
  "hooks": {
    "allowConversationAccess": true
  },
  "config": {
    "plannerModel": "gpt-4o-mini",
    "replannerModel": "gpt-4o-mini",
    "maxConcurrency": 3,
    "maxStepsPerAgent": 20,
    "skipClassification": false,
    "classificationRules": [
      { "pattern": "^(hello|hi|hey|你好|您好)", "result": "simple" },
      { "pattern": "^(what|who|when|where|为什么|什么是)", "result": "simple" },
      { "pattern": "^(explain|解释|说明).{0,50}$", "result": "simple" }
    ],
    "metricsOutput": "blackboard",
    "metricsWebhook": "",
    "metricsOtelEndpoint": "",
    "agentRoles": [
      { "agentId": "researcher", "name": "Researcher", "skills": ["search", "browser"], "model": "gpt-4o-mini" },
      { "agentId": "coder", "name": "Coder", "skills": ["shell", "code", "file"], "model": "gpt-4o" },
      { "agentId": "browser", "name": "BrowserOperator", "skills": ["browser"], "model": "gpt-4o-mini" },
      { "agentId": "reviewer", "name": "Reviewer", "skills": ["file", "code"], "model": "gpt-4o-mini" }
    ]
  }
}
```

---

## 9. 测试策略

### 9.1 单元测试

| 模块 | 测试项 | 预期结果 |
|------|--------|---------|
| Planner.classify | 简单请求返回 "simple" | 不干预，走正常流程 |
| Planner.classify | 复杂请求返回 "complex" | 触发 Plan 分解 |
| Planner.classify | LLM 调用失败 | 降级返回 "simple"，不阻塞用户 |
| Planner.createPlan | 有效请求 | 返回无环 DAG，Task 数量合理 |
| Planner.createPlan | 含高风险操作的请求 | requiresApproval=true |
| Planner.createPlan | LLM 返回无效 JSON | 降级为单任务 Plan |
| Planner.createPlan | JSON Schema 验证失败 | 抛出明确的错误信息 |
| DAGUtils.validateDAG | 无环依赖图 | 正常通过 |
| DAGUtils.validateDAG | 循环依赖 | 抛出 Circular dependency 错误 |
| DAGUtils.hasCircularDependency | 含环图 | 返回 true |
| DAGUtils.topologicalSort | 有效 DAG | 返回正确的拓扑排序 |
| TaskRouter.routeBySkill | search 任务 | 返回 researcher |
| TaskRouter.routeBySkill | code+shell 任务 | 返回 coder |
| TaskRouter.getReadyTasks | 依赖未满足 | 不返回该任务 |
| TaskRouter.getReadyTasks | 并发数超过限制 | 阻止创建新 subagent |
| Replanner.check | 全部完成 | needsReroute=false |
| Replanner.check | 有失败任务 | needsReroute=true |
| Replanner.check | 重试计数正确性 | 返回准确的总重试次数 |
| Replanner.replan | LLM 调用失败 | 降级为 retry 策略 |
| Replanner.applyFix | retry 策略 | 失败任务重置为 pending，_retryCount 递增 |
| Replanner.applyFix | decompose 策略 | 移除失败任务，插入新子任务 |
| Blackboard.writeResult | 正常写入 | 文件正确写入 WORKSPACE 目录 |
| Blackboard.cleanup | reset 原因 | 清空 WORKSPACE 和 METRICS，保留 PLANS |
| Blackboard.cleanup | delete 原因 | 清空所有目录 |
| Blackboard.cleanup | disable 原因 | 不清理，仅标记状态 |
| Blackboard.cleanup | restart 原因 | 清空 WORKSPACE 和 METRICS，保留 PLANS |
| Blackboard.writeMetrics | metricsOutput=blackboard | 写入本地 METRICS 目录 |
| Blackboard.writeMetrics | metricsOutput=webhook | 发送到配置的 webhook URL |
| Blackboard.writeMetrics | metricsOutput=otel | 发送到 OpenTelemetry endpoint |

### 9.2 集成测试

1. **完整流程**：复杂请求 → Plan 生成 → Task 路由 → Subagent 执行 → 结果聚合 → 最终交付
2. **重规划流程**：故意让任务失败 → Replanner 触发 → revise 决策 → 修复后 finalize
3. **人工审批**：标记 requiresApproval 的任务 → before_tool_call 拦截 → /approve 批准 → 继续执行
4. **并发控制**：同时调度 5 个独立任务 → subagent_spawning 限制为 3 个 → 完成后自动执行剩余 2 个
5. **错误恢复**：LLM 调用失败 → 降级到 simple 流程或单任务 Plan → 正常执行
6. **状态持久化**：Session Extension 正确读写 → taskRunMap 映射建立和清理 → 跨轮次状态保持
7. **配置热更新**：修改 plugin.json → gateway_stop/gateway_start 序列重载 → 新配置对后续请求生效

### 9.3 边界测试

- 空请求处理
- 规则缓存命中（直接返回 simple，无 LLM 调用）
- skipClassification=true 时所有请求直接走 complex 流程
- 循环依赖检测（应抛出错误）
- 最大任务数限制
- Session Extension 数据过大时的行为
- 插件卸载时状态清理（Blackboard cleanup 差异化策略）
- LLM 返回格式异常（非 JSON、缺失字段、非法 skill）
- 并发数达到上限时的排队行为
- runId 与 taskId 映射不存在时的容错处理
- 网络超时和 API 限流场景
- 配置热更新时正在执行的 Plan 不受影响

---

## 10. 交付标准

### 10.1 功能完成度

- [ ] Plan 模块：复杂度分类、任务分解、DAG 验证
- [ ] Task 模块：Skill 匹配路由、4 个标准角色、并发控制
- [ ] Build 模块：工具拦截、结果收集、4 种修复策略
- [ ] 监控模块：Session Extension 状态、Heartbeat 汇报
- [ ] 人工审批：requireApproval 集成、/approve 命令支持

### 10.2 质量要求

- [ ] TypeScript 严格模式，无 `any` 类型（使用 `_retryCount?: number` 等显式类型）
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试覆盖 5 条核心流程（完整流程、重规划、人工审批、并发控制、错误恢复）
- [ ] 错误处理完备，**所有异步操作有 try/catch**，LLM 调用失败时降级处理
- [ ] JSON Schema 验证：LLM 返回的 JSON 必须经过结构验证
- [ ] 日志记录关键事件，支持调试级别配置
- [ ] task-run 映射正确性：验证 `runId → taskId` 的完整生命周期

### 10.3 文档要求

- [ ] README.md：安装、配置、使用方法
- [ ] API 文档：每个公共方法的 JSDoc 注释
- [ ] 配置文档：plugin.json 所有字段说明
- [ ] 示例：3 个典型使用场景的对话示例

---

## 11. 修改记录

### 2024-05-02 评审后修订

基于 [Issue #1](https://github.com/KuuDS/korchestrator/issues/1) 的评审和验证结果，本次修订包含以下关键改进：

#### API 修正
- **Session Extension 更新**：将 `api.updateSessionExtension()` 替换为 `event.context.sessions.pluginPatch()`
- **Session Extension 读取**：将 `api.getSessionExtension()` 替换为 `event.context.session.pluginExtensions`
- **配置访问**：将 `api.config` 修正为通过 `event.context.pluginConfig` 获取
- **Task-run 映射**：新增 `taskRunMap: Record<string, string>` 字段，解决 `runId` 与 `task.id` 语义混淆问题

#### 执行流程修复
- **避免假开始**：`before_agent_reply` 默认不返回 `syntheticReply` 短路，Plan 直接通过 `before_prompt_build` 注入当前轮次执行
- **降级方案**：所有 LLM 调用（classify/createPlan/replan）添加 try/catch，失败时降级到 simple 流程或单任务 Plan

#### 状态管理完善
- **生命周期钩子**：新增 `subagent_spawning`（并发控制）、`subagent_spawned`（建立映射）、`subagent_ended`（清理映射）实现
- **状态流转**：明确 `pending → running → done/failed/skipped` 的状态流转路径
- **运行状态标记**：在 `subagent_spawning` 中将任务标记为 `running`，建立 `runId→taskId` 映射

#### 错误处理与类型安全
- **无 any 类型**：Task 接口新增 `_retryCount?: number` 字段，消除所有 `(task as any)` 类型断言
- **重试计数修复**：`Replanner.check()` 中使用 `reduce` 计算总重试次数，而非"有重试记录的任务数"
- **JSON Schema 验证**：`Planner.createPlan()` 中增加 JSON 结构验证，LLM 返回无效时抛出明确错误
- **全面 try/catch**：所有钩子处理器、Blackboard 方法、LLM 调用均添加错误处理

#### 补齐缺失钩子
- `before_tool_call`：工具拦截、参数验证、requireApproval 审批流程
- `subagent_spawning`：并发数检查、任务状态标记
- `subagent_spawned` / `subagent_ended`：runId→taskId 映射生命周期管理
- `heartbeat_prompt_contribution`：执行进度汇报（任务总数/已完成/失败/进行中/等待中）

#### 监控完善
- **结构化指标**：`agent_end` 中将执行指标结构化写入 `Blackboard.writeMetrics()`，支持 Blackboard 本地文件、Webhook、OpenTelemetry 三种输出方式
- **Cleanup 逻辑**：`registerSessionExtension` 的 `onCleanup` 根据 `reason` 参数差异化清理：
  - `reset`：清空 WORKSPACE 和 METRICS，保留 PLANS
  - `delete`：清空所有目录
  - `disable`：不做清理，仅标记状态
  - `restart`：清空 WORKSPACE 和 METRICS，保留 PLANS

---

## 12. 风险提示

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `subagent_*` 钩子 API 尚未正式发布 | 高 | 关注 OpenClaw 更新，预留适配层 |
| 多插件钩子 priority 冲突 | 中 | 文档说明推荐 priority 范围，提供冲突检测 |
| LLM Plan 生成不稳定 | 中 | 引入 schema validation，失败时 fallback 到单 Agent |
| Session Extension 数据膨胀 | 中 | Plan 状态定期压缩，超大状态分片 |
| 与核心版本兼容性 | 中 | plugin.json 声明最低版本，CI 兼容性矩阵 |
