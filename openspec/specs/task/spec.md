# Task Router Specification

## Purpose

The Task Router module manages the scheduling and routing of tasks from a Plan to appropriate Subagent roles based on skill requirements. It handles concurrency control, dependency resolution, and agent selection.

## Requirements

### Requirement: Skill-Based Routing (FR-TASK-001)

The system SHALL route tasks to the most appropriate Subagent based on required skills.

#### Scenario: Exact skill match
- GIVEN a task requiring skills `["search", "browser"]`
- WHEN the Task Router evaluates routing options
- THEN the system SHALL select an agent whose skill set is a superset of the task's skills
- AND if multiple agents match, the system SHALL prefer the most specialized agent (fewest total skills)

#### Scenario: Partial skill match
- GIVEN a task requiring skills not fully covered by any single agent
- WHEN the Task Router evaluates routing options
- THEN the system SHALL select the agent with the maximum skill intersection
- AND the selection SHALL prioritize the highest overlap count

#### Scenario: No skill match fallback
- GIVEN a task requiring skills with zero overlap with any configured agent
- WHEN the Task Router evaluates routing options
- THEN the system SHALL fallback to the default `coder` agent
- AND the fallback SHALL be logged for observability

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

## Data Structures

```typescript
interface AgentRole {
  agentId: string;
  name: string;
  skills: string[];
  model: string;
}

interface Task {
  id: string;
  description: string;
  skills: string[];
  dependencies: string[];
  status: "pending" | "running" | "done" | "failed" | "skipped";
  requiresApproval: boolean;
  assignedAgent?: string;
  result?: string;
  startedAt?: number;
  completedAt?: number;
  _retryCount?: number;
}
```

## Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxConcurrency` | number | 3 | Maximum number of concurrently running subagents |
| `agentRoles` | AgentRole[] | Standard 4 roles | Custom agent role definitions |

## Hooks

| Hook | Priority | Purpose |
|------|----------|---------|
| `subagent_delivery_target` | 70 | Task → Subagent routing by skill |
| `subagent_spawning` | 70 | Concurrency control + status marking |
| `subagent_spawned` | 50 | Establish runId→taskId mapping |
| `subagent_ended` | 50 | Cleanup mapping + result collection |
