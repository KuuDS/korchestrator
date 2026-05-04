## 1. Module Setup

- [x] 1.1 Create `src/replanner.ts` with Replanner class skeleton and TypeScript interfaces
- [x] 1.2 Define `HealthCheck`, `RepairDecision`, and `RepairStrategy` types with strict typing
- [x] 1.3 Add Replanner constructor accepting `{ model: string; maxRetries?: number }` config

## 2. Health Check Implementation

- [x] 2.1 Implement `Replanner.check(plan)` to evaluate Plan health state
- [x] 2.2 Return `needsReroute: false` when all tasks are `done` or `skipped`
- [x] 2.3 Return `needsReroute: false` when tasks are still `running` (no failures)
- [x] 2.4 Return `needsReroute: true` with failed tasks and aggregated retry count when failures exist
- [x] 2.5 Add try/catch with fallback to `needsReroute: false` on error

## 3. Repair Strategy Selection

- [x] 3.1 Implement `Replanner.replan(plan, failedTasks)` with LLM prompt for strategy selection
- [x] 3.2 Parse LLM response into `RepairDecision` with validation against allowed strategies
- [x] 3.3 Fallback to `strategy: "retry"` on LLM failure or invalid JSON
- [x] 3.4 Fallback to `strategy: "retry"` on unrecognized strategy value

## 4. Repair Strategy Application

- [x] 4.1 Implement `applyRepair(plan, failedTasks, decision)` with switch on strategy
- [x] 4.2 Implement retry strategy: reset failed tasks to `pending`, increment `_retryCount`
- [x] 4.3 Implement decompose strategy: remove failed tasks, append `newTasks` with `pending` status
- [x] 4.4 Implement skip strategy: mark failed tasks as `skipped` with `[skipped by replanner]` result
- [x] 4.5 Implement escalate strategy: reset failed tasks to `pending`, set `requiresApproval: true`
- [x] 4.6 Update `plan.updatedAt` timestamp in all repair paths

## 5. Hook Integration

- [x] 5.1 Register `before_agent_finalize` hook in `src/index.ts` at priority 60
- [x] 5.2 Read Plan from Session Extension via `event.context.session.pluginExtensions.plan_state`
- [x] 5.3 Call `replanner.check(plan)` and branch on `needsReroute`
- [x] 5.4 On finalize: set `plan.status = "done"`, persist, return `{ action: "finalize" }`
- [x] 5.5 On revise: call `replan()` → `applyRepair()`, persist, return `{ action: "revise", reason }`
- [x] 5.6 Add try/catch with fallback to `{ action: "finalize" }` on hook error

## 6. Testing

- [x] 6.1 Unit test: `check()` returns finalize when all tasks done
- [x] 6.2 Unit test: `check()` returns wait when tasks running
- [x] 6.3 Unit test: `check()` returns revise with correct failed tasks and retry count
- [x] 6.4 Unit test: `check()` error recovery returns safe fallback
- [x] 6.5 Unit test: `replan()` selects retry strategy for transient errors
- [x] 6.6 Unit test: `replan()` selects decompose strategy with valid newTasks
- [x] 6.7 Unit test: `replan()` selects skip strategy for optional tasks
- [x] 6.8 Unit test: `replan()` selects escalate strategy for permission issues
- [x] 6.9 Unit test: `replan()` fallback to retry on LLM failure
- [x] 6.10 Unit test: `applyRepair()` retry increments `_retryCount` correctly
- [x] 6.11 Unit test: `applyRepair()` decompose removes and appends tasks
- [x] 6.12 Unit test: `applyRepair()` skip marks tasks with correct status and result
- [x] 6.13 Unit test: `applyRepair()` escalate sets `requiresApproval: true`
- [x] 6.14 Unit test: `before_agent_finalize` hook returns finalize when plan healthy
- [x] 6.15 Unit test: `before_agent_finalize` hook returns revise when plan has failures
- [x] 6.16 Unit test: `before_agent_finalize` hook error recovery returns finalize fallback
- [x] 6.17 Achieve >80% test coverage for `src/replanner.ts`
