## ADDED Requirements

### Requirement: Complexity Classification
The system SHALL classify incoming user requests as either `simple` or `complex` using a layered strategy with L1 rule cache, L2 LLM classification, and L3 fallback.

#### Scenario: Rule cache hit (L1)
- **WHEN** a user request matches a configured classification rule pattern
- **THEN** the system SHALL classify the request as `simple` without invoking an LLM
- **AND** the request SHALL proceed through the normal ReAct flow without intervention

#### Scenario: LLM classification (L2)
- **WHEN** a user request does not match any classification rule
- **THEN** the system SHALL invoke the configured planner LLM to classify the request
- **AND** the classification SHALL return either `simple` or `complex`

#### Scenario: Classification failure fallback (L3)
- **WHEN** the LLM classification call fails or times out
- **THEN** the system SHALL fallback to classifying the request as `simple`
- **AND** the request SHALL proceed through the normal ReAct flow
- **AND** the failure SHALL be logged for observability

#### Scenario: Skip classification mode
- **WHEN** the plugin configuration has `skipClassification: true`
- **THEN** the system SHALL bypass all classification layers
- **AND** the request SHALL be treated as `complex` unconditionally

### Requirement: Task Decomposition
The system SHALL decompose complex requests into a directed acyclic graph (DAG) of structured tasks with validated schema and dependency relationships.

#### Scenario: Valid plan generation
- **WHEN** the Planner creates a plan for a `complex` classified request via `createPlan()`
- **THEN** the system SHALL generate a structured Task List with:
  - Unique task IDs in `task_NNN` format
  - Task descriptions with minimum 1 character
  - Skills restricted to the allowed set: `search`, `browser`, `shell`, `code`, `file`
  - Dependency arrays referencing existing task IDs
  - `requiresApproval` flag defaulting to `false`
- **AND** the dependency graph SHALL be validated as acyclic (DAG)
- **AND** the total task count SHALL not exceed the configured `maxTasks` limit

#### Scenario: High-risk operation detection
- **WHEN** a complex request contains high-risk operations (file deletion, system command execution)
- **THEN** the system SHALL automatically set `requiresApproval: true` on affected tasks

#### Scenario: Invalid LLM response handling
- **WHEN** the LLM returns invalid JSON or fails schema validation during plan creation
- **THEN** the system SHALL fallback to creating a single-task plan
- **AND** the single task SHALL inherit the original request as its description
- **AND** the task SHALL be assigned the `code` skill by default

#### Scenario: Plan serialization
- **WHEN** `toMarkdown()` is called on an existing Plan object
- **THEN** the system SHALL produce a Markdown representation with:
  - Plan ID as a heading
  - Each task as a checklist item with status indicator
  - Dependency references
  - Approval warnings where applicable

### Requirement: State Persistence
The system SHALL persist Plan state across conversation turns using Session Extensions with proper lifecycle management.

#### Scenario: Plan state creation
- **WHEN** the `before_agent_reply` hook completes plan generation
- **THEN** the system SHALL persist the Plan state via `registerSessionExtension("plan_state")`
- **AND** the state SHALL include the complete Plan object with all tasks and metadata

#### Scenario: Task-run mapping persistence
- **WHEN** a subagent is spawned for a task
- **THEN** the system SHALL maintain `taskRunMap: Record<string, string>`
- **AND** the mapping SHALL store `runId` → `taskId` associations

#### Scenario: Session cleanup differentiation
- **WHEN** the session is cleaned up with reason `reset` or `restart`
- **THEN** the system SHALL preserve the Plan state for continuity
- **WHEN** the session is cleaned up with reason `delete` or `disable`
- **THEN** the system SHALL remove the Plan state and associated Blackboard artifacts

### Requirement: Cross-Turn Injection
The system SHALL support injecting Plan context across conversation turns with idempotency and expiration handling.

#### Scenario: Direct execution injection (Scheme A)
- **WHEN** a Plan has been generated in the current turn
- **THEN** the system SHALL inject the Plan context directly into the current turn via `before_prompt_build`
- **AND** the injection SHALL include:
  - The full Plan Markdown representation
  - A list of ready tasks with their skill requirements
  - Instructions to dispatch and execute tasks
- **AND** the system SHALL NOT return a `syntheticReply` to avoid "fake start" experience

#### Scenario: User confirmation injection (Scheme B)
- **WHEN** a Plan requires user confirmation before execution
- **THEN** the system SHALL return a `syntheticReply` prompting the user to confirm continuation
- **AND** upon user confirmation
- **THEN** the system SHALL enqueue the Plan context via `enqueueNextTurnInjection()`
- **AND** the injection SHALL use an idempotency key to prevent duplicates
- **AND** expired injections SHALL be automatically discarded

### Requirement: DAG Validation
The system SHALL validate task dependency graphs to ensure they form valid directed acyclic graphs (DAG).

#### Scenario: Valid DAG passes validation
- **WHEN** `validateDAG()` is called with a set of tasks having no circular dependencies
- **THEN** the validation SHALL complete without throwing an error

#### Scenario: Circular dependency detection
- **WHEN** `validateDAG()` is called with tasks containing a circular dependency
- **THEN** the validation SHALL throw an error with message indicating the circular dependency

#### Scenario: Missing dependency detection
- **WHEN** `validateDAG()` is called with a task referencing a non-existent dependency task ID
- **THEN** the validation SHALL throw an error indicating the missing dependency

#### Scenario: Topological sort
- **WHEN** `topologicalSort()` is called with a valid DAG
- **THEN** the system SHALL return an array of task IDs in dependency-respecting execution order
