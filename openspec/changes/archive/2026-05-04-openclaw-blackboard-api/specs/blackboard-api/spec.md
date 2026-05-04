## ADDED Requirements

### Requirement: Task result persistence (FR-BUILD-002)
The system SHALL persist task execution results to the filesystem as Markdown files.

#### Scenario: Successful result write
- **WHEN** `writeResult(taskId, content)` is called after a tool call completes successfully
- **THEN** the system SHALL create the file `workspace/WORKSPACE/{taskId}.md`
- **AND** the file SHALL contain the exact `content` string
- **AND** parent directories SHALL be created recursively if they do not exist

#### Scenario: Result read
- **WHEN** `readResult(taskId)` is called
- **AND** the file `workspace/WORKSPACE/{taskId}.md` exists
- **THEN** the system SHALL return the file contents as a string

#### Scenario: Result read for missing task
- **WHEN** `readResult(taskId)` is called
- **AND** the file does not exist
- **THEN** the system SHALL return an empty string

#### Scenario: Write failure handling
- **WHEN** `writeResult` encounters a filesystem error
- **THEN** the system SHALL log the error to stderr
- **AND** the system SHALL NOT throw an exception
- **AND** the orchestration pipeline SHALL continue execution

### Requirement: Plan artifact persistence
The system SHALL persist plan artifacts to the filesystem as Markdown files.

#### Scenario: Plan write
- **WHEN** `writePlan(planId, content)` is called
- **THEN** the system SHALL create the file `workspace/PLANS/{planId}.md`
- **AND** the file SHALL contain the exact `content` string
- **AND** parent directories SHALL be created recursively if they do not exist

#### Scenario: Plan write failure handling
- **WHEN** `writePlan` encounters a filesystem error
- **THEN** the system SHALL log the error to stderr
- **AND** the system SHALL NOT throw an exception

### Requirement: Metrics collection with multi-backend output (FR-BUILD-005)
The system SHALL collect execution metrics and output them to one or more configured backends.

#### Scenario: Blackboard metrics output (default)
- **GIVEN** `metricsOutput` is configured as `"blackboard"` or unset
- **WHEN** `writeMetrics(runId, metrics)` is called
- **THEN** the system SHALL write the metrics as a JSON file to `workspace/METRICS/{runId}.json`
- **AND** the JSON SHALL be pretty-printed with 2-space indentation

#### Scenario: Webhook metrics output
- **GIVEN** `metricsOutput` is configured as `"webhook"`
- **AND** `metricsWebhook` is set to a valid URL
- **WHEN** `writeMetrics(runId, metrics)` is called
- **THEN** the system SHALL write the metrics to the local METRICS directory
- **AND** the system SHALL POST the metrics to the configured webhook URL
- **AND** the POST body SHALL include `runId`, all metric fields, and a `timestamp`

#### Scenario: OpenTelemetry metrics output
- **GIVEN** `metricsOutput` is configured as `"otel"`
- **AND** `metricsOtelEndpoint` is set to a valid URL
- **WHEN** `writeMetrics(runId, metrics)` is called
- **THEN** the system SHALL write the metrics to the local METRICS directory
- **AND** the system SHALL POST the metrics to the configured OTel endpoint
- **AND** the POST body SHALL conform to OTLP JSON format with `resourceMetrics`, `scopeMetrics`, and `dataPoints`

#### Scenario: Suppressed metrics output
- **GIVEN** `metricsOutput` is configured as `"none"`
- **WHEN** `writeMetrics(runId, metrics)` is called
- **THEN** the system SHALL still write the metrics to the local METRICS directory
- **AND** the system SHALL NOT send data to any external endpoint

#### Scenario: Metrics write failure handling
- **WHEN** `writeMetrics` encounters any error (filesystem, network, or serialization)
- **THEN** the system SHALL log the error to stderr
- **AND** the system SHALL NOT throw an exception
- **AND** the orchestration pipeline SHALL continue execution

### Requirement: Result aggregation
The system SHALL aggregate multiple task results into a single Markdown document.

#### Scenario: Aggregate completed tasks
- **GIVEN** multiple tasks have completed and their results have been persisted
- **WHEN** `aggregateResults(taskIds)` is called with an array of task IDs
- **THEN** the system SHALL return a Markdown string
- **AND** each task result SHALL be formatted as `## Task: {taskId}\n\n{content}`
- **AND** task sections SHALL be separated by `\n\n---\n\n`
- **AND** tasks with no persisted result SHALL be omitted from the output

### Requirement: Lifecycle-aware cleanup
The system SHALL clean up persisted files based on the session lifecycle event reason.

#### Scenario: Reset cleanup
- **WHEN** `cleanup("reset")` is called
- **THEN** the system SHALL delete the `workspace/WORKSPACE` directory recursively
- **AND** the system SHALL delete the `workspace/METRICS` directory recursively
- **AND** the system SHALL preserve the `workspace/PLANS` directory

#### Scenario: Delete cleanup
- **WHEN** `cleanup("delete")` is called
- **THEN** the system SHALL delete the `workspace/WORKSPACE` directory recursively
- **AND** the system SHALL delete the `workspace/METRICS` directory recursively
- **AND** the system SHALL delete the `workspace/PLANS` directory recursively

#### Scenario: Disable cleanup
- **WHEN** `cleanup("disable")` is called
- **THEN** the system SHALL NOT delete any directories
- **AND** the system SHALL log that data is preserved for re-enable

#### Scenario: Restart cleanup
- **WHEN** `cleanup("restart")` is called
- **THEN** the system SHALL delete the `workspace/WORKSPACE` directory recursively
- **AND** the system SHALL delete the `workspace/METRICS` directory recursively
- **AND** the system SHALL preserve the `workspace/PLANS` directory

#### Scenario: Cleanup failure handling
- **WHEN** `cleanup` encounters a filesystem error
- **THEN** the system SHALL log the error to stderr
- **AND** the system SHALL NOT throw an exception

## MODIFIED Requirements

### Requirement: Execution metrics collection (FR-MON-003)
The system SHALL collect execution metrics and route them through the Blackboard module for multi-backend output.

#### Scenario: Metrics via Blackboard
- **GIVEN** an agent execution completes
- **WHEN** the `agent_end` hook processes the event
- **THEN** the system SHALL construct an `ExecutionMetrics` object
- **AND** the system SHALL call `blackboard.writeMetrics(event.runId, metrics)`
- **AND** the metrics SHALL be written according to the configured `metricsOutput` mode

#### Scenario: Metrics fallback on Blackboard failure
- **GIVEN** `blackboard.writeMetrics` fails
- **WHEN** the `agent_end` hook processes the event
- **THEN** the error SHALL be logged
- **AND** the hook SHALL complete without throwing
