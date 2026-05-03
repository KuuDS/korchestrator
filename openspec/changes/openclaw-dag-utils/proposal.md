## Why

The Plan-Task-Build orchestration plugin requires robust DAG (Directed Acyclic Graph) operations to validate task dependencies, detect cycles, and determine execution order. Without a dedicated utility module, both the Planner (during task decomposition per FR-PLAN-002) and the TaskRouter (during dependency resolution) would need to reimplement graph algorithms, leading to code duplication and inconsistent error handling. A centralized DAG utility ensures correctness, testability, and reuse across the plugin.

## What Changes

- Create a new `src/utils/dag.ts` module providing pure functions for DAG operations
- Add four core functions: `validateDAG()`, `detectCycles()`, `topologicalSort()`, `getReadyTasks()`
- Handle edge cases: empty graphs, self-loops, disconnected components
- Export TypeScript types for graph nodes and cycle detection results
- Add comprehensive unit tests targeting >80% coverage
- **No breaking changes** — this is a new internal utility module

## Capabilities

### New Capabilities
- `dag-validation`: Validates that a task dependency graph forms a valid DAG, detecting cycles and self-loops
- `dag-operations`: Performs topological sorting and computes ready tasks based on completed dependencies

### Modified Capabilities
- None — this is a pure utility addition with no spec-level behavior changes to existing capabilities

## Impact

- **Planner module**: Will call `validateDAG()` after LLM-generated task decomposition to reject cyclic plans
- **TaskRouter module**: Will call `getReadyTasks()` and `topologicalSort()` for dependency resolution and execution ordering
- **Test suite**: New test file `src/utils/dag.test.ts` with unit tests for all edge cases
- **Dependencies**: None — pure TypeScript with no external runtime dependencies
