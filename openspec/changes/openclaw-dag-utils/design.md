## Context

The korchestrator plugin decomposes complex user requests into structured Task Lists with inter-task dependencies (FR-PLAN-002). The Task Router then schedules execution based on dependency satisfaction (FR-TASK-003). Both modules need graph algorithms that are correct, efficient, and share a common representation of the dependency graph.

Currently, no centralized graph utility exists. The Planner and TaskRouter would each need to implement their own cycle detection and topological sort, leading to duplication and potential inconsistencies in edge case handling.

## Goals / Non-Goals

**Goals:**
- Provide a pure, stateless utility module for DAG operations on task dependency graphs
- Support all edge cases required by the orchestration pipeline (empty graphs, self-loops, disconnected components)
- Enable both validation-time cycle detection (Planner) and runtime ready-task computation (TaskRouter)
- Achieve >80% test coverage with deterministic, fast unit tests

**Non-Goals:**
- General-purpose graph library (e.g., weighted edges, shortest path, graph visualization)
- Mutable graph operations or persistent graph data structures
- Integration with external graph databases or visualization tools
- Performance optimization for graphs with >10,000 nodes (out of scope for task decomposition)

## Decisions

1. **Pure functions over class-based API**
   - Rationale: Functions are easier to test, tree-shakeable, and have no hidden state. The task graph is ephemeral (reconstructed per Plan), so mutable state is unnecessary.
   - Alternative considered: `class DAGGraph { ... }` — rejected due to unnecessary complexity for a utility module.

2. **Adjacency list representation via `dependencies: string[]` on Task objects**
   - Rationale: Matches the existing `Task` interface from PRD §5.1. No need to transform data structures.
   - Alternative considered: Separate `Graph` class with `nodes` and `edges` — rejected to avoid data duplication.

3. **Kahn's algorithm for topological sort and cycle detection**
   - Rationale: O(V + E) time complexity, naturally produces topological order, and can detect cycles by comparing output length to input node count. More intuitive than DFS-based coloring for this use case.
   - Alternative considered: DFS with three-color marking — rejected because Kahn's algorithm simultaneously produces the sort order and cycle detection in a single pass.

4. **Return detailed cycle paths, not just boolean**
   - Rationale: The Planner needs to report *which* tasks form a cycle so the LLM can revise the plan. A boolean alone is insufficient for debugging.
   - `detectCycles()` returns `CycleResult` with `hasCycle: boolean` and `cycles: string[][]` (each cycle is an array of task IDs).

5. **Handle disconnected components natively**
   - Rationale: LLM-generated plans may produce independent sub-graphs (e.g., parallel research tasks with no shared dependencies). The utility must process all components without error.

## Risks / Trade-offs

- **[Risk]** Kahn's algorithm requires in-degree computation, which is O(V + E) but needs an auxiliary map. For very large graphs this adds memory overhead.
  - **Mitigation**: Task graphs in this domain are typically <50 nodes. Memory overhead is negligible. If needed, a DFS variant can be added later without breaking the API.

- **[Risk]** Empty graph (zero tasks) could be misinterpreted as invalid by consumers.
  - **Mitigation**: All functions explicitly handle empty input: `validateDAG([])` returns `true`, `topologicalSort([])` returns `[]`, `getReadyTasks([])` returns `[]`.

- **[Risk]** Self-loops (task depends on itself) are technically cycles of length 1 but may be treated differently by the Planner.
  - **Mitigation**: `detectCycles()` reports self-loops as single-element cycles `['task_001']`. `validateDAG()` returns `false` for self-loops. Callers can inspect cycle length for differentiated handling.

## Migration Plan

No migration required. This is a new utility module. Integration into Planner and TaskRouter will happen in subsequent changes.

## Open Questions

- Should `getReadyTasks()` accept a predicate for custom "done" state, or is the standard `status === 'done' | 'skipped'` sufficient?
  - **Resolution**: Use standard status check for now. A predicate overload can be added later without breaking changes.
