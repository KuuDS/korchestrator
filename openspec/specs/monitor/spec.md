# Monitoring Specification

## Purpose

The Monitoring module provides observability into Plan execution state, enabling both real-time progress tracking and historical audit of orchestration activities.

## Requirements

### Requirement: Execution Progress (FR-MON-001)

The system SHALL expose Plan execution progress through Session Extensions.

#### Scenario: Progress visibility
- GIVEN an active Plan exists in the current session
- WHEN an external system queries session state
- THEN the Session Extension SHALL include:
  - Plan ID and current status
  - Total task count
  - Count of tasks in each status (`done`, `failed`, `running`, `pending`, `skipped`)
  - Current `taskRunMap` associations

#### Scenario: Control UI rendering
- GIVEN a Control UI is connected to the session
- WHEN the UI requests plugin extension data
- THEN the system SHALL provide structured progress data
- AND the data SHALL be sufficient to render a visual progress indicator

### Requirement: Heartbeat Reporting (FR-MON-002)

The system SHALL contribute Plan execution summaries via heartbeat prompts.

#### Scenario: Active execution heartbeat
- GIVEN a Plan is in `executing` status
- WHEN the `heartbeat_prompt_contribution` hook fires
- THEN the system SHALL return a contribution containing:
  - Total task count
  - Completed task count
  - Failed task count
  - Running task count
  - Pending task count

#### Scenario: Idle heartbeat
- GIVEN no active Plan exists in the session
- WHEN the `heartbeat_prompt_contribution` hook fires
- THEN the system SHALL return an empty contribution
- AND the hook SHALL complete without error

### Requirement: Event Logging (FR-MON-003)

The system SHALL log key orchestration events for debugging and auditing.

#### Scenario: Plan lifecycle events
- GIVEN a Plan state transition occurs
- WHEN the transition happens
- THEN the system SHALL log:
  - Plan generation (with task count)
  - Task routing decisions (task ID → agent ID)
  - Subagent spawn events (run ID, task ID, agent ID)
  - Subagent end events (run ID, duration, success/failure)
  - Replanner decisions (strategy, affected tasks)

#### Scenario: Structured metrics
- GIVEN an agent execution completes
- WHEN the `agent_end` hook processes the event
- THEN the system SHALL collect:
  - Execution duration in milliseconds
  - Success/failure boolean
  - Timestamp
  - Run ID
- AND the metrics SHALL be written to the configured output destination

## Hooks

| Hook | Priority | Purpose |
|------|----------|---------|
| `heartbeat_prompt_contribution` | 40 | Execution progress summary for heartbeat |
| `agent_end` | — | Execution metrics collection |

## Data Structures

```typescript
interface Progress {
  total: number;
  done: number;
  failed: number;
  pending: number;
  running: number;
}

interface ExecutionMetrics {
  runId: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}
```
