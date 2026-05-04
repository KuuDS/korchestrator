## 1. Setup

- [x] 1.1 Create `src/blackboard.ts` module file with class skeleton and constructor
- [x] 1.2 Add `metricsOutput`, `metricsWebhook`, `metricsOtelEndpoint` to plugin config schema (Zod)
- [x] 1.3 Update `src/index.ts` to instantiate Blackboard with plugin config

## 2. Core File I/O Methods

- [x] 2.1 Implement `writeResult(taskId, content)` with recursive directory creation and error handling
- [x] 2.2 Implement `readResult(taskId)` with missing-file fallback to empty string
- [x] 2.3 Implement `writePlan(planId, content)` with recursive directory creation and error handling
- [x] 2.4 Write unit tests for `writeResult`, `readResult`, `writePlan` covering success and failure paths

## 3. Metrics Output

- [x] 3.1 Implement `writeMetrics(runId, metrics)` with local JSON file write (always executed)
- [x] 3.2 Implement webhook POST branch when `metricsOutput === "webhook"`
- [x] 3.3 Implement OTel POST branch with OTLP JSON format when `metricsOutput === "otel"`
- [x] 3.4 Write unit tests for `writeMetrics` covering all 4 output modes and failure paths

## 4. Aggregation and Cleanup

- [x] 4.1 Implement `aggregateResults(taskIds)` with Markdown formatting and missing-result omission
- [x] 4.2 Implement `cleanup(reason)` with differentiated strategies for reset/delete/disable/restart
- [x] 4.3 Write unit tests for `aggregateResults` covering multiple tasks and missing results
- [x] 4.4 Write unit tests for `cleanup` covering all 4 reasons and failure paths

## 5. Hook Integration

- [x] 5.1 Integrate `blackboard.writeResult()` into `after_tool_call` hook (FR-BUILD-002)
- [x] 5.2 Integrate `blackboard.writeMetrics()` into `agent_end` hook (FR-BUILD-005)
- [x] 5.3 Integrate `blackboard.cleanup()` into session extension cleanup via `registerSessionExtension` pattern in `gateway_stop`
- [x] 5.4 Write integration tests verifying end-to-end result persistence and metrics collection

## 6. Validation

- [x] 6.1 Run unit tests and ensure >80% coverage for `blackboard.ts` (achieved 97.67% statements)
- [x] 6.2 Run `tsc --noEmit` to verify TypeScript strict mode compliance (passed)
- [ ] 6.3 Run `openspec status --change openclaw-blackboard-api` to verify artifact completeness
