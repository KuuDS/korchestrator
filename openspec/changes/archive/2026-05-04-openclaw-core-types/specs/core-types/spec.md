## ADDED Requirements

### Requirement: Plan interface definition
The system SHALL define a TypeScript interface representing the Plan state stored in Session Extensions.

#### Scenario: Plan structure validation
- **WHEN** a Plan object is created or deserialized
- **THEN** the Plan interface SHALL require:
  - `id`: a non-empty string
  - `status`: one of `"planning"`, `"executing"`, `"reviewing"`, `"done"`
  - `tasks`: an array of Task objects
  - `taskRunMap`: a Record mapping string runIds to string taskIds
  - `createdAt`: a number representing epoch milliseconds
  - `updatedAt`: a number representing epoch milliseconds

### Requirement: Task interface definition
The system SHALL define a TypeScript interface representing an atomic subtask within a Plan.

#### Scenario: Task structure validation
- **WHEN** a Task object is created or deserialized
- **THEN** the Task interface SHALL require:
  - `id`: a non-empty string in `task_NNN` format
  - `description`: a non-empty string
  - `skills`: an array of strings from the allowed set: `search`, `browser`, `shell`, `code`, `file`
  - `dependencies`: an array of task ID strings
  - `status`: one of `"pending"`, `"running"`, `"done"`, `"failed"`, `"skipped"`
  - `requiresApproval`: a boolean defaulting to `false`
  - `assignedAgent`: an optional string
  - `result`: an optional string
  - `startedAt`: an optional number
  - `completedAt`: an optional number
  - `_retryCount`: an optional number

### Requirement: AgentRole interface definition
The system SHALL define a TypeScript interface representing a Subagent role configuration.

#### Scenario: AgentRole structure validation
- **WHEN** an AgentRole object is created or deserialized
- **THEN** the AgentRole interface SHALL require:
  - `agentId`: a non-empty string
  - `name`: a non-empty string
  - `skills`: an array of strings
  - `model`: a non-empty string

### Requirement: RepairDecision interface definition
The system SHALL define a TypeScript interface representing a Replanner repair strategy.

#### Scenario: RepairDecision structure validation
- **WHEN** a RepairDecision object is created or deserialized
- **THEN** the RepairDecision interface SHALL require:
  - `strategy`: one of `"retry"`, `"decompose"`, `"skip"`, `"escalate"`
  - `newTasks`: an optional array of Task objects
  - `reason`: a non-empty string

### Requirement: HealthCheck interface definition
The system SHALL define a TypeScript interface representing a Plan health assessment.

#### Scenario: HealthCheck structure validation
- **WHEN** a HealthCheck object is created or deserialized
- **THEN** the HealthCheck interface SHALL require:
  - `needsReroute`: a boolean
  - `failedTasks`: an array of Task objects
  - `reason`: an optional string

### Requirement: PluginConfig interface definition
The system SHALL define a TypeScript interface representing the complete plugin configuration.

#### Scenario: PluginConfig structure validation
- **WHEN** plugin configuration is loaded
- **THEN** the PluginConfig interface SHALL require:
  - `plannerModel`: a non-empty string
  - `replannerModel`: a non-empty string
  - `maxConcurrency`: an integer greater than or equal to 1
  - `maxStepsPerAgent`: an integer greater than or equal to 1
  - `skipClassification`: a boolean
  - `classificationRules`: an array of objects with `pattern` (string) and `result` (`"simple"` or `"complex"`)
  - `metricsOutput`: one of `"blackboard"`, `"webhook"`, `"otel"`, `"none"`
  - `metricsWebhook`: an optional string (required when `metricsOutput` is `"webhook"`)
  - `metricsOtelEndpoint`: an optional string (required when `metricsOutput` is `"otel"`)
  - `agentRoles`: an array of AgentRole objects

### Requirement: Zod runtime validation schemas
The system SHALL provide Zod schemas for all core interfaces to enable runtime validation.

#### Scenario: Valid Plan passes Zod validation
- **GIVEN** a Plan object matching the interface definition
- **WHEN** the Plan is validated against its Zod schema
- **THEN** validation SHALL succeed

#### Scenario: Invalid Plan fails Zod validation
- **GIVEN** a Plan object with an invalid `status` value
- **WHEN** the Plan is validated against its Zod schema
- **THEN** validation SHALL fail with a descriptive error

#### Scenario: Valid Task passes Zod validation
- **GIVEN** a Task object matching the interface definition
- **WHEN** the Task is validated against its Zod schema
- **THEN** validation SHALL succeed

#### Scenario: Invalid Task fails Zod validation
- **GIVEN** a Task object with an invalid `skill` value
- **WHEN** the Task is validated against its Zod schema
- **THEN** validation SHALL fail with a descriptive error

#### Scenario: Valid PluginConfig passes Zod validation
- **GIVEN** a PluginConfig object matching the interface definition
- **WHEN** the PluginConfig is validated against its Zod schema
- **THEN** validation SHALL succeed

#### Scenario: Invalid PluginConfig fails Zod validation
- **GIVEN** a PluginConfig object with `maxConcurrency` set to 0
- **WHEN** the PluginConfig is validated against its Zod schema
- **THEN** validation SHALL fail with a descriptive error

#### Scenario: Schema-derived TypeScript types match hand-written interfaces
- **GIVEN** Zod schemas defined for all interfaces
- **WHEN** TypeScript types are derived via `z.infer<typeof Schema>`
- **THEN** the inferred types SHALL be structurally compatible with the hand-written interfaces
