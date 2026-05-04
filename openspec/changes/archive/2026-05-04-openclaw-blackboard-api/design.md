## Context

The korchestrator project is a greenfield OpenClaw plugin implementing Plan-Task-Build multi-agent orchestration. The Blackboard module is one of four core modules (Planner, TaskRouter, Replanner, Blackboard) and serves as the shared state persistence layer. It is invoked from multiple hooks: `after_tool_call` for result collection, `agent_end` for metrics recording, and `registerSessionExtension.onCleanup` for lifecycle cleanup. The module must be resilient to I/O failures and support multiple output backends without blocking the main execution flow.

## Goals / Non-Goals

**Goals:**
- Provide durable, filesystem-based storage for task results, plan artifacts, and execution metrics
- Support four metrics output modes (blackboard/webhook/otel/none) with clean configuration-driven switching
- Implement differentiated cleanup strategies based on session lifecycle events
- Ensure all I/O operations are non-blocking to the orchestration pipeline via try/catch wrappers
- Maintain >80% test coverage for the Blackboard module

**Non-Goals:**
- Database-backed storage (filesystem only)
- Real-time streaming metrics (batch write on `agent_end` only)
- Encryption at rest
- Multi-node shared storage (single-instance plugin assumption)

## Decisions

1. **Filesystem over database**: Use Node.js `fs/promises` with Markdown/JSON files rather than SQLite or external DB. Rationale: aligns with OpenClaw's Markdown Memory philosophy, zero external dependencies, trivial to inspect and debug. Alternative (SQLite) rejected due to dependency overhead and schema migration complexity.

2. **Always write to local METRICS regardless of output mode**: The `writeMetrics` method always persists to `workspace/METRICS/` as a fallback, then conditionally forwards to webhook or OTel. Rationale: ensures no data loss if external endpoints are unavailable. Alternative (skip local write when webhook is configured) rejected due to observability risk.

3. **Lazy directory creation via `mkdir(..., { recursive: true })`**: Directories are created on first write, not at constructor time. Rationale: avoids unnecessary I/O if Blackboard is instantiated but never used (e.g., all requests are `simple`).

4. **Console.error for I/O failures, never throw**: All Blackboard methods catch errors and log to stderr. Rationale: Blackboard is an observability layer, not a critical path — a failed metrics write must not crash a running Plan. Alternative (throw and let caller handle) rejected because every caller would need identical try/catch boilerplate.

5. **Cleanup reason differentiation**: `reset` and `restart` preserve PLANS (historical audit), `delete` wipes everything (uninstall), `disable` does nothing (re-enable continuity). Rationale: matches OpenClaw session extension cleanup semantics documented in PRD §7.6.

## Risks / Trade-offs

- **[Risk] Filesystem I/O latency on high-frequency tool calls** → Mitigation: writes are async and non-blocking; consider in-memory buffering if profiling reveals bottleneck (future enhancement)
- **[Risk] Disk space exhaustion from accumulated METRICS/PLANS** → Mitigation: document cleanup recommendation; consider retention policy in future version
- **[Risk] Webhook/OTel endpoint unavailability causes silent failures** → Mitigation: errors are logged to console.error; local METRICS file always written as fallback
- **[Risk] Concurrent writes to same taskId file** → Mitigation: OpenClaw's concurrency control (`maxConcurrency`) limits parallel subagents; filesystem writes from same process are naturally serialized by Node.js event loop

## Migration Plan

N/A — greenfield module. No existing data to migrate.

## Open Questions

- Should `writeResult` support append mode for incremental tool call results within a single task? (Current design: overwrite — each `after_tool_call` overwrites the file with the latest result.)
- Should `aggregateResults` include skipped tasks with a placeholder? (Current design: omitted from output.)
