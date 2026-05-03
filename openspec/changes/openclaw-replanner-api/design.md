## Context

The Replanner module is the error-recovery component of the Plan-Task-Build orchestration pipeline. It operates at the `before_agent_finalize` hook (priority 60), which fires at the end of each agent turn. At this point, the Replanner evaluates the current Plan state and decides whether to finalize execution or trigger a revise cycle with a repair strategy.

The module must handle four distinct failure recovery strategies:
1. **retry** — transient errors (network timeouts, API rate limits)
2. **decompose** — tasks that are too large or ambiguous
3. **skip** — non-blocking optional tasks
4. **escalate** — tasks requiring human judgment or elevated permissions

Current state: The Replanner module does not exist. The `before_agent_finalize` hook is not yet registered in the plugin entrypoint.

## Goals / Non-Goals

**Goals:**
- Provide deterministic health check logic to decide revise vs finalize
- Support 4 repair strategies with clear applicability criteria
- Prevent infinite retry loops via configurable `maxRetries` threshold
- Integrate seamlessly with existing Plan/Task data structures and Session Extension persistence
- Ensure all LLM calls have try/catch with safe fallback to retry strategy

**Non-Goals:**
- Automatic decomposition logic (the LLM generates sub-tasks; the Replanner only applies them)
- Human-in-the-loop UI for escalation (escalation sets `requiresApproval`; the existing `before_tool_call` hook handles the approval flow)
- Cross-Plan replanning (each Plan is replanned independently)
- Predictive failure detection (only reactive replanning based on actual failures)

## Decisions

1. **Health check runs synchronously before LLM replanning**
   - Rationale: The `check()` method filters out trivial cases (all done → finalize, still running → wait) without incurring LLM costs. Only failed tasks trigger the expensive `replan()` LLM call.
   - Alternative: Always call LLM for decision → rejected due to cost and latency concerns.

2. **Retry count is aggregated per-task via `_retryCount` field**
   - Rationale: Each Task tracks its own retry count, enabling per-task retry limits and fine-grained observability.
   - Alternative: Global retry counter per Plan → rejected because different tasks may fail for different reasons and need different retry budgets.

3. **Repair strategies are hardcoded enums; strategy selection is LLM-assisted**
   - Rationale: The set of strategies is fixed by the PRD. The LLM only selects among them and provides reasoning, ensuring predictable behavior.
   - Alternative: LLM generates arbitrary repair actions → rejected due to safety and testability concerns.

4. **Decomposition removes the failed task and inserts new sub-tasks at the end of the task list**
   - Rationale: New sub-tasks inherit the original task's dependencies plus any inter-sub-task dependencies provided by the LLM. Appending simplifies DAG re-validation.
   - Alternative: In-place replacement → rejected because it complicates dependency tracking when sub-tasks have their own dependency graphs.

5. **Escalation sets `requiresApproval: true` and resets status to `pending`**
   - Rationale: Reuses the existing approval flow in `before_tool_call` hook. The task will be re-attempted after user approval.
   - Alternative: Create a separate escalation queue → rejected to avoid duplicating approval infrastructure.

## Risks / Trade-offs

- **[Risk] LLM strategy selection may choose inappropriate strategies** → Mitigation: Fallback to `retry` on any LLM error or invalid strategy response; validate strategy against allowed enum values.
- **[Risk] Decomposition could create invalid dependency graphs** → Mitigation: Run `validateDAG()` on the modified Plan after applying decomposition; if invalid, fallback to retry.
- **[Risk] Infinite retry loops if a task consistently fails** → Mitigation: `maxRetries` threshold (default 3); after exceeding, the Replanner will still attempt retry but logs a warning. Future enhancement: auto-escalate after max retries.
- **[Risk] Race condition between replanning and concurrent subagent execution** → Mitigation: `before_agent_finalize` hook fires at the end of an agent turn, when no new subagents are being spawned. The `check()` method also returns `needsReroute: false` if any tasks are still `running`.
- **[Trade-off] LLM-based replanning adds latency** → The `check()` method short-circuits when no replanning is needed. Only failed-task scenarios incur LLM latency.

## Migration Plan

No migration needed — this is a new module. The `before_agent_finalize` hook registration in `src/index.ts` should be added alongside existing hook registrations.

## Open Questions

- Should `maxRetries` be configurable per-task-type or globally? (Current design: global via Replanner constructor config.)
- Should the Replanner emit custom events for external observability systems? (Current design: logs only; metrics go through Blackboard.)
