## ADDED Requirements

### Requirement: DAG Validation
The system SHALL validate that a collection of tasks forms a valid directed acyclic graph.

#### Scenario: Valid DAG
- **WHEN** `validateDAG()` is called with tasks having no cyclic dependencies
- **THEN** the system SHALL return `true`

#### Scenario: Cyclic dependencies
- **WHEN** `validateDAG()` is called with tasks forming a cycle (e.g., A depends on B, B depends on A)
- **THEN** the system SHALL return `false`

#### Scenario: Self-loop detection
- **WHEN** `validateDAG()` is called with a task that lists itself in its `dependencies` array
- **THEN** the system SHALL return `false`

#### Scenario: Empty graph
- **WHEN** `validateDAG()` is called with an empty task array
- **THEN** the system SHALL return `true`

#### Scenario: Disconnected components
- **WHEN** `validateDAG()` is called with multiple independent task groups with no inter-group dependencies
- **THEN** the system SHALL return `true` if each component is acyclic

### Requirement: Cycle Detection
The system SHALL detect and report all cycles in a task dependency graph.

#### Scenario: Single cycle detection
- **WHEN** `detectCycles()` is called with tasks forming a single cycle
- **THEN** the system SHALL return a result with `hasCycle: true`
- **AND** the system SHALL report the exact cycle path as an ordered array of task IDs

#### Scenario: Multiple cycle detection
- **WHEN** `detectCycles()` is called with tasks containing multiple independent cycles
- **THEN** the system SHALL detect and report all cycles

#### Scenario: Self-loop reporting
- **WHEN** `detectCycles()` is called with a task containing a self-loop
- **THEN** the system SHALL report the cycle as a single-element array containing the task ID

#### Scenario: No cycles
- **WHEN** `detectCycles()` is called with an acyclic graph
- **THEN** the system SHALL return a result with `hasCycle: false`
- **AND** the system SHALL return an empty cycles array

### Requirement: Topological Sorting
The system SHALL produce a valid topological ordering of tasks based on dependency constraints.

#### Scenario: Standard sort
- **WHEN** `topologicalSort()` is called with a valid DAG
- **THEN** the system SHALL return an array of task IDs where every task appears after all of its dependencies

#### Scenario: Empty graph sort
- **WHEN** `topologicalSort()` is called with an empty task array
- **THEN** the system SHALL return an empty array

#### Scenario: Cyclic graph rejection
- **WHEN** `topologicalSort()` is called with a cyclic graph
- **THEN** the system SHALL throw a `DAGCycleError` with a descriptive message

#### Scenario: Disconnected components sort
- **WHEN** `topologicalSort()` is called with a valid DAG containing disconnected components
- **THEN** the system SHALL return a valid topological ordering covering all tasks

### Requirement: Ready Task Computation
The system SHALL compute the set of tasks whose dependencies are fully satisfied and ready for execution.

#### Scenario: All dependencies satisfied
- **WHEN** `getReadyTasks()` is called with tasks where all dependencies have `status` of `done` or `skipped`
- **THEN** the system SHALL include those tasks in the returned array

#### Scenario: Unsatisfied dependencies
- **WHEN** `getReadyTasks()` is called with tasks having dependencies with `status` of `pending` or `running`
- **THEN** the system SHALL exclude those tasks from the returned array

#### Scenario: No dependencies
- **WHEN** `getReadyTasks()` is called with tasks having an empty `dependencies` array
- **THEN** the system SHALL include those tasks in the returned array

#### Scenario: Empty graph
- **WHEN** `getReadyTasks()` is called with an empty task array
- **THEN** the system SHALL return an empty array

#### Scenario: Failed dependency handling
- **WHEN** `getReadyTasks()` is called with tasks having a dependency with `status` of `failed`
- **THEN** the system SHALL exclude those tasks from the returned array
