## Why

The Plan-Task-Build orchestration pipeline requires a persistent, structured mechanism for storing task execution results, plan artifacts, and execution metrics across the full lifecycle of a complex request. Without a centralized shared state store, results from Subagent executions would be lost between turns, metrics would be unobservable, and the system would lack the audit trail necessary for debugging and monitoring. The Blackboard module (PRD §7.6) provides this foundation as a Markdown-driven shared state storage with support for multiple output backends.

## What Changes

- Create the `Blackboard` class in `src/blackboard.ts` implementing Markdown-driven shared state storage
- Implement `writeResult(taskId, content)` — persist task execution results as Markdown files in `workspace/WORKSPACE/`
- Implement `writePlan(planId, content)` — persist plan artifacts as Markdown files in `workspace/PLANS/`
- Implement `writeMetrics(runId, metrics)` — write execution metrics to `workspace/METRICS/` with support for 4 output modes:
  - `blackboard` (default): local JSON files
  - `webhook`: POST to configured webhook URL
  - `otel`: POST to OpenTelemetry endpoint in OTLP format
  - `none`: suppress all metrics output
- Implement `readResult(taskId)` — retrieve persisted task results
- Implement `aggregateResults(taskIds)` — combine multiple task results into a single Markdown document
- Implement `cleanup(reason)` — differentiated cleanup based on session lifecycle event (`reset`, `delete`, `disable`, `restart`)
- Integrate Blackboard into `after_tool_call` hook (FR-BUILD-002) for result collection
- Integrate Blackboard into `agent_end` hook (FR-BUILD-005) for metrics recording
- Integrate Blackboard into `registerSessionExtension("plan_state")` `onCleanup` callback for lifecycle-aware cleanup

## Capabilities

### New Capabilities
- `blackboard-api`: Markdown-driven shared state storage with multi-backend metrics output and lifecycle-aware cleanup

### Modified Capabilities
- `monitor`: Metrics output destination changes — execution metrics are now written through Blackboard instead of directly to console. The `agent_end` hook behavior is extended to route metrics through Blackboard's configured output pipeline.

## Impact

- **New file**: `src/blackboard.ts` — core Blackboard module
- **New test file**: `tests/blackboard.test.ts` — unit tests for all Blackboard methods including cleanup scenarios
- **Modified**: `src/index.ts` — Blackboard instantiation, `after_tool_call` integration, `agent_end` integration, `onCleanup` integration
- **Dependencies**: Node.js `fs/promises` for file I/O, global `fetch` for webhook/OTel output
- **Configuration**: New plugin config fields `metricsOutput`, `metricsWebhook`, `metricsOtelEndpoint` (see PRD §5.3)
- **Directory structure**: Creates `workspace/WORKSPACE/`, `workspace/PLANS/`, `workspace/METRICS/` at runtime
