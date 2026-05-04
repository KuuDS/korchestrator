## ADDED Requirements

### Requirement: Task Router Public API

The system SHALL expose a `TaskRouter` class with a public API for task scheduling and routing.

#### Scenario: Router initialization
- GIVEN the plugin is starting via `gateway_start` hook
- WHEN the Task Router is instantiated
- THEN the system SHALL accept configuration for `maxConcurrency` and `agentPool`
- AND the router SHALL initialize with the configured agent roles

#### Scenario: spawnTask dispatch
- GIVEN a Plan with ready tasks exists
- WHEN `spawnTask(plan, task)` is called
- THEN the system SHALL:
  1. Verify the task is in the ready set via `getReadyTasks(plan)`
  2. Select the best agent via `routeBySkill(task)`
  3. Mark the task status as `running`
  4. Record the `startedAt` timestamp
  5. Return the selected `AgentRole`

#### Scenario: trackLifecycle event handling
- GIVEN a lifecycle event is received
- WHEN `trackLifecycle(event)` is called with a `spawned` event
- THEN the system SHALL establish the `runId` → `taskId` mapping in `taskRunMap`
- AND persist the updated Plan state

#### Scenario: trackLifecycle completion
- GIVEN a lifecycle event is received
- WHEN `trackLifecycle(event)` is called with an `ended` event
- THEN the system SHALL:
  1. Update the task status to `done` or `failed` based on execution result
  2. Record the `completedAt` timestamp
  3. Store the task result
  4. Remove the `runId` → `taskId` mapping from `taskRunMap`
  5. Persist the updated Plan state

### Requirement: Skill-Based Routing API

The system SHALL route tasks to the most appropriate Subagent via the `routeBySkill()` method.

#### Scenario: Exact skill match
- GIVEN a task requiring skills `["search", "browser"]`
- WHEN `routeBySkill(task)` is called
- THEN the system SHALL select an agent whose skill set is a superset of the task's skills
- AND if multiple agents match, the system SHALL prefer the most specialized agent (fewest total skills)

#### Scenario: Partial skill match
- GIVEN a task requiring skills not fully covered by any single agent
- WHEN `routeBySkill(task)` is called
- THEN the system SHALL select the agent with the maximum skill intersection
- AND the selection SHALL prioritize the highest overlap count

#### Scenario: No skill match fallback
- GIVEN a task requiring skills with zero overlap with any configured agent
- WHEN `routeBySkill(task)` is called
- THEN the system SHALL fallback to the default `coder` agent
- AND the fallback SHALL be logged for observability

### Requirement: Concurrency Control API

The system SHALL limit concurrent Subagent execution through the `checkConcurrency()` method.

#### Scenario: Concurrency limit check
- GIVEN the configured `maxConcurrency` is 3
- AND 3 tasks are currently in `running` status
- WHEN `checkConcurrency(plan)` is called
- THEN the system SHALL return `{ block: true, reason: "并发数限制" }`

#### Scenario: Concurrency available
- GIVEN the configured `maxConcurrency` is 3
- AND 2 tasks are currently in `running` status
- WHEN `checkConcurrency(plan)` is called
- THEN the system SHALL return `{ block: false }`

#### Scenario: Queue progression
- GIVEN tasks are queued due to concurrency limits
- WHEN a running task completes and its status changes to `done` or `failed`
- THEN the system SHALL allow the next ready task to proceed
- AND the queued task SHALL be unblocked in FIFO order

### Requirement: Dependency Resolution API

The system SHALL resolve task dependencies before routing via the `getReadyTasks()` method.

#### Scenario: Dependency-gated execution
- GIVEN a task has unmet dependencies
- WHEN `getReadyTasks(plan)` is called
- THEN the system SHALL exclude the task from the ready set
- AND the task SHALL remain in `pending` status until all dependencies are satisfied

#### Scenario: Ready task selection
- GIVEN a Plan where some tasks have all dependencies completed
- WHEN `getReadyTasks(plan)` is called
- THEN the system SHALL return only tasks with status `pending`
- AND all task dependencies SHALL have status `done` or `skipped`

### Requirement: Lifecycle Tracking API

The system SHALL track the full lifecycle of each task execution through the `trackLifecycle()` method.

