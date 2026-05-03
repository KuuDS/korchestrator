## ADDED Requirements

### Requirement: Lifecycle Hook Management
The system SHALL manage configuration lifecycle through Gateway hooks, loading and validating config on startup and preserving state on shutdown.

#### Scenario: Gateway startup
- **WHEN** the OpenClaw Gateway is starting and the `gateway_start` hook fires
- **THEN** the system SHALL:
  1. Load and parse the plugin configuration
  2. Validate configuration against Zod schema
  3. Initialize Planner, TaskRouter, Replanner, and Blackboard instances
  4. Cache validated configuration for runtime use

#### Scenario: Gateway shutdown
- **WHEN** the OpenClaw Gateway is stopping and the `gateway_stop` hook fires
- **THEN** the system SHALL:
  1. Save current execution state
  2. Release resources and connections
  3. Prepare for potential reinitialization

### Requirement: Configuration Change Detection
The system SHALL detect and react to configuration file changes while protecting active Plan executions.

#### Scenario: File change detection
- **WHEN** a configuration file (e.g., `plugin.json`) is modified
- **THEN** the system SHALL:
  1. Trigger the `gateway_stop` sequence
  2. Reload configuration from disk
  3. Trigger the `gateway_start` sequence
  4. Ensure active Plans continue execution unaffected

#### Scenario: Active Plan protection
- **WHEN** a Plan is currently executing
- **AND** a configuration hot-reload occurs
- **THEN** the system SHALL:
  1. Complete the reload process
  2. Preserve all active Plan states
  3. Apply new configuration only to subsequent requests

### Requirement: Differentiated Reload Strategy
The system SHALL apply differentiated reload strategies based on the changed configuration parameter.

#### Scenario: Model configuration change
- **WHEN** `plannerModel` or `replannerModel` is modified
- **AND** the configuration reloads
- **THEN** the change SHALL take effect immediately
- **AND** subsequent Plan generations SHALL use the new model

#### Scenario: Concurrency limit change
- **WHEN** `maxConcurrency` is modified
- **AND** the configuration reloads
- **THEN** the change SHALL take effect immediately
- **AND** running tasks SHALL NOT be interrupted

#### Scenario: Role configuration change
- **WHEN** `agentRoles` is modified
- **AND** the configuration reloads
- **THEN** the change SHALL take effect immediately
- **AND** new task routing SHALL use the updated role definitions

#### Scenario: Classification rules change
- **WHEN** `classificationRules` is modified
- **AND** the configuration reloads
- **THEN** the system SHALL:
  1. Clear the existing rule cache
  2. Load the new rule set
  3. Apply new rules to subsequent classifications

#### Scenario: Skip classification toggle
- **WHEN** `skipClassification` is modified
- **AND** the configuration reloads
- **THEN** the change SHALL take effect immediately
- **AND** subsequent requests SHALL follow the new classification behavior

### Requirement: Configuration Validation
The system SHALL validate all configuration changes before applying them, rejecting invalid configs while preserving the existing valid configuration.

#### Scenario: Valid configuration
- **WHEN** a modified configuration passes Zod schema validation
- **AND** the hot-reload process executes
- **THEN** the system SHALL apply the new configuration
- **AND** the system SHALL log the successful reload

#### Scenario: Invalid configuration
- **WHEN** a modified configuration fails Zod schema validation
- **AND** the hot-reload process executes
- **THEN** the system SHALL:
  1. Reject the invalid configuration
  2. Retain the existing valid configuration
  3. Log detailed validation errors
  4. Continue operation without interruption

#### Scenario: Invalid model name
- **WHEN** `plannerModel` or `replannerModel` is an empty string
- **THEN** Zod validation SHALL fail
- **AND** the invalid configuration SHALL be rejected

#### Scenario: Invalid concurrency value
- **WHEN** `maxConcurrency` is less than 1 or not an integer
- **THEN** Zod validation SHALL fail
- **AND** the invalid configuration SHALL be rejected

#### Scenario: Invalid metrics output
- **WHEN** `metricsOutput` is not one of `"blackboard"`, `"webhook"`, `"otel"`, or `"none"`
- **THEN** Zod validation SHALL fail
- **AND** the invalid configuration SHALL be rejected

#### Scenario: Missing webhook URL
- **WHEN** `metricsOutput` is `"webhook"`
- **AND** `metricsWebhook` is empty or not a valid URL
- **THEN** Zod validation SHALL fail
- **AND** the invalid configuration SHALL be rejected

#### Scenario: Missing OTel endpoint
- **WHEN** `metricsOutput` is `"otel"`
- **AND** `metricsOtelEndpoint` is empty or not a valid URL
- **THEN** Zod validation SHALL fail
- **AND** the invalid configuration SHALL be rejected
