## 1. Module Setup

- [ ] 1.1 Create `src/replanner.ts` with Replanner class skeleton and TypeScript interfaces
- [ ] 1.2 Define `HealthCheck`, `RepairDecision`, and `RepairStrategy` types with strict typing
- [ ] 1.3 Add Replanner constructor accepting `{ model: string; maxRetries?: number }` config

## 2. Health Check Implementation

- [ ] 2.1 Implement `Replanner.check(plan)` to evaluate Plan health state
- [ ] 2.2 Return `needsReroute: false` when all tasks are `done` or `skipped`
- [ ] 2.3 Return `needsReroute: false` when tasks are still `running` (no failures)
- [ ] 2.4 Return `needsReroute: true` with failed tasks and aggregated retry count when failures exist
- [ ] 2.5 Add try/catch with fallback to `needsReroute: false` on error

## 3. Repair Strategy Selection

- [ ] 3.1 Implement `Replanner.replan(plan, failedTasks)` with LLM prompt for strategy selection
- [ ] 3.2 Parse LLM response into `RepairDecision` with validation against allowed strategies
- [ ] 3.3 Fallback to `strategy: "retry"` on LLM failure or invalid JSON
- [ ] 3.4 Fallback to `strategy: "retry"` on unrecognized strategy value

## 4. Repair Strategy Application

- [ ] 4.1 Implement `applyRepair(plan, failedTasks, decision)` with switch on strategy
- [ ] 4.2 Implement retry strategy: reset failed tasks to `pending`, increment `_retryCount`
- [ ] 4.3 Implement decompose strategy: remove failed tasks, append `newTasks` with `pending` status
- [ ] 4.4 Implement skip strategy: mark failed tasks as `skipped` with `[skipped by replanner]` result
- [ ] 4.5 Implement escalate strategy: reset failed tasks to `pending`, set `requiresApproval: true`
- [ ] 4.6 Update `plan.updatedAt` timestamp in all repair paths

## 5. Hook Integration

- [ ] 5.1 Register `before_agent_finalize` hook in `src/index.ts` at priority 60
- [ ] 5.2 Read Plan from Session Extension via `event.context.session.pluginExtensions.plan_state`
- [ ] 5.3 Call `replanner.check(plan)` and branch on `needsReroute`
- [ ] 5.4 On finalize: set `plan.status = "done"`, persist, return `{ action: "finalize" }`
- [ ] 5.5 On revise: call `replan()` → `applyRepair()`, persist, return `{ action: "revise", reason }`
- [ ] 5.6 Add try/catch with fallback to `{ action: "finalize" }` on hook error

## 6. Testing

- [ ] 6.1 Unit test: `check()` returns finalize when all tasks done
- [ ] 6.2 Unit test: `check()` returns wait when tasks running
- [ ] 6.3 Unit test: `check()` returns revise with correct failed tasks and retry count
- [ ] 6.4 Unit test: `check()` error recovery returns safe fallback
- [ ] 6.5 Unit test: `replan()` selects retry strategy for transient errors
- [ ] 6.6 Unit test: `replan()` selects decompose strategy with valid newTasks
- [ ] 6.7 Unit test: `replan()` selects skip strategy for optional tasks
- [ ] 6.8 Unit test: `replan()` selects escalate strategy for permission issues
- [ ] 6.9 Unit test: `replan()` fallback to retry on LLM failure
- [ ] 6.10 Unit test: `applyRepair()` retry increments `_retryCount` correctly
- [ ] 6.11 Unit test: `applyRepair()` decompose removes and appends tasks
- [ ] 6.12 Unit test: `applyRepair()` skip marks tasks with correct status and result
- [ ] 6.13 Unit test: `applyRepair()` escalate sets `requiresApproval: true`
- [ ] 6.14 Unit test: `before_agent_finalize` hook returns finalize when plan healthy
- [ ] 6.15 Unit test: `before_agent_finalize` hook returns revise when plan has failures
- [ ] 6.16 Unit test: `before_agent_finalize` hook error recovery returns finalize fallback
- [ ] 6.17 Achieve >80% test coverage for `src/replanner.ts`
