# Replanner Specification

## Purpose

The Replanner module provides dynamic replanning capabilities for the Plan-Task-Build orchestration pipeline. It evaluates Plan health after each agent turn, decides whether to finalize execution or trigger a revise cycle, and applies one of four repair strategies to recover from task failures.

## ADDED Requirements

### Requirement: Health Check (FR-BUILD-003a)

The system SHALL evaluate Plan health state to determine if replanning is required.

#### Scenario: All tasks completed
- **WHEN** `Replanner.check(plan)` is called
- **AND** all tasks have status `done` or `skipped`
- **AND** no tasks have status `failed` or `running`
- **THEN** the system SHALL return `{ needsReroute: false, failedTasks: [] }`
- **AND** the caller SHALL proceed with finalize action

#### Scenario: Failed tasks detected
- **WHEN** `Replanner.check(plan)` is called
- **AND** one or more tasks have status `failed`
- **THEN** the system SHALL return `{ needsReroute: true, failedTasks: <failed tasks>, reason: <summary> }`
- **AND** the reason SHALL include the count of failed tasks and total retry count

#### Scenario: Running tasks present
- **WHEN** `Replanner.check(plan)` is called
- **AND** one or more tasks have status `running`
- **AND** no tasks have status `failed`
- **THEN** the system SHALL return `{ needsReroute: false, failedTasks: [] }`
- **AND** the caller SHALL wait for running tasks to complete

#### Scenario: Health check error recovery
- **WHEN** `Replanner.check(plan)` encounters an unexpected error
- **THEN** the system SHALL catch the error and log it
- **AND** the system SHALL return `{ needsReroute: false, failedTasks: [] }`
- **AND** the caller SHALL proceed with finalize action as a safe fallback

### Requirement: Repair Strategy Selection (FR-BUILD-003b)

The system SHALL select an appropriate repair strategy for failed tasks using LLM-based analysis.

#### Scenario: Retry strategy selection
- **WHEN** `Replanner.replan(plan, failedTasks)` is called
- **AND** the LLM determines the failures are transient (network timeout, API rate limit)
- **THEN** the system SHALL return a `RepairDecision` with `strategy: "retry"`
- **AND** `newTasks` SHALL be empty
- **AND** `reason` SHALL explain why retry is appropriate

#### Scenario: Decompose strategy selection
- **WHEN** `Replanner.replan(plan, failedTasks)` is called
- **AND** the LLM determines the task is too large or ambiguous
- **THEN** the system SHALL return a `RepairDecision` with `strategy: "decompose"`
- **AND** `newTasks` SHALL contain the sub-tasks to replace the failed task
- **AND** each new task SHALL have valid `id`, `description`, `skills`, and `dependencies` fields

#### Scenario: Skip strategy selection
- **WHEN** `Replanner.replan(plan, failedTasks)` is called
- **AND** the LLM determines the task is non-blocking and optional
- **THEN** the system SHALL return a `RepairDecision` with `strategy: "skip"`
- **AND** `newTasks` SHALL be empty
- **AND** `reason` SHALL explain why the task can be safely skipped

#### Scenario: Escalate strategy selection
- **WHEN** `Replanner.replan(plan, failedTasks)` is called
- **AND** the LLM determines the task requires human judgment or elevated permissions
- **THEN** the system SHALL return a `RepairDecision` with `strategy: "escalate"`
- **AND** `newTasks` SHALL be empty
- **AND** `reason` SHALL explain why human intervention is needed

#### Scenario: LLM failure fallback
- **WHEN** `Replanner.replan(plan, failedTasks)` is called
- **AND** the LLM call fails or returns invalid JSON
- **THEN** the system SHALL catch the error and log it
- **AND** the system SHALL default to `strategy: "retry"`
- **AND** `reason` SHALL indicate the fallback was due to LLM failure

#### Scenario: Invalid strategy fallback
- **WHEN** `Replanner.replan(plan, failedTasks)` returns a decision
- **AND** the strategy is not one of `"retry"`, `"decompose"`, `"skip"`, `"escalate"`
- **THEN** the system SHALL treat the strategy as `"retry"`
- **AND** the system SHALL log a warning about the invalid strategy

