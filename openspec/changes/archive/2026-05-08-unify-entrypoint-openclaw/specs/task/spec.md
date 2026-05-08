## MODIFIED Requirements

### Requirement: Lifecycle Tracking (FR-TASK-004)

The system SHALL track the full lifecycle of each task execution and persist state through the official Session Extension mechanism.

#### Scenario: Task start tracking with official persistence
- **GIVEN** a task is transitioning from `pending` to `running`
- **WHEN** the `subagent_spawned` hook fires
- **THEN** the system SHALL:
  1. Establish the `runId` → `taskId` mapping in `taskRunMap`
  2. Update the task status to `running`
  3. Record the `startedAt` timestamp
  4. Persist the updated Plan state through the Session Extension registered as `"plan_state"`

#### Scenario: Task completion tracking with official persistence
- **GIVEN** a task has finished execution
- **WHEN** the `subagent_ended` hook fires
- **THEN** the system SHALL:
  1. Update the task status to `done` or `failed` based on execution result
  2. Record the `completedAt` timestamp
  3. Store the task result
  4. Remove the `runId` → `taskId` mapping from `taskRunMap`
  5. Persist the updated Plan state through the Session Extension registered as `"plan_state"`

#### Scenario: Task status transitions remain valid
- **GIVEN** a task in any valid status
- **WHEN** a lifecycle event occurs
- **THEN** the task status SHALL transition according to the valid paths:
  - `pending` → `running` (when execution starts)
  - `running` → `done` (on success)
  - `running` → `failed` (on error)
  - `pending` → `skipped` (via Replanner decision)
  - `failed` → `pending` (via retry strategy)
- **AND** invalid transitions SHALL be rejected and logged
