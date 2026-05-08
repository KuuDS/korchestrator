# Planner Specification

## Purpose

The Planner module is responsible for analyzing user requests, classifying their complexity, and decomposing complex requests into structured, executable task plans. It serves as the entry point for the Plan-Task-Build orchestration pipeline.

## Requirements

### Requirement: Complexity Classification (FR-PLAN-001)

The system SHALL classify incoming user requests as either `simple` or `complex` using a layered strategy.

#### Scenario: Rule cache hit (L1)
- GIVEN a user request matching a configured classification rule pattern
- WHEN the plugin processes the request via `before_agent_reply` hook
- THEN the system SHALL classify the request as `simple` without invoking an LLM
- AND the request SHALL proceed through the normal ReAct flow without intervention

#### Scenario: LLM classification (L2)
- GIVEN a user request that does not match any classification rule
- WHEN the plugin processes the request via `before_agent_reply` hook
- THEN the system SHALL invoke the configured planner LLM to classify the request
- AND the classification SHALL return either `simple` or `complex`

#### Scenario: Classification failure fallback (L3)
- GIVEN a user request requiring classification
- WHEN the LLM classification call fails or times out
- THEN the system SHALL fallback to classifying the request as `simple`
- AND the request SHALL proceed through the normal ReAct flow
- AND the failure SHALL be logged for observability

#### Scenario: Skip classification mode
- GIVEN the plugin configuration has `skipClassification: true`
- WHEN any user request is received
- THEN the system SHALL bypass all classification layers
- AND the request SHALL be treated as `complex` unconditionally

### Requirement: Task Decomposition (FR-PLAN-002)

The system SHALL decompose complex requests into a directed acyclic graph (DAG) of structured tasks.

#### Scenario: Valid plan generation
- GIVEN a `complex` classified user request
- WHEN the Planner creates a plan via `createPlan()`
- THEN the system SHALL generate a structured Task List with:
  - Unique task IDs in `task_NNN` format
  - Task descriptions with minimum 1 character
  - Skills restricted to the allowed set: `search`, `browser`, `shell`, `code`, `file`
  - Dependency arrays referencing existing task IDs
  - `requiresApproval` flag defaulting to `false`
- AND the dependency graph SHALL be validated as acyclic (DAG)
- AND the total task count SHALL not exceed the configured `maxTasks` limit

#### Scenario: High-risk operation detection
- GIVEN a complex request containing high-risk operations (file deletion, system command execution)
- WHEN the Planner creates a plan
- THEN the system SHALL automatically set `requiresApproval: true` on affected tasks

#### Scenario: Invalid LLM response handling
- GIVEN a complex request
- WHEN the LLM returns invalid JSON or fails schema validation
- THEN the system SHALL fallback to creating a single-task plan
- AND the single task SHALL inherit the original request as its description
- AND the task SHALL be assigned the `code` skill by default

#### Scenario: Plan serialization
- GIVEN an existing Plan object
- WHEN `toMarkdown()` is called
- THEN the system SHALL produce a Markdown representation with:
  - Plan ID as a heading
  - Each task as a checklist item with status indicator
  - Dependency references
  - Approval warnings where applicable

### Requirement: State Persistence (FR-PLAN-003)

The system SHALL persist Plan state across conversation turns using Session Extensions.

#### Scenario: Plan state creation via official API
- GIVEN a newly created Plan
- WHEN the `before_agent_reply` hook completes plan generation
- THEN the system SHALL register a Session Extension named `"plan_state"` via `api.registerSessionExtension`
- AND the extension SHALL provide a `serializer` that converts the Plan object to a JSON-compatible format
- AND the extension SHALL provide a `deserializer` that reconstructs the Plan object from the stored format
- AND OpenClaw SHALL handle the actual persistence and retrieval across turns

#### Scenario: Task-run mapping persistence
- GIVEN an active Plan with subagent executions
- WHEN a subagent is spawned for a task
- THEN the system SHALL maintain `taskRunMap: Record<string, string>` within the Plan state
- AND the mapping SHALL store `runId` → `taskId` associations
- AND the updated Plan state SHALL be persisted through the Session Extension mechanism

#### Scenario: Session cleanup differentiation
- GIVEN a Plan state stored in Session Extension
- WHEN the session is cleaned up with reason `reset` or `restart`
- THEN the system SHALL preserve the Plan state for continuity
- WHEN the session is cleaned up with reason `delete` or `disable`
- THEN the system SHALL remove the Plan state and associated Blackboard artifacts

