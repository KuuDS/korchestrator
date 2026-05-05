## 1. 基础架构与依赖

- [x] 1.1 安装 Zod 依赖 (`npm install zod`)
- [x] 1.2 创建 `src/validation/` 目录结构：`types.ts`、`engine.ts`、`rules/`、`hooks.ts`
- [x] 1.3 定义验证核心类型：`ValidationRule`、`ValidationContext`、`ValidationResult`、`ValidationStrategy`（零 `any` 类型）
- [x] 1.4 定义 Zod Schema：`ValidationRuleSchema`、`ValidationResultSchema`

## 2. 规则引擎核心 (rule-engine)

- [x] 2.1 实现 `RuleRegistry` 类：支持注册、注销、按优先级排序规则
- [x] 2.2 实现 `RuleExecutor`：按优先级顺序执行规则，支持阻断/警告策略
- [x] 2.3 实现规则执行超时保护（默认 5000ms，可配置）
- [x] 2.4 实现 `ValidationContextBuilder`：构建包含 plan/task/agent/session/blackboard/history 的上下文
- [x] 2.5 编写规则引擎单元测试（覆盖率 >80%）

## 3. Plan 验证模块 (plan-validation)

- [x] 3.1 实现 `PlanStructureValidator` 规则：检查必需字段完整性
- [x] 3.2 实现 `CircularDependencyValidator` 规则：DFS 检测循环依赖
- [x] 3.3 实现 `TaskGranularityValidator` 规则：检查任务描述长度和子步骤数量
- [x] 3.4 实现 `TimeoutConstraintValidator` 规则：检查超时和资源约束配置
- [x] 3.5 在 `before_agent_reply` Hook (priority 75) 集成 Plan 验证
- [x] 3.6 编写 Plan 验证单元测试和集成测试

## 4. Task-Agent 匹配验证 (task-agent-matching)

- [x] 4.1 实现 `AgentCapabilityMatcher` 规则：验证 Agent 能力标签覆盖 Task 需求
- [x] 4.2 实现 `AgentLoadBalancer` 规则：检查 Agent 并发负载
- [x] 4.3 实现 `PriorityAlignmentValidator` 规则：验证任务优先级与 Agent 优先级对齐
- [x] 4.4 在 `subagent_delivery_target` Hook (priority 65) 集成匹配验证
- [x] 4.5 编写 Task-Agent 匹配验证单元测试

## 5. 验证状态持久化 (validation-persistence)

- [x] 5.1 注册 `validation_state` Session Extension
- [x] 5.2 实现 `ValidationHistoryRecorder`：记录每次验证结果到 Session Extension
- [x] 5.3 实现 `ValidationStatsCollector`：聚合规则触发频率、失败率等统计
- [x] 5.4 实现 `ValidationHistoryCleaner`：支持按时间和数量策略清理历史记录
- [x] 5.5 实现跨 Turn 验证状态恢复逻辑
- [x] 5.6 编写持久化模块单元测试

## 6. Hook 集成与插件入口

- [x] 6.1 在 `src/index.ts` 导出验证规则注册接口：`registerValidationRule()`
- [x] 6.2 注册 `before_agent_reply` (priority 75) 验证钩子
- [x] 6.3 注册 `subagent_delivery_target` (priority 65) 匹配验证钩子
- [x] 6.4 实现 `skipValidation` 紧急开关（通过 Blackboard 或配置）
- [x] 6.5 更新插件主入口，初始化默认规则集
- [x] 6.6 编写 Hook 集成端到端测试

## 7. 默认规则集与配置

- [x] 7.1 定义默认规则集：`NO_CIRCULAR_DEPENDENCY`、`AGENT_CAPABILITY_MATCH`、`TASK_GRANULARITY_CHECK`
- [x] 7.2 实现规则配置加载（从 `plugin.json` 或环境变量）
- [x] 7.3 实现自动修复策略：`TASK_TOO_LARGE` 自动拆分建议、`TIMEOUT_NOT_CONFIGURED` 自动设置默认值
- [x] 7.4 提供规则启用/禁用配置接口

## 8. 测试与质量保障

- [x] 8.1 规则引擎单元测试覆盖率 >80%
- [x] 8.2 Plan 验证集成测试（正常路径 + 异常路径）
- [x] 8.3 Task-Agent 匹配集成测试
- [x] 8.4 验证持久化集成测试
- [x] 8.5 端到端测试：完整 Plan 生成 → 验证 → 路由 → 执行流程
- [x] 8.6 运行 `tsc --noEmit` 确保零类型错误和零 `any` 类型
- [x] 8.7 性能测试：复杂 Plan（50+ 任务）验证耗时 < 1s

## 9. 文档与发布

- [x] 9.1 编写 `docs/validation-rules.md` 使用文档
- [x] 9.2 更新 `plugin.json` 配置说明（新增验证相关配置项）
- [x] 9.3 更新 README，添加 Validation Rules 功能说明
- [x] 9.4 运行完整测试套件确认全部通过