### Requirement: Retry Repair (FR-BUILD-003c)

The system SHALL apply the retry repair strategy by resetting failed tasks to pending state.

#### Scenario: Retry application
- **WHEN** `Replanner.applyRepair(plan, failedTasks, { strategy: "retry" })` is called
- **THEN** for each failed task, the system SHALL:
  1. Set `status` to `"pending"`
  2. Increment `_retryCount` by 1
- **AND** the Plan `updatedAt` timestamp SHALL be updated

#### Scenario: Retry count tracking
- **WHEN** a task has been retried 2 times and fails again
- **AND** the retry strategy is applied a 3rd time
- **THEN** the task's `_retryCount` SHALL be 3
- **AND** the `Replanner.check()` reason SHALL report total retry count across all failed tasks

### Requirement: Decompose Repair (FR-BUILD-003d)

The system SHALL apply the decompose repair strategy by replacing failed tasks with smaller sub-tasks.

#### Scenario: Decompose application
- **WHEN** `Replanner.applyRepair(plan, failedTasks, { strategy: "decompose", newTasks })` is called
- **THEN** the system SHALL:
  1. Remove all failed tasks from the Plan
  2. Append the new sub-tasks to the Plan task list
  3. Set each new sub-task `status` to `"pending"`
  4. Ensure each new sub-task has `dependencies` defaulting to `[]`
- **AND** the Plan `updatedAt` timestamp SHALL be updated

#### Scenario: Decompose with empty newTasks
- **WHEN** the decompose strategy is selected
- **AND** `newTasks` is empty or undefined
- **THEN** the system SHALL remove the failed tasks
- **AND** no new tasks SHALL be added
- **AND** the system SHALL log a warning

### Requirement: Skip Repair (FR-BUILD-003e)

The system SHALL apply the skip repair strategy by marking failed tasks as skipped.

#### Scenario: Skip application
- **WHEN** `Replanner.applyRepair(plan, failedTasks, { strategy: "skip" })` is called
- **THEN** for each failed task, the system SHALL:
  1. Set `status` to `"skipped"`
  2. Set `result` to `"[skipped by replanner]"`
- **AND** the Plan `updatedAt` timestamp SHALL be updated

### Requirement: Escalate Repair (FR-BUILD-003f)

The system SHALL apply the escalate repair strategy by marking failed tasks as requiring human approval.

#### Scenario: Escalate application
- **WHEN** `Replanner.applyRepair(plan, failedTasks, { strategy: "escalate" })` is called
- **THEN** for each failed task, the system SHALL:
  1. Set `status` to `"pending"`
  2. Set `requiresApproval` to `true`
- **AND** the Plan `updatedAt` timestamp SHALL be updated
- **AND** the task SHALL be subject to the existing `before_tool_call` approval flow

### Requirement: before_agent_finalize Hook Integration (FR-BUILD-003g)

The system SHALL integrate the Replanner into the `before_agent_finalize` hook to drive revise/finalize decisions.

#### Scenario: Finalize decision
- **WHEN** the `before_agent_finalize` hook fires
- **AND** `Replanner.check(plan)` returns `needsReroute: false`
- **THEN** the system SHALL set `plan.status` to `"done"`
- **AND** the system SHALL persist the updated Plan to Session Extension
- **AND** the hook SHALL return `{ action: "finalize" }`

#### Scenario: Revise decision
- **WHEN** the `before_agent_finalize` hook fires
- **AND** `Replanner.check(plan)` returns `needsReroute: true`
- **THEN** the system SHALL call `Replanner.replan(plan, failedTasks)`
- **AND** the system SHALL call `Replanner.applyRepair(plan, failedTasks, decision)`
- **AND** the system SHALL persist the updated Plan to Session Extension
- **AND** the hook SHALL return `{ action: "revise", reason: <health reason> }`

#### Scenario: Hook error recovery
- **WHEN** the `before_agent_finalize` hook encounters an error
- **THEN** the system SHALL catch the error and log it
- **AND** the system SHALL return `{ action: "finalize" }` as a safe fallback
- **AND** the error SHALL NOT propagate to the OpenClaw runtime
