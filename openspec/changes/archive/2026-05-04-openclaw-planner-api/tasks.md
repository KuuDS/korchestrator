## 1. Setup

- [x] 1.1 Create `src/planner.ts` module file
- [x] 1.2 Create `src/types.ts` with Plan, Task, AgentRole interfaces
- [x] 1.3 Create `src/utils/dag.ts` with validateDAG, hasCircularDependency, topologicalSort
- [x] 1.4 Add Zod dependency to package.json
- [x] 1.5 Define Zod schemas for Task and Plan validation

## 2. Complexity Classification

- [x] 2.1 Implement `Planner.matchRule()` for L1 rule cache matching
- [x] 2.2 Implement `Planner.classify()` with L1→L2→L3 tiered strategy
- [x] 2.3 Add `skipClassification` config support
- [x] 2.4 Add classification rule cache with configurable patterns
- [x] 2.5 Write unit tests for classify (simple, complex, fallback, skip mode)

## 3. Task Decomposition

- [x] 3.1 Implement `Planner.createPlan()` with LLM prompt for task decomposition
- [x] 3.2 Add Zod schema validation for LLM JSON response
- [x] 3.3 Integrate `validateDAG()` into plan creation flow
- [x] 3.4 Implement high-risk operation detection (auto requiresApproval)
- [x] 3.5 Implement single-task fallback on decomposition failure
- [x] 3.6 Enforce `maxTasks` limit on generated plans
- [x] 3.7 Write unit tests for createPlan (valid, invalid JSON, high-risk, fallback)

## 4. State Persistence

- [x] 4.1 Implement `registerSessionExtension("plan_state")` in plugin entry
- [x] 4.2 Implement plan state read/write via `event.context.sessions.pluginPatch()`
- [ ] 4.3 Implement `taskRunMap` maintenance (runId → taskId mapping)
- [ ] 4.4 Implement session cleanup differentiation (reset/restart preserve, delete/disable remove)
- [x] 4.5 Write unit tests for state persistence and cleanup

## 5. Cross-Turn Injection

- [x] 5.1 Implement `before_prompt_build` hook (priority 70) for Scheme A direct injection
- [x] 5.2 Implement `Planner.toMarkdown()` for plan serialization
- [ ] 5.3 Implement `enqueueNextTurnInjection()` support for Scheme B user confirmation
- [ ] 5.4 Add idempotency key handling for injections
- [ ] 5.5 Add injection expiration and discard logic
- [x] 5.6 Write unit tests for prompt injection and idempotency

## 6. DAG Utilities

- [x] 6.1 Implement `validateDAG()` with DFS cycle detection
- [x] 6.2 Implement `hasCircularDependency()` wrapper
- [x] 6.3 Implement `topologicalSort()` with Kahn's algorithm
- [x] 6.4 Add missing dependency validation in DAG checks
- [x] 6.5 Write unit tests for DAG utilities (valid, cyclic, missing dep, topological sort)

## 7. Integration & Quality

- [x] 7.1 Wire Planner into plugin entry (`src/index.ts`)
- [x] 7.2 Ensure all async operations have try/catch
- [x] 7.3 Verify no `any` types in production code
- [x] 7.4 Achieve >80% test coverage for Planner module
- [x] 7.5 Add JSDoc comments for all public methods
- [x] 7.6 Run TypeScript strict mode check
