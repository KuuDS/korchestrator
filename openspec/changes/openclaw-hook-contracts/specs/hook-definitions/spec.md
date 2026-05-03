## ADDED Requirements

### Requirement: Hook Handler Type Definitions
The system SHALL define TypeScript interfaces for every hook used by the plugin, capturing handler signatures, context types, and return types.

#### Scenario: Gateway lifecycle hooks
- **WHEN** defining the `gateway_start` hook contract
- **THEN** the system SHALL specify a handler signature of `(event: GatewayEvent) => void | Promise<void>`
- **AND** the priority SHALL be `90`
- **AND** the context SHALL include plugin configuration and API reference

#### Scenario: Agent reply hooks
- **WHEN** defining the `before_agent_reply` hook contract
- **THEN** the system SHALL specify a handler signature returning `{ syntheticReply?: string } | undefined | Promise<{ syntheticReply?: string } | undefined>`
- **AND** the priority SHALL be `80`
- **AND** the context SHALL include the user request and session state

#### Scenario: Prompt build hooks
- **WHEN** defining the `before_prompt_build` hook contract
- **THEN** the system SHALL specify a handler signature returning `{ prependContext?: string } | undefined | Promise<{ prependContext?: string } | undefined>`
- **AND** the priority SHALL be `70`
- **AND** the context SHALL include the current Plan state from session extensions

#### Scenario: Subagent delivery hooks
- **WHEN** defining the `subagent_delivery_target` hook contract
- **THEN** the system SHALL specify a handler signature returning `{ targetAgentId: string } | Promise<{ targetAgentId: string }>`
- **AND** the priority SHALL be `70`
- **AND** the context SHALL include the task being routed

#### Scenario: Subagent spawning hooks
- **WHEN** defining the `subagent_spawning` hook contract
- **THEN** the system SHALL specify a handler signature returning `{ block?: boolean; reason?: string } | undefined | Promise<{ block?: boolean; reason?: string } | undefined>`
- **AND** the priority SHALL be `70`
- **AND** the context SHALL include current running task count

#### Scenario: Agent finalize hooks
- **WHEN** defining the `before_agent_finalize` hook contract
- **THEN** the system SHALL specify a handler signature returning `{ action: "revise" | "finalize"; reason?: string } | Promise<{ action: "revise" | "finalize"; reason?: string }>`
- **AND** the priority SHALL be `60`
- **AND** the context SHALL include the current Plan and task statuses

#### Scenario: Tool call hooks
- **WHEN** defining the `before_tool_call` hook contract
- **THEN** the system SHALL specify a handler signature returning `{ params?: Record<string, unknown>; block?: boolean; requireApproval?: boolean; onResolution?: ApprovalCallback } | undefined | Promise<...>`
- **AND** the priority SHALL be `50`
- **AND** the context SHALL include the tool name, parameters, and runId

#### Scenario: Tool result hooks
- **WHEN** defining the `after_tool_call` hook contract
- **THEN** the system SHALL specify a handler signature of `(event: AfterToolCallEvent) => void | Promise<void>`
- **AND** the priority SHALL be `50`
- **AND** the context SHALL include tool result, error, and duration

#### Scenario: Subagent lifecycle hooks
- **WHEN** defining the `subagent_spawned` hook contract
- **THEN** the system SHALL specify a handler signature of `(event: SubagentSpawnedEvent) => void | Promise<void>`
- **AND** the priority SHALL be `50`
- **AND** the context SHALL include runId and taskId mapping

#### Scenario: Subagent end hooks
- **WHEN** defining the `subagent_ended` hook contract
- **THEN** the system SHALL specify a handler signature of `(event: SubagentEndedEvent) => void | Promise<void>`
- **AND** the priority SHALL be `50`
- **AND** the context SHALL include runId, result, and duration

#### Scenario: Heartbeat hooks
- **WHEN** defining the `heartbeat_prompt_contribution` hook contract
- **THEN** the system SHALL specify a handler signature returning `{ contribution?: string } | undefined | Promise<{ contribution?: string } | undefined>`
- **AND** the priority SHALL be `40`
- **AND** the context SHALL include current Plan execution summary

#### Scenario: Agent end hooks
- **WHEN** defining the `agent_end` hook contract
- **THEN** the system SHALL specify a handler signature of `(event: AgentEndEvent) => void | Promise<void>`
- **AND** the priority SHALL be unspecified (no priority level)
- **AND** the context SHALL include execution metrics and duration

### Requirement: Priority Level Constraints
The system SHALL constrain hook priority values to the documented levels from PRD §4.2.

#### Scenario: Valid priority assignment
- **WHEN** a hook is registered with a priority of `90`, `80`, `70`, `60`, `50`, or `40`
- **THEN** the TypeScript compiler SHALL accept the value

#### Scenario: Invalid priority rejection
- **WHEN** a hook is registered with a priority outside the allowed set
- **THEN** the TypeScript compiler SHALL reject the value at compile time

### Requirement: Hook Registry Type
The system SHALL define a mapped type that maps hook names to their handler interfaces.

#### Scenario: Generic registration
- **WHEN** using the `HookRegistry` mapped type to register a handler
- **THEN** the TypeScript compiler SHALL enforce the correct handler signature for the given hook name
- **AND** the TypeScript compiler SHALL enforce the correct return type

#### Scenario: Hook name exhaustiveness
- **WHEN** enumerating all keys of the `HookRegistry` type
- **THEN** the system SHALL include exactly the 12 hooks documented in PRD §4.2
