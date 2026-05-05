## ADDED Requirements

### Requirement: Plan 结构完整性验证
系统 SHALL 验证生成的 Plan 包含必需的字段：id、tasks、dependencies、metadata。

#### Scenario: 完整 Plan 通过验证
- **WHEN** Planner 生成包含所有必需字段的 Plan
- **THEN** 验证通过，Plan 进入 Task 路由阶段

#### Scenario: 缺少必需字段的 Plan 被拦截
- **WHEN** Planner 生成缺少 `tasks` 字段的 Plan
- **THEN** 验证失败，返回 `INVALID_PLAN_STRUCTURE` 错误，触发 Replanner 重新生成

### Requirement: 任务依赖循环检测
系统 SHALL 检测 Plan 中任务依赖关系是否存在循环引用。

#### Scenario: 无循环依赖的 Plan 通过验证
- **WHEN** Plan 中 task-A 依赖 task-B，task-B 依赖 task-C，task-C 无依赖
- **THEN** 验证通过，标记依赖图为无环

#### Scenario: 存在循环依赖的 Plan 被拦截
- **WHEN** Plan 中 task-A 依赖 task-B，task-B 依赖 task-C，task-C 依赖 task-A
- **THEN** 验证失败，返回 `CIRCULAR_DEPENDENCY` 错误，包含具体的循环路径 [task-A → task-B → task-C → task-A]

### Requirement: 任务粒度合理性检查
系统 SHALL 验证单个任务的描述和输入输出是否符合合理粒度标准。

#### Scenario: 粒度合理的任务通过验证
- **WHEN** 任务描述在 10-500 字符之间，且包含明确的输入和预期输出定义
- **THEN** 验证通过

#### Scenario: 粒度过大的任务触发警告
- **WHEN** 任务描述超过 500 字符或包含超过 5 个子步骤
- **THEN** 验证产生警告 `TASK_TOO_LARGE`，建议拆分为子任务，但不阻断执行（默认策略）

#### Scenario: 粒度过小的任务触发警告
- **WHEN** 任务描述少于 10 字符或无明显输入输出定义
- **THEN** 验证产生警告 `TASK_TOO_SMALL`，建议合并到父任务

### Requirement: 任务超时与资源约束验证
系统 SHALL 验证每个任务是否配置了合理的超时时间和资源限制。

#### Scenario: 配置合理的任务通过验证
- **WHEN** 任务配置 timeout ≤ 300s，且 memory ≤ 512MB
- **THEN** 验证通过

#### Scenario: 超时配置不合理的任务被警告
- **WHEN** 任务配置 timeout > 300s 或未配置 timeout
- **THEN** 验证产生警告 `TIMEOUT_NOT_CONFIGURED`，自动设置默认超时 60s