### Requirement: Plugin Entry Point Contract (FR-PLAN-005)

The system SHALL conform to the OpenClaw Plugin SDK entry point contract.

#### Scenario: Official SDK entry point
- GIVEN the plugin is loaded by OpenClaw
- WHEN OpenClaw imports the plugin module
- THEN the default export SHALL be an object returned by `definePluginEntry`
- AND the object SHALL contain `id`, `name`, and `register(api)` fields
- AND the `register(api)` function SHALL be called by OpenClaw during plugin initialization

#### Scenario: Conversation access declaration
- GIVEN the plugin needs to intercept conversation lifecycle hooks
- WHEN the plugin entry is registered
- THEN the system SHALL declare `allowConversationAccess: true`
- AND OpenClaw SHALL permit the plugin to register `before_agent_reply`, `before_prompt_build`, `before_agent_finalize`, and `agent_end` hooks

### Requirement: Hook Return Value Pattern (FR-PLAN-006)

The system SHALL use return-value pattern for decision-capable hooks.

#### Scenario: Prompt build injection returns value
- GIVEN the `before_prompt_build` hook handler is invoked
- WHEN a stored Plan exists in session
- THEN the handler SHALL return `{ prependContext: markdown }`
- AND the system SHALL NOT mutate the input `event` object directly

#### Scenario: Finalize decision returns value
- GIVEN the `before_agent_finalize` hook handler is invoked
- WHEN the Replanner determines the plan needs revision
- THEN the handler SHALL return `{ action: "revise", reason: decision.reason }`
- WHEN all tasks are completed
- THEN the handler SHALL return `{ action: "finalize" }`

#### Scenario: Spawning concurrency check returns value
- GIVEN the `subagent_spawning` hook handler is invoked
- WHEN the concurrency limit is reached
- THEN the handler SHALL return `{ block: true, reason: "..." }`
- WHEN concurrency allows spawning
- THEN the handler SHALL return `{ block: false }` or `undefined`

### Requirement: Cross-Turn Injection (FR-PLAN-004)

The system SHALL support injecting Plan context across conversation turns.

#### Scenario: Direct execution injection (Scheme A)
- GIVEN a Plan has been generated in the current turn
- WHEN the `before_prompt_build` hook fires
- THEN the system SHALL inject the Plan context directly into the current turn
- AND the injection SHALL include:
  - The full Plan Markdown representation
  - A list of ready tasks with their skill requirements
  - Instructions to dispatch and execute tasks
- AND the system SHALL NOT return a `syntheticReply` to avoid "fake start" experience

#### Scenario: User confirmation injection (Scheme B)
- GIVEN a Plan requires user confirmation before execution
- WHEN the `before_agent_reply` hook returns a `syntheticReply`
- THEN the system SHALL prompt the user to confirm continuation
- AND upon user confirmation
- THEN the system SHALL enqueue the Plan context via `enqueueNextTurnInjection()`
- AND the injection SHALL use an idempotency key to prevent duplicates
- AND expired injections SHALL be automatically discarded

## Data Structures

The following structures are referenced by this specification:

```typescript
interface Plan {
  id: string;
  status: "planning" | "executing" | "reviewing" | "done";
  tasks: Task[];
  taskRunMap: Record<string, string>;
  createdAt: number;
  updatedAt: number;
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
| `plannerModel` | string | `gpt-4o-mini` | LLM model used for classification and plan generation |
| `maxTasks` | number | 10 | Maximum number of tasks per plan |
| `skipClassification` | boolean | false | When true, bypass classification and treat all requests as complex |
| `classificationRules` | Array<{pattern: string, result: string}> | See PRD §5.3 | Regex patterns for L1 rule-based classification |

## Hooks

| Hook | Priority | Purpose |
|------|----------|---------|
| `before_agent_reply` | 80 | Complexity detection + Plan generation |
| `before_prompt_build` | 70 | Plan context injection into prompt |

## Error Handling

All LLM calls within the Planner module SHALL be wrapped in try/catch blocks. Failures SHALL:
1. Log the error with context
2. Return a safe fallback value (`simple` for classification, single-task plan for decomposition)
3. Never propagate uncaught errors to the OpenClaw runtime
