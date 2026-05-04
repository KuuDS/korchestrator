## Why

The korchestrator plugin registers 12+ hooks across the OpenClaw Gateway lifecycle (PRD §4.2, lines 227-243). Without formal TypeScript contracts, hook handler signatures, return types, and priority levels are scattered across implementation files, leading to type inconsistencies, missed return values, and silent runtime errors. Defining centralized hook contracts ensures type safety, enables IDE autocomplete, and provides a single source of truth for all hook registrations.

## What Changes

- Create a new `src/contracts/hooks.ts` module defining TypeScript interfaces for all 12 hooks
- Define handler signatures, context requirements, return types, and priority levels per PRD §4.2
- Provide both sync and async variants where applicable
- Export typed helper functions for hook registration (`registerHook`, `createHookRegistry`)
- Add type-level tests to verify contract completeness
- **No breaking changes** — this is a new contract module; existing code can adopt incrementally

## Capabilities

### New Capabilities
- `hook-definitions`: TypeScript interfaces and types for all OpenClaw hooks used by the plugin, including handler signatures, return types, priority levels, and context requirements

### Modified Capabilities
- None — this is a pure type-definition addition with no spec-level behavior changes to existing capabilities

## Impact

- **All hook registration sites**: Will import types from `src/contracts/hooks.ts` instead of using inline `any` or implicit types
- **Plugin entrypoint**: Will use typed `registerHook()` helper for all `api.on()` calls
- **Test suite**: New type-level tests verifying all 12 hooks have defined contracts
- **Dependencies**: Requires OpenClaw Plugin SDK type definitions (already a project dependency)
