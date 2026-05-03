## Why

The Plan-Subagent plugin requires a robust configuration system to manage runtime settings including LLM model selections, concurrency limits, agent role definitions, and classification rules. Without a centralized configuration system with validation and hot-reload support, the plugin would require full gateway restarts for any config change, interrupting active plan executions and creating poor operational experience. This change establishes the configuration module that enables zero-downtime configuration updates while protecting active plans from disruption.

## What Changes

- Create configuration module with Zod schema validation for all plugin settings
- Implement `gateway_start` / `gateway_stop` hook lifecycle for config loading and cleanup
- Add file watcher for configuration change detection (e.g., `plugin.json` modifications)
- Implement differentiated reload strategy based on which config parameter changed
- Add config caching for runtime performance
- Implement invalid config rejection with fallback to previous valid config
- Add structured logging for all config lifecycle events

## Capabilities

### New Capabilities
- `plugin-config`: Lifecycle hook management, change detection, differentiated reload, and Zod schema validation for the Plan-Subagent plugin configuration system.

### Modified Capabilities
- (none — this is a new capability with no existing spec modifications)

## Impact

- Affected files: `src/config.ts`, `src/index.ts` (plugin entry wiring)
- Affected hooks: `gateway_start` (priority 90), `gateway_stop` (priority 90)
- Dependencies: Zod for schema validation, `fs` module for file watching, OpenClaw Plugin SDK
- Downstream impact: Planner, TaskRouter, Replanner, and Blackboard all consume validated config
- Test coverage: New unit tests required for config validation, hot-reload, and fallback behavior
