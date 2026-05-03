## 1. Setup

- [ ] 1.1 Create `src/blackboard.ts` module file with class skeleton and constructor
- [ ] 1.2 Add `metricsOutput`, `metricsWebhook`, `metricsOtelEndpoint` to plugin config schema (Zod)
- [ ] 1.3 Update `src/index.ts` to instantiate Blackboard with plugin config

## 2. Core File I/O Methods

- [ ] 2.1 Implement `writeResult(taskId, content)` with recursive directory creation and error handling
- [ ] 2.2 Implement `readResult(taskId)` with missing-file fallback to empty string
- [ ] 2.3 Implement `writePlan(planId, content)` with recursive directory creation and error handling
- [ ] 2.4 Write unit tests for `writeResult`, `readResult`, `writePlan` covering success and failure paths

## 3. Metrics Output

- [ ] 3.1 Implement `writeMetrics(runId, metrics)` with local JSON file write (always executed)
- [ ] 3.2 Implement webhook POST branch when `metricsOutput === "webhook"`
- [ ] 3.3 Implement OTel POST branch with OTLP JSON format when `metricsOutput === "otel"`
- [ ] 3.4 Write unit tests for `writeMetrics` covering all 4 output modes and failure paths

## 4. Aggregation and Cleanup

- [ ] 4.1 Implement `aggregateResults(taskIds)` with Markdown formatting and missing-result omission
- [ ] 4.2 Implement `cleanup(reason)` with differentiated strategies for reset/delete/disable/restart
- [ ] 4.3 Write unit tests for `aggregateResults` covering multiple tasks and missing results
- [ ] 4.4 Write unit tests for `cleanup` covering all 4 reasons and failure paths

## 5. Hook Integration

- [ ] 5.1 Integrate `blackboard.writeResult()` into `after_tool_call` hook (FR-BUILD-002)
- [ ] 5.2 Integrate `blackboard.writeMetrics()` into `agent_end` hook (FR-BUILD-005)
- [ ] 5.3 Integrate `blackboard.cleanup()` into `registerSessionExtension("plan_state").onCleanup` callback
- [ ] 5.4 Write integration tests verifying end-to-end result persistence and metrics collection

## 6. Validation

- [ ] 6.1 Run unit tests and ensure >80% coverage for `blackboard.ts`
- [ ] 6.2 Run `tsc --noEmit` to verify TypeScript strict mode compliance
- [ ] 6.3 Run `openspec status --change openclaw-blackboard-api` to verify artifact completeness
