## 1. Setup

- [x] 1.1 Create `src/utils/dag.ts` module file
- [x] 1.2 Create `tests/dag.test.ts` test file
- [x] 1.3 Define TypeScript types: `TaskNode`, `CycleResult`, `DAGCycleError`

## 2. Core Implementation

- [x] 2.1 Implement `validateDAG(tasks: Task[]): boolean` using Kahn's algorithm
- [x] 2.2 Implement `detectCycles(tasks: Task[]): CycleResult` returning all cycle paths
- [x] 2.3 Implement `topologicalSort(tasks: Task[]): string[]` with DAGCycleError on cycles
- [x] 2.4 Implement `getReadyTasks(tasks: Task[]): Task[]` filtering by dependency status
- [x] 2.5 Add input validation (null/undefined checks, type guards)

## 3. Edge Case Handling

- [x] 3.1 Handle empty task arrays for all four functions
- [x] 3.2 Handle self-loops (task depends on itself)
- [x] 3.3 Handle disconnected components in topological sort
- [x] 3.4 Handle missing dependency references (dangling edges)
- [x] 3.5 Handle single-node graphs with no dependencies

## 4. Testing

- [x] 4.1 Write unit tests for `validateDAG()` — valid DAG, cycle, self-loop, empty
- [x] 4.2 Write unit tests for `detectCycles()` — no cycles, single cycle, multiple cycles, self-loop
- [x] 4.3 Write unit tests for `topologicalSort()` — valid sort, cycle error, empty, disconnected
- [x] 4.4 Write unit tests for `getReadyTasks()` — ready, blocked, no-deps, empty, failed-dep
- [x] 4.5 Write unit tests for error types — DAGCycleError message and cycle paths
- [x] 4.6 Verify test coverage >80% using `npm run test -- --coverage`

## 5. Integration

- [x] 5.1 Export all functions and types from `src/utils/dag.ts`
- [x] 5.2 Verify TypeScript compilation passes (`npm run typecheck`)
- [x] 5.3 Verify no `any` types in production code
