## ADDED Requirements

### Requirement: Agent 能力集与任务需求匹配
系统 SHALL 验证分配的子 Agent 具备执行任务所需的能力标签。

#### Scenario: 能力匹配的 Agent 通过验证
- **WHEN** Task 需要能力 ["code-review", "typescript"]，分配的 Agent 能力集包含 ["code-review", "typescript", "security"]
- **THEN** 验证通过，任务进入执行队列

#### Scenario: 能力不匹配的 Agent 被拦截
- **WHEN** Task 需要能力 ["browser-automation"]，分配的 Agent 能力集仅包含 ["code-generation"]
- **THEN** 验证失败，返回 `AGENT_CAPABILITY_MISMATCH` 错误，触发 TaskRouter 重新选择 Agent

### Requirement: Agent 负载均衡检查
系统 SHALL 验证当前 Agent 的并发任务数是否超过其最大并发限制。

#### Scenario: 低负载 Agent 通过验证
- **WHEN** Agent 当前并发任务数为 2，最大并发限制为 5
- **THEN** 验证通过

#### Scenario: 过载 Agent 触发重新路由
- **WHEN** Agent 当前并发任务数为 5，达到最大并发限制
- **THEN** 验证失败，返回 `AGENT_OVERLOADED` 错误，TaskRouter SHALL 选择备用 Agent 或加入等待队列

### Requirement: 任务优先级与 Agent 优先级对齐
系统 SHALL 验证高优先级任务是否分配给具备足够优先级的 Agent。

#### Scenario: 高优先级任务分配给高优先级 Agent
- **WHEN** P0 任务分配给优先级为 1 的 Agent
- **THEN** 验证通过

#### Scenario: 高优先级任务分配给低优先级 Agent 触发警告
- **WHEN** P0 任务分配给优先级为 5 的 Agent（优先级数字越大优先级越低）
- **THEN** 验证产生警告 `PRIORITY_MISMATCH`，建议升级到优先级 ≤ 2 的 Agent
