## ADDED Requirements

### Requirement: Graph Construction
The system SHALL construct an internal adjacency list representation from an array of Task objects.

#### Scenario: Standard task array
- **WHEN** the DAG utility processes an array of Task objects
- **THEN** the system SHALL build an adjacency list where each node points to its dependents
- **AND** the system SHALL compute in-degree counts for each task

#### Scenario: Missing dependency references
- **WHEN** a task references a dependency ID that does not exist in the task array
- **THEN** the system SHALL treat the missing dependency as a dangling edge
- **AND** the system SHALL include the task in validation and sorting as if the dependency is unresolved

### Requirement: Kahn's Algorithm Implementation
The system SHALL use Kahn's algorithm for topological sorting and cycle detection.

#### Scenario: Algorithm correctness
- **WHEN** Kahn's algorithm processes a valid DAG
- **THEN** the system SHALL produce a topological ordering in O(V + E) time complexity
- **AND** the system SHALL detect cycles by comparing output length to input node count

#### Scenario: Deterministic ordering
- **WHEN** Kahn's algorithm processes tasks with the same in-degree
- **THEN** the system SHALL produce a deterministic ordering based on input array order

### Requirement: Error Types
The system SHALL define typed errors for DAG operation failures.

#### Scenario: Cycle error
- **WHEN** a cyclic graph is passed to `topologicalSort()`
- **THEN** the system SHALL throw a `DAGCycleError`
- **AND** the error SHALL include the detected cycle paths

#### Scenario: Invalid input error
- **WHEN** `null` or `undefined` is passed to any DAG utility function
- **THEN** the system SHALL throw a `TypeError` with a descriptive message
