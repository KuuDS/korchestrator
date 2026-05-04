## Context

The configuration module is a cross-cutting concern that affects every other module in the Plan-Subagent plugin. It runs at the highest hook priority (90) to ensure all downstream modules receive validated configuration before they initialize. The current codebase is greenfield — no existing configuration system exists. The PRD (§3.5, §5.3, §7.1) defines the required configuration parameters, validation rules, and hot-reload behavior.

Key constraints:
- Zero core invasion — all logic must live in plugin hooks
- Active Plans must not be interrupted during config reload
- Invalid configurations must be rejected without breaking the running system
- All async operations must have try/catch (PRD §10.2)
- No `any` types in production code (PRD §10.2)

## Goals / Non-Goals

**Goals:**
- Validate all configuration changes using Zod schemas before applying them
- Support hot-reloading of configuration without gateway restart
- Protect active Plan executions from config reload disruption
- Apply differentiated reload strategies based on which parameter changed
- Cache validated configuration for runtime performance
- Provide clear error logging when invalid configurations are rejected

**Non-Goals:**
- Configuration UI or editor (handled by OpenClaw Control UI)
- Remote configuration fetching (only local file watching)
- Configuration encryption or secrets management
- Multi-tenant configuration isolation

## Decisions

1. **Zod over JSON Schema or manual validation** — Zod provides both runtime validation and TypeScript type inference, eliminating the need to maintain separate type definitions and validation logic. Alternative: `ajv` with JSON Schema — rejected because Zod produces more readable error messages and integrates better with TypeScript strict mode.

2. **File watcher over polling** — Using `fs.watch()` or `chokidar` for file change detection is more efficient than polling. Alternative: poll every 5 seconds — rejected because it adds unnecessary CPU overhead and latency.

3. **gateway_stop → gateway_start sequence for reload** — Reusing existing lifecycle hooks ensures consistent initialization and cleanup behavior. Alternative: direct module reinitialization — rejected because it bypasses cleanup logic and could leak resources.

4. **Retain old config on validation failure** — If a new config fails validation, keep the old config running and log errors. Alternative: crash or disable plugin — rejected because it would disrupt active Plans and create poor user experience.

5. **Immediate effect for model/concurrency/role changes** — These parameters affect future operations and don't require active Plan interruption. Alternative: queue changes until all Plans complete — rejected because it adds unnecessary complexity; new Plans naturally pick up new config.

6. **Clear rule cache on classificationRules change** — The L1 rule cache must be invalidated when rules change to prevent stale matches. Alternative: incremental cache updates — rejected because regex pattern changes are hard to diff incrementally; full clear is simpler and safe.

## Risks / Trade-offs

- **[Risk] File watcher reliability** — `fs.watch()` is known to be unreliable across platforms (macOS FSEvents, Linux inotify). → **Mitigation**: Use `chokidar` library for cross-platform consistency, or implement polling fallback.

- **[Risk] Config reload race conditions** — A reload could occur while a Plan is being created with old config values. → **Mitigation**: Config is read at Plan creation time from the cached config object; reload only replaces the cache reference for future operations.

- **[Risk] Invalid config silently ignored** — If logging is misconfigured, invalid config rejections might go unnoticed. → **Mitigation**: Always log validation errors at `error` level, include full error details, and expose via `heartbeat_prompt_contribution` if possible.

- **[Risk] Large agentRoles arrays cause reload delay** — Complex role definitions with many skills could slow down validation. → **Mitigation**: Zod validation is fast for typical arrays (<100 items). Monitor if this becomes an issue.

## Migration Plan

N/A — this is a new module in a greenfield project. No migration required.

## Open Questions

1. Should the file watcher watch `plugin.json` only, or also support `.env` or other config sources?
2. What is the debounce interval for file change detection? (Suggested: 300ms)
3. Should config changes trigger a `heartbeat_prompt_contribution` notification to the user?
