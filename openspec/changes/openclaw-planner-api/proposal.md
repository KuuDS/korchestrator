## Why

The Plan-Task-Build orchestration pipeline requires a Planner module that can classify user request complexity and decompose complex requests into structured, executable task plans. Without a well-defined Planner API, the plugin cannot reliably determine when to intervene (simple vs complex requests), generate valid task DAGs, persist plan state across conversation turns, or inject plan context into prompts. This change establishes the foundational Planner module API that all downstream modules (TaskRouter, Replanner, Blackboard) depend on.

## What Changes

- Create `Planner` class with `classify()`, `createPlan()`, `matchRule()`, and `toMarkdown()` methods
- Implement 3-tier complexity classification: L1 rule cache → L2 LLM → L3 fallback
- Add DAG validation utilities (`validateDAG()`, `hasCircularDependency()`, `topologicalSort()`)
- Define `Plan` and `Task` TypeScript interfaces with full type safety
- Implement Session Extension persistence via `registerSessionExtension("plan_state")`
- Implement cross-turn injection via `enqueueNextTurnInjection()` with idempotency and expiration
- Add Zod schema validation for LLM-generated task decomposition responses
- Add high-risk operation detection (auto-sets `requiresApproval: true`)
- Add fallback to single-task plan when LLM decomposition fails

## Capabilities

### New Capabilities
- `planner`: Complexity classification, task decomposition, DAG validation, state persistence, and cross-turn injection for the Plan-Task-Build orchestration pipeline.

### Modified Capabilities
- (none — this is a new capability with no existing spec modifications)

## Impact

- Affected files: `src/planner.ts`, `src/types.ts`, `src/utils/dag.ts`
- Affected hooks: `before_agent_reply` (priority 80), `before_prompt_build` (priority 70)
- Dependencies: OpenClaw Plugin SDK (`registerSessionExtension`, `enqueueNextTurnInjection`), Zod for schema validation, LLM provider for classification and decomposition
- Downstream impact: TaskRouter, Replanner, and Blackboard modules all consume Planner outputs
- Test coverage: New unit tests required for `Planner.classify`, `Planner.createPlan`, and DAG utilities
