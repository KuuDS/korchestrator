## MODIFIED Requirements

### Requirement: State Persistence (FR-PLAN-003)

The system SHALL persist Plan state across conversation turns using Session Extensions.

#### Scenario: Plan state creation via official API
- **GIVEN** a newly created Plan
- **WHEN** the `before_agent_reply` hook completes plan generation
- **THEN** the system SHALL register a Session Extension named `"plan_state"` via `api.registerSessionExtension`
- **AND** the extension SHALL provide a `serializer` that converts the Plan object to a JSON-compatible format
- **AND** the extension SHALL provide a `deserializer` that reconstructs the Plan object from the stored format
- **AND** OpenClaw SHALL handle the actual persistence and retrieval across turns

#### Scenario: Task-run mapping persistence
- **GIVEN** an active Plan with subagent executions
- **WHEN** a subagent is spawned for a task
- **THEN** the system SHALL maintain `taskRunMap: Record<string, string>` within the Plan state
- **AND** the mapping SHALL store `runId` → `taskId` associations
- **AND** the updated Plan state SHALL be persisted through the Session Extension mechanism

#### Scenario: Session cleanup differentiation
- **GIVEN** a Plan state stored in Session Extension
- **WHEN** the session is cleaned up with reason `reset` or `restart`
- **THEN** the system SHALL preserve the Plan state for continuity
- **WHEN** the session is cleaned up with reason `delete` or `disable`
- **THEN** the system SHALL remove the Plan state and associated Blackboard artifacts

## ADDED Requirements

### Requirement: Plugin Entry Point Contract (FR-PLAN-005)

The system SHALL conform to the OpenClaw Plugin SDK entry point contract.

#### Scenario: Official SDK entry point
- **GIVEN** the plugin is loaded by OpenClaw
- **WHEN** OpenClaw imports the plugin module
- **THEN** the default export SHALL be an object returned by `definePluginEntry`
- **AND** the object SHALL contain `id`, `name`, and `register(api)` fields
- **AND** the `register(api)` function SHALL be called by OpenClaw during plugin initialization

#### Scenario: Conversation access declaration
- **GIVEN** the plugin needs to intercept conversation lifecycle hooks
- **WHEN** the plugin entry is registered
- **THEN** the system SHALL declare `allowConversationAccess: true`
- **AND** OpenClaw SHALL permit the plugin to register `before_agent_reply`, `before_prompt_build`, `before_agent_finalize`, and `agent_end` hooks

### Requirement: Hook Return Value Pattern (FR-PLAN-006)

The system SHALL use return-value pattern for decision-capable hooks.

#### Scenario: Prompt build injection returns value
- **GIVEN** the `before_prompt_build` hook handler is invoked
- **WHEN** a stored Plan exists in session
- **THEN** the handler SHALL return `{ prependContext: markdown }`
- **AND** the system SHALL NOT mutate the input `event` object directly

#### Scenario: Finalize decision returns value
- **GIVEN** the `before_agent_finalize` hook handler is invoked
- **WHEN** the Replanner determines the plan needs revision
- **THEN** the handler SHALL return `{ action: "revise", reason: decision.reason }`
- **WHEN** all tasks are completed
- **THEN** the handler SHALL return `{ action: "finalize" }`

#### Scenario: Spawning concurrency check returns value
- **GIVEN** the `subagent_spawning` hook handler is invoked
- **WHEN** the concurrency limit is reached
- **THEN** the handler SHALL return `{ block: true, reason: "..." }`
- **WHEN** concurrency allows spawning
- **THEN** the handler SHALL return `{ block: false }` or `undefined`
