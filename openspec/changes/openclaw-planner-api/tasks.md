## 1. Setup

- [ ] 1.1 Create `src/planner.ts` module file
- [ ] 1.2 Create `src/types.ts` with Plan, Task, AgentRole interfaces
- [ ] 1.3 Create `src/utils/dag.ts` with validateDAG, hasCircularDependency, topologicalSort
- [ ] 1.4 Add Zod dependency to package.json
- [ ] 1.5 Define Zod schemas for Task and Plan validation

## 2. Complexity Classification

- [ ] 2.1 Implement `Planner.matchRule()` for L1 rule cache matching
- [ ] 2.2 Implement `Planner.classify()` with L1→L2→L3 tiered strategy
- [ ] 2.3 Add `skipClassification` config support
- [ ] 2.4 Add classification rule cache with configurable patterns
- [ ] 2.5 Write unit tests for classify (simple, complex, fallback, skip mode)

## 3. Task Decomposition

- [ ] 3.1 Implement `Planner.createPlan()` with LLM prompt for task decomposition
- [ ] 3.2 Add Zod schema validation for LLM JSON response
- [ ] 3.3 Integrate `validateDAG()` into plan creation flow
- [ ] 3.4 Implement high-risk operation detection (auto requiresApproval)
- [ ] 3.5 Implement single-task fallback on decomposition failure
- [ ] 3.6 Enforce `maxTasks` limit on generated plans
- [ ] 3.7 Write unit tests for createPlan (valid, invalid JSON, high-risk, fallback)

## 4. State Persistence

- [ ] 4.1 Implement `registerSessionExtension("plan_state")` in plugin entry
- [ ] 4.2 Implement plan state read/write via `event.context.sessions.pluginPatch()`
- [ ] 4.3 Implement `taskRunMap` maintenance (runId → taskId mapping)
- [ ] 4.4 Implement session cleanup differentiation (reset/restart preserve, delete/disable remove)
- [ ] 4.5 Write unit tests for state persistence and cleanup

## 5. Cross-Turn Injection

- [ ] 5.1 Implement `before_prompt_build` hook (priority 70) for Scheme A direct injection
- [ ] 5.2 Implement `Planner.toMarkdown()` for plan serialization
- [ ] 5.3 Implement `enqueueNextTurnInjection()` support for Scheme B user confirmation
- [ ] 5.4 Add idempotency key handling for injections
- [ ] 5.5 Add injection expiration and discard logic
- [ ] 5.6 Write unit tests for prompt injection and idempotency

## 6. DAG Utilities

- [ ] 6.1 Implement `validateDAG()` with DFS cycle detection
- [ ] 6.2 Implement `hasCircularDependency()` wrapper
- [ ] 6.3 Implement `topologicalSort()` with Kahn's algorithm
- [ ] 6.4 Add missing dependency validation in DAG checks
- [ ] 6.5 Write unit tests for DAG utilities (valid, cyclic, missing dep, topological sort)

## 7. Integration & Quality

- [ ] 7.1 Wire Planner into plugin entry (`src/index.ts`)
- [ ] 7.2 Ensure all async operations have try/catch
- [ ] 7.3 Verify no `any` types in production code
- [ ] 7.4 Achieve >80% test coverage for Planner module
- [ ] 7.5 Add JSDoc comments for all public methods
- [ ] 7.6 Run TypeScript strict mode check
