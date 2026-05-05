## ADDED Requirements

### Requirement: 规则的注册与注销
系统 SHALL 提供接口注册和注销验证规则，规则包含唯一标识、执行函数、优先级和处理策略。

#### Scenario: 成功注册新规则
- **WHEN** 调用 `registerValidationRule({ id: "no-circular-dep", execute: validateNoCycle, priority: 100, strategy: "block" })`
- **THEN** 规则被注册到规则引擎，返回规则句柄

#### Scenario: 注销已存在的规则
- **WHEN** 调用 `unregisterValidationRule(ruleHandle)`
- **THEN** 规则从引擎中移除，后续验证不再执行该规则

#### Scenario: 注册重复 ID 的规则失败
- **WHEN** 尝试注册 id 已存在的规则
- **THEN** 抛出 `DUPLICATE_RULE_ID` 错误

### Requirement: 规则的编排与执行
系统 SHALL 按照优先级顺序执行规则，支持同步和异步执行模式。

#### Scenario: 按优先级顺序执行规则
- **WHEN** 注册优先级为 100、50、200 的三个规则
- **THEN** 执行顺序为 200 → 100 → 50（数字越大优先级越高）

#### Scenario: 阻断策略规则失败时终止执行
- **WHEN** 执行规则链时，某个 `strategy: "block"` 的规则返回失败
- **THEN** 立即停止后续规则执行，返回当前累积的验证结果

#### Scenario: 警告策略规则失败时继续执行
- **WHEN** 执行规则链时，某个 `strategy: "warn"` 的规则返回失败
- **THEN** 记录警告，继续执行后续规则

### Requirement: 规则上下文传递
系统 SHALL 在执行规则时提供统一的验证上下文，包含当前 Plan、Task、Agent 信息和历史验证结果。

#### Scenario: 规则访问验证上下文
- **WHEN** 规则执行函数被调用
- **THEN** 参数 `context` 包含 `{ plan, task, agent, session, blackboard, history }`

### Requirement: 规则结果标准化
系统 SHALL 要求所有规则返回标准化的验证结果对象。

#### Scenario: 规则返回成功结果
- **WHEN** 规则执行完成且无异常
- **THEN** 返回 `{ passed: true, ruleId: "xxx", message: "optional", metadata: {} }`

#### Scenario: 规则返回失败结果
- **WHEN** 规则检测到违规
- **THEN** 返回 `{ passed: false, ruleId: "xxx", message: "...", severity: "error" | "warning", metadata: {}, fix?: FixAction }`

### Requirement: 规则执行超时保护
系统 SHALL 为单个规则执行设置超时机制，防止规则阻塞。

#### Scenario: 规则在超时前完成
- **WHEN** 规则执行耗时 100ms，超时设置为 5000ms
- **THEN** 正常返回结果

#### Scenario: 规则执行超时
- **WHEN** 规则执行耗时超过 5000ms
- **THEN** 规则被强制终止，返回 `{ passed: false, ruleId: "xxx", message: "Rule execution timeout", severity: "warning" }`
