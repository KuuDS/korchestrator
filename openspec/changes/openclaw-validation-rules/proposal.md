## Why

当前的 Plan-Task-Build 多 Agent 编排插件缺乏对 Plan 生成质量和 Task 分配合理性的自动化验证机制。随着任务复杂度增加，生成的 Plan 可能存在逻辑漏洞、循环依赖或不合理的任务拆分，导致子 Agent 执行失败或产生不可预期的结果。需要引入一套 Validation Rules 框架，在 Plan 生成、Task 路由和执行前进行多维度验证，确保编排质量。

## What Changes

- **新增 Validation Rules 引擎**：在 Planner、TaskRouter 和 Replanner 核心模块中集成验证规则钩子
- **新增规则注册与执行机制**：支持前置规则（pre-validation）和后置规则（post-validation），可自定义规则集
- **新增默认规则集**：包含循环依赖检测、任务粒度检查、Agent 能力匹配验证、超时与资源约束检查
- **新增验证结果处理策略**：支持阻断（block）、警告（warn）、自动修复（auto-fix）三种模式
- **新增 Blackboard 验证状态持久化**：通过 Session Extension 记录验证历史和规则触发统计
- **修改 Plan 生成流程**：在 `before_agent_reply` 钩子中增加 Plan 结构验证步骤
- **修改 Task 路由流程**：在 `subagent_delivery_target` 钩子中增加 Agent-Task 匹配度验证
- **新增 `any` 类型禁止规则**：在代码层面强制执行 TypeScript strict 模式和无 `any` 类型的质量约束

## Capabilities

### New Capabilities
- `plan-validation`: Plan 结构验证 — 检查 Plan 的完整性、依赖关系、循环引用和任务拆分合理性
- `task-agent-matching`: Task-Agent 匹配验证 — 验证任务与子 Agent 能力集的匹配度
- `rule-engine`: 规则引擎核心 — 规则的注册、编排、执行和生命周期管理
- `validation-persistence`: 验证状态持久化 — 验证结果的历史记录和统计分析

### Modified Capabilities
- `plan-generation`: 在 Plan 生成流程中增加验证步骤，要求生成的 Plan 必须通过结构验证才能进入 Task 阶段
- `task-routing`: 在 Task 路由前增加 Agent 匹配验证，不匹配的任务需要重新规划或降级处理

## Impact

- **核心模块**: Planner、TaskRouter、Replanner 均需要集成验证钩子点
- **Hook 优先级**: `before_agent_reply` (priority 75, 新增验证子优先级)、`subagent_delivery_target` (priority 65, 新增匹配验证)
- **Session Extension**: `plan_state` extension 需要扩展验证状态字段
- **API 变更**: 新增 `registerValidationRule()`、`validatePlan()`、`validateTaskMatch()` 接口
- **依赖**: 新增 `zod` 或类似 schema 验证库用于规则定义（可选，可用原生 TypeScript 类型）
- **测试**: 需要为规则引擎、各验证规则和集成流程编写单元测试和集成测试
- **性能**: 验证步骤可能增加 Plan 生成的延迟，需关注复杂 Plan 的验证性能