#### Scenario: Task start tracking
- GIVEN a task is transitioning from `pending` to `running`
- WHEN `trackLifecycle({ type: "spawned", runId, taskId })` is called
- THEN the system SHALL:
  1. Establish the `runId` → `taskId` mapping in `taskRunMap`
  2. Update the task status to `running`
  3. Record the `startedAt` timestamp
  4. Persist the updated Plan state to Session Extension

#### Scenario: Task completion tracking
- GIVEN a task has finished execution
- WHEN `trackLifecycle({ type: "ended", runId, result, error })` is called
- THEN the system SHALL:
  1. Update the task status to `done` or `failed` based on execution result
  2. Record the `completedAt` timestamp
  3. Store the task result
  4. Remove the `runId` → `taskId` mapping from `taskRunMap`
  5. Persist the updated Plan state

#### Scenario: Task status transitions
- GIVEN a task in any valid status
- WHEN a lifecycle event triggers a status change
- THEN the task status SHALL transition according to the valid paths:
  - `pending` → `running` (when execution starts)
  - `running` → `done` (on success)
  - `running` → `failed` (on error)
  - `pending` → `skipped` (via Replanner decision)
  - `failed` → `pending` (via retry strategy)
- AND invalid transitions SHALL be rejected and logged

## MODIFIED Requirements

### Requirement: Standard Agent Roles (FR-TASK-002)

The system SHALL define four standard agent roles with predefined skill sets.

#### Scenario: Role initialization
- GIVEN the plugin is starting up via `gateway_start` hook
- WHEN the Task Router initializes its agent pool
- THEN the system SHALL register the following standard roles:
  - `researcher`: skills `search`, `browser`; model `gpt-4o-mini`
  - `coder`: skills `shell`, `code`, `file`; model `gpt-4o`
  - `browser`: skills `browser`; model `gpt-4o-mini`
  - `reviewer`: skills `file`, `code`; model `gpt-4o-mini`

#### Scenario: Custom role override
- GIVEN a plugin configuration with custom `agentRoles`
- WHEN the Task Router initializes
- THEN the system SHALL use the configured roles instead of defaults
- AND the configuration SHALL be validated for completeness

### Requirement: Concurrency Control (FR-TASK-003)

The system SHALL limit concurrent Subagent execution to prevent resource exhaustion.

#### Scenario: Concurrency limit enforcement
- GIVEN the configured `maxConcurrency` is 3
- AND 3 tasks are currently in `running` status
- WHEN a 4th task becomes ready for execution
- THEN the `subagent_spawning` hook SHALL block the new Subagent creation
- AND the system SHALL return `{ block: true, reason: "并发数限制" }`

#### Scenario: Queue progression
- GIVEN tasks are queued due to concurrency limits
- WHEN a running task completes and its status changes to `done` or `failed`
- THEN the system SHALL allow the next ready task to proceed
- AND the queued task SHALL be unblocked in FIFO order

#### Scenario: Dependency-gated execution
- GIVEN a task has unmet dependencies
- WHEN the Task Router evaluates ready tasks
- THEN the system SHALL exclude the task from the ready set
- AND the task SHALL remain in `pending` status until all dependencies are satisfied

### Requirement: Lifecycle Tracking (FR-TASK-004)

The system SHALL track the full lifecycle of each task execution.

#### Scenario: Task start tracking
- GIVEN a task is transitioning from `pending` to `running`
- WHEN the `subagent_spawned` hook fires
- THEN the system SHALL:
  1. Establish the `runId` → `taskId` mapping in `taskRunMap`
  2. Update the task status to `running`
  3. Record the `startedAt` timestamp
  4. Persist the updated Plan state to Session Extension

#### Scenario: Task completion tracking
- GIVEN a task has finished execution
- WHEN the `subagent_ended` hook fires
- THEN the system SHALL:
  1. Update the task status to `done` or `failed` based on execution result
  2. Record the `completedAt` timestamp
  3. Store the task result
  4. Remove the `runId` → `taskId` mapping from `taskRunMap`
  5. Persist the updated Plan state

#### Scenario: Task status transitions
- GIVEN a task in any valid status
- WHEN a lifecycle event occurs
- THEN the task status SHALL transition according to the valid paths:
  - `pending` → `running` (when execution starts)
  - `running` → `done` (on success)
  - `running` → `failed` (on error)
  - `pending` → `skipped` (via Replanner decision)
  - `failed` → `pending` (via retry strategy)
- AND invalid transitions SHALL be rejected and logged
