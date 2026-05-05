## Context

korchestrator 是一个基于 OpenClaw Plugin SDK 实现的 Plan-Task-Build 多 Agent 编排插件。当前系统已具备基础的 Plan 生成、Task 路由和 Replanner 重规划能力，但在 Plan 质量和 Task 分配合理性方面缺乏自动化验证机制。

本项目采用 Hook 零侵入架构，核心模块通过 OpenClaw 提供的 Hook 机制进行扩展。现有 Hook 包括：
- `before_agent_reply` (priority 80): 复杂度检测与 Plan 生成
- `before_prompt_build` (priority 70): Plan 上下文注入
- `subagent_delivery_target` (priority 70): Task → Subagent 路由
- `before_agent_finalize` (priority 60): 修订/定稿决策
- `before_tool_call` / `after_tool_call` (priority 50): 拦截与结果收集

当前 Session 状态通过 `registerSessionExtension("plan_state")` 持久化，Blackboard 用于跨 Agent 信息共享。

## Goals / Non-Goals

**Goals:**
- 建立可扩展的 Validation Rules 框架，支持规则的热插拔和自定义
- 在 Plan 生成阶段自动检测结构缺陷（循环依赖、不合理拆分）
- 在 Task 路由阶段验证 Agent-Task 能力匹配度
- 提供阻断、警告、自动修复三种验证结果处理策略
- 将验证历史持久化到 Session Extension，支持跨 Turn 的验证状态追踪
- 确保所有验证逻辑符合 TypeScript strict 模式，零 `any` 类型

**Non-Goals:**
- 不实现 LLM 输出内容的语义质量评估（如结果正确性判断）
- 不修改 OpenClaw 核心框架的 Hook 机制
- 不引入外部规则引擎（如 Drools），保持轻量级实现
- 不支持运行时动态修改规则优先级（首次版本）

## Decisions

### Decision 1: 规则引擎采用组合模式而非继承模式
- **选择**: 规则实现为纯函数 `Rule = (context) => ValidationResult`，通过 `RuleComposer` 组合执行
- **理由**: 函数式规则更易于测试和组合，避免继承层次过深。符合 TypeScript strict 模式要求
- **替代方案**: 类继承模式（Rule 基类 + 子类重写 validate 方法）—— 更传统但灵活性较低

### Decision 2: 验证结果处理策略通过 Hook 优先级控制
- **选择**: 阻断策略在 `before_agent_reply` priority 75 执行（Plan 验证），匹配验证在 `subagent_delivery_target` priority 65 执行
- **理由**: 利用现有 Hook 优先级机制，不需要新增 Hook 类型。75 高于 Plan 生成 (80) 的后续步骤，65 高于默认路由 (70) 的后续步骤
- **替代方案**: 新增专用 Hook `before_plan_validate` / `before_task_validate` —— 更清晰但需要修改 OpenClaw 核心

### Decision 3: 规则定义使用 Zod Schema 进行结构化约束
- **选择**: 使用 Zod 定义规则配置和验证结果的类型约束
- **理由**: Zod 提供运行时类型检查，与 TypeScript 完美集成，适合需要严格类型安全的场景
- **替代方案**: 纯 TypeScript 接口 —— 无运行时检查，无法满足严格验证需求

### Decision 4: 验证状态存储在独立 Session Extension 中
- **选择**: 新增 `registerSessionExtension("validation_state")` 存储验证历史和统计，与 `plan_state` 解耦
- **理由**: 分离关注点，`plan_state` 关注编排状态，`validation_state` 关注验证元数据。两者可独立清理和迁移
- **替代方案**: 合并到 `plan_state` —— 更简单但违反单一职责原则

### Decision 5: 自动修复策略采用规则链回退机制
- **选择**: 当规则触发时，先尝试修复（如拆分过大任务、重新分配 Agent），修复失败再降级为警告或阻断
- **理由**: 减少人工干预，提高自动化程度。修复逻辑内聚在规则实现中
- **替代方案**: 独立修复引擎 —— 更强大但增加系统复杂度

## Risks / Trade-offs

- **[风险] 验证增加 Plan 生成延迟** → [缓解] 规则按优先级排序，核心规则优先执行，非关键规则可配置为异步执行；支持规则缓存避免重复验证
- **[风险] 规则冲突导致系统死锁** → [缓解] 规则执行设置超时机制（默认 5s），超时自动降级为警告；规则之间禁止相互调用
- **[风险] 过度验证限制系统灵活性** → [缓解] 所有规则默认启用警告模式，生产环境逐步调整为阻断模式；提供 `skipValidation` 紧急开关
- **[风险] Zod 引入增加包体积** → [缓解] Zod 压缩后约 15KB，对 Node.js 服务端可接受；如体积敏感可替换为 `valibot` 或纯类型守卫
- **[风险] 跨 Turn 验证状态丢失** → [缓解] Session Extension 自动持久化，Blackboard 提供共享存储兜底

