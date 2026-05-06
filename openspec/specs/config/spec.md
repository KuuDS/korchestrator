# Configuration Specification

## Purpose

The Configuration module manages plugin settings with support for hot-reloading, validation, and differentiated reload strategies to ensure zero-downtime configuration updates.

## Requirements

### Requirement: Lifecycle Hook Management (FR-CONFIG-001)

The system SHALL manage configuration lifecycle through Gateway hooks.

#### Scenario: Gateway startup
- GIVEN the OpenClaw Gateway is starting
- WHEN the `gateway_start` hook fires
- THEN the system SHALL:
  1. Load and parse the plugin configuration
  2. Validate configuration against Zod schema
  3. Initialize Planner, TaskRouter, Replanner, and Blackboard instances
  4. Cache validated configuration for runtime use

#### Scenario: Gateway shutdown
- GIVEN the OpenClaw Gateway is stopping
- WHEN the `gateway_stop` hook fires
- THEN the system SHALL:
  1. Save current execution state
  2. Release resources and connections
  3. Prepare for potential reinitialization

### Requirement: Configuration Change Detection (FR-CONFIG-002)

The system SHALL detect and react to configuration changes.

#### Scenario: File change detection
- GIVEN a configuration file (e.g., `plugin.json`) is modified
- WHEN the change is detected by the file watcher
- THEN the system SHALL:
  1. Trigger the `gateway_stop` sequence
  2. Reload configuration from disk
  3. Trigger the `gateway_start` sequence
  4. Ensure active Plans continue execution unaffected

#### Scenario: Active Plan protection
- GIVEN a Plan is currently executing
- WHEN a configuration hot-reload occurs
- THEN the system SHALL:
  1. Complete the reload process
  2. Preserve all active Plan states
  3. Apply new configuration only to subsequent requests

### Requirement: Differentiated Reload Strategy (FR-CONFIG-003)

The system SHALL apply differentiated reload strategies based on the changed configuration parameter.

#### Scenario: Model configuration change
- GIVEN `plannerModel` or `replannerModel` is modified
- WHEN the configuration reloads
- THEN the change SHALL take effect immediately
- AND subsequent Plan generations SHALL use the new model

#### Scenario: Concurrency limit change
- GIVEN `maxConcurrency` is modified
- WHEN the configuration reloads
- THEN the change SHALL take effect immediately
- AND running tasks SHALL NOT be interrupted

#### Scenario: Role configuration change
- GIVEN `agentRoles` is modified
- WHEN the configuration reloads
- THEN the change SHALL take effect immediately
- AND new task routing SHALL use the updated role definitions

#### Scenario: Classification rules change
- GIVEN `classificationRules` is modified
- WHEN the configuration reloads
- THEN the system SHALL:
  1. Clear the existing rule cache
  2. Load the new rule set
  3. Apply new rules to subsequent classifications

#### Scenario: Skip classification toggle
- GIVEN `skipClassification` is modified
- WHEN the configuration reloads
- THEN the change SHALL take effect immediately
- AND subsequent requests SHALL follow the new classification behavior

### Requirement: Configuration Validation (FR-CONFIG-004)

The system SHALL validate all configuration changes before applying them.

#### Scenario: Valid configuration
- GIVEN a modified configuration passes Zod schema validation
- WHEN the hot-reload process executes
- THEN the system SHALL apply the new configuration
- AND the system SHALL log the successful reload

#### Scenario: Invalid configuration
- GIVEN a modified configuration fails Zod schema validation
- WHEN the hot-reload process executes
- THEN the system SHALL:
  1. Reject the invalid configuration
  2. Retain the existing valid configuration
  3. Log detailed validation errors
  4. Continue operation without interruption

## Hooks

| Hook | Priority | Purpose |
|------|----------|---------|
| `gateway_start` | 90 | Configuration loading and initialization |
| `gateway_stop` | 90 | State preservation and resource cleanup |

## Configuration Schema

```json
{
  "plannerModel": "gpt-4o-mini",
  "replannerModel": "gpt-4o-mini",
  "maxConcurrency": 3,
  "maxStepsPerAgent": 20,
  "skipClassification": false,
  "classificationRules": [
    { "pattern": "^(hello|hi|hey|你好|您好)", "result": "simple" },
    { "pattern": "^(what|who|when|where|为什么|什么是)", "result": "simple" },
    { "pattern": "^(explain|解释|说明).{0,50}$", "result": "simple" }
  ],
  "metricsOutput": "blackboard",
  "metricsWebhook": "",
  "metricsOtelEndpoint": "",
  "agentRoles": [
    { "agentId": "researcher", "name": "Researcher", "skills": ["search", "browser"], "model": "gpt-4o-mini" },
    { "agentId": "coder", "name": "Coder", "skills": ["shell", "code", "file"], "model": "gpt-4o" },
    { "agentId": "browser", "name": "BrowserOperator", "skills": ["browser"], "model": "gpt-4o-mini" },
    { "agentId": "reviewer", "name": "Reviewer", "skills": ["file", "code"], "model": "gpt-4o-mini" }
  ],
  "validation": {
    "enabled": true,
    "defaultTimeoutMs": 5000,
    "skipValidation": false,
    "retention": { "maxAge": "7d", "maxRecords": 1000 },
    "disabledRules": []
  }
}
```

## Validation Rules

| Parameter | Validation Rule |
|-----------|----------------|
| `plannerModel` | Non-empty string |
| `replannerModel` | Non-empty string |
| `maxConcurrency` | Integer ≥ 1 |
| `maxStepsPerAgent` | Integer ≥ 1 |
| `skipClassification` | Boolean |
| `classificationRules` | Array of `{ pattern: string, result: "simple" \| "complex" }` |
| `metricsOutput` | Enum: `"blackboard"`, `"webhook"`, `"otel"`, `"none"` |
| `metricsWebhook` | Valid URL when `metricsOutput` is `"webhook"` |
| `metricsOtelEndpoint` | Valid URL when `metricsOutput` is `"otel"` |
| `agentRoles` | Array of valid AgentRole objects |
| `validation.enabled` | Boolean |
| `validation.defaultTimeoutMs` | Integer ≥ 1 |
| `validation.skipValidation` | Boolean |
| `validation.retention.maxAge` | Optional string (e.g., `"7d"`, `"24h"`) |
| `validation.retention.maxRecords` | Optional integer ≥ 1 |
| `validation.disabledRules` | Array of rule ID strings |
