## Context

The Task Router module sits between the Planner (which generates task decomposition Plans) and the Build execution layer (where Subagents execute tasks). It is responsible for deciding which agent executes which task, when tasks are ready to execute, and how many tasks can run concurrently. The current codebase has a conceptual Task Router but lacks a formalized public API.

This change formalizes the Task Router as a standalone module with a clean API surface, making it independently testable and reusable.

## Goals / Non-Goals

**Goals:**
- Provide a deterministic skill-based routing algorithm with clear precedence rules
- Enforce configurable concurrency limits to prevent resource exhaustion
- Resolve task dependencies before routing to ensure correct execution order
- Track task lifecycle state transitions with full observability
- Expose a public API that can be unit tested in isolation

**Non-Goals:**
- Replanner logic (handled by separate Replanner module)
- Plan generation (handled by Planner module)
- Blackboard persistence (handled by Blackboard module)
- Tool interception or approval (handled by `before_tool_call` hook)

## Decisions

1. **Routing Algorithm**: Three-tier matching — exact match (all skills covered) → maximum intersection → fallback to default `coder` agent. This balances precision with resilience.
   - *Alternative considered*: Weighted scoring with skill priorities. Rejected as over-engineered for the initial implementation.

2. **Concurrency Control at Hook Level**: Concurrency is enforced in the `subagent_spawning` hook rather than inside the TaskRouter class. This keeps the router stateless and delegates execution control to the OpenClaw runtime.
   - *Alternative considered*: Internal queue management in TaskRouter. Rejected to avoid duplicating OpenClaw's subagent lifecycle management.

3. **State Persistence via Session Extension**: Task lifecycle state is persisted through `plan_state` Session Extension, not in-memory. This ensures state survives gateway restarts and supports multi-turn conversations.

4. **Default Concurrency Limit of 3**: Chosen based on typical OpenClaw deployment resource constraints. Configurable via `maxConcurrency` parameter.

5. **spawnTask as Async Wrapper**: `spawnTask()` is an async utility that coordinates `getReadyTasks()` → `routeBySkill()` → subagent dispatch. It encapsulates the dispatch logic for reuse across hooks.

## Risks / Trade-offs

- **[Risk]** `subagent_*` hooks API is not yet officially released by OpenClaw → **Mitigation**: Add defensive checks for hook availability; log warnings if hooks are missing.
- **[Risk]** Skill overlap between roles (e.g., `coder` and `reviewer` both have `code`) could lead to non-deterministic routing → **Mitigation**: Exact-match tier prefers the most specialized agent (fewest total skills).
- **[Risk]** High concurrency limit could exhaust LLM API rate limits → **Mitigation**: Default limit is conservative (3); users can tune based on their API quotas.
- **[Risk]** Dependency resolution does not handle dynamic dependency changes at runtime → **Mitigation**: Document that dependencies are static after Plan creation; dynamic changes require Replanner intervention.

## Migration Plan

No migration required. This is a new module addition. Existing Plans without `taskRunMap` will initialize an empty mapping on first use.

## Open Questions

1. Should `spawnTask()` return a Promise that resolves when the subagent completes, or immediately after dispatch? → **Decision**: Returns immediately after dispatch; completion is tracked via lifecycle hooks.
2. Should the router cache role-to-skill mappings for performance? → **Decision**: Not for initial implementation; agent pools are small (4 roles).
