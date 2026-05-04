## Why

The Plan-Task-Build orchestration pipeline needs a mechanism to recover from task execution failures without human intervention. When Subagents fail during task execution, the system must intelligently decide whether to retry, decompose, skip, or escalate the failed task. Without a Replanner module, failed tasks would stall the entire Plan or require manual restart, defeating the purpose of autonomous multi-agent orchestration.

## What Changes

- Create the `Replanner` module class with the following public API:
  - `check(plan: Plan): Promise<HealthCheck>` — evaluates Plan health and determines if replanning is needed
  - `replan(plan: Plan, failedTasks: Task[]): Promise<Plan>` — generates a repair plan using LLM-based strategy selection
  - `applyRepair(decision: RepairDecision): Plan` — applies the selected repair strategy to the Plan
  - `retryTask(task: Task): Task` — resets a failed task to `pending` with incremented retry count
  - `decomposeTask(task: Task, subTasks: Task[]): Plan` — replaces a failed task with smaller sub-tasks
  - `skipTask(task: Task): Task` — marks a failed task as `skipped` with a reason annotation
  - `escalateTask(task: Task): Task` — marks a failed task as requiring human approval (`requiresApproval: true`)
- Register the `before_agent_finalize` hook (priority 60) to invoke Replanner decisions at the end of each agent turn
- Implement health check logic that considers: all tasks complete → finalize; any failed tasks → revise; running tasks → wait
- Add retry counting with `maxRetries` threshold to prevent infinite retry loops
- Integrate with Session Extension for Plan state persistence during replanning

## Capabilities

### New Capabilities

- `replanner`: Dynamic replanning and repair strategy selection for failed tasks in a Plan

### Modified Capabilities

- `monitor`: Replanner decisions (strategy, affected tasks) SHALL be included in event logging (FR-MON-003)

## Impact

- **New file**: `src/replanner.ts` — Replanner module implementation
- **New file**: `tests/replanner.test.ts` — unit tests covering all 4 repair strategies and health check scenarios
- **Modified file**: `src/index.ts` — register `before_agent_finalize` hook to wire Replanner into the plugin lifecycle
- **Dependencies**: `openclaw/plugin-sdk/llm` for LLM-based strategy selection; `src/planner.ts` for Plan and Task type definitions
- **Hook affected**: `before_agent_finalize` (priority 60) — returns `{ action: "revise" | "finalize", reason? }`
- **PRD references**: FR-BUILD-003 (lines ~113-133)
