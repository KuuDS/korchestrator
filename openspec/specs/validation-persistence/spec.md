## ADDED Requirements

### Requirement: 验证结果的历史记录
系统 SHALL 将每次验证的结果持久化到 Session Extension，包含时间戳、规则 ID、结果状态和关联的 Plan/Task ID。

#### Scenario: Plan 验证结果持久化
- **WHEN** Plan 完成验证（无论通过或失败）
- **THEN** Session Extension `validation_state` 中新增记录 `{ id, timestamp, type: "plan", planId, results: [...] }`

#### Scenario: Task 路由验证结果持久化
- **WHEN** Task 完成 Agent 匹配验证
- **THEN** `validation_state` 中新增记录 `{ id, timestamp, type: "task", taskId, agentId, results: [...] }`

### Requirement: 验证统计与分析
系统 SHALL 提供接口查询验证统计数据，包括规则触发频率、失败率和趋势。

#### Scenario: 查询规则触发统计
- **WHEN** 调用 `getValidationStats({ ruleId: "no-circular-dep", timeRange: "24h" })`
- **THEN** 返回该规则在 24 小时内的触发次数、通过次数、失败次数和平均执行耗时

#### Scenario: 查询 Plan 验证成功率趋势
- **WHEN** 调用 `getValidationStats({ type: "plan", granularity: "hour" })`
- **THEN** 返回按小时聚合的 Plan 验证成功率数据

### Requirement: 跨 Turn 验证状态恢复
系统 SHALL 在会话恢复时从 Session Extension 加载历史验证状态。

#### Scenario: 会话恢复时加载验证历史
- **WHEN** 会话从持久化存储恢复
- **THEN** `validation_state` 中的历史记录被加载到内存，后续验证可访问 `history` 上下文

### Requirement: 验证状态清理策略
系统 SHALL 支持配置验证历史的保留策略，防止存储无限增长。

#### Scenario: 自动清理过期验证记录
- **WHEN** 配置 `retention: { maxAge: "7d", maxRecords: 1000 }`
- **THEN** 超过 7 天或总数超过 1000 条的旧记录自动清理

#### Scenario: 手动清理验证历史
- **WHEN** 调用 `clearValidationHistory({ before: "2026-01-01" })`
- **THEN** 指定时间之前的所有验证记录被删除
