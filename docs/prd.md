# PRD: Unify Plugin Entry Point for OpenClaw Compatibility

## 1. Overview

Refactor the `korchestrator` plugin entry point to align with OpenClaw's official plugin SDK contract (`definePluginEntry` with `register(api)`), eliminating the dual-entrypoint architecture and ensuring core hooks fire correctly in an OpenClaw runtime.

## 2. Changes Breakdown

| Change Name | Description | Dependencies | Priority |
|-------------|-------------|--------------|----------|
| unify-entrypoint-openclaw | Merge dual entrypoints into a single `definePluginEntry` conforming to OpenClaw SDK; fix hook return-value patterns; add `allowConversationAccess`; wire `registerSessionExtension` | none | P0 |

## 3. Dependency Graph

```
unify-entrypoint-openclaw (standalone, no deps)
```

## 4. Problem Analysis

### 4.1 Dual Entrypoints

Current state:
- `src/index.ts` — exports `definePluginEntry` returning `{ id, name, version, hooks[] }` for unit-test mock gateway
- `src/openclaw-entry.ts` — exports `register(api)` for actual OpenClaw loading
- Both contain parallel, slightly divergent hook handler logic

OpenClaw official contract:
- `import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry"`
- Returns `{ id, name, register(api) }`
- `api.on(hookName, handler, opts)` for hook registration

### 4.2 Hook Return-Value Mismatch

Current code mutates `event` / `ctx` objects:
```ts
event.prependContext = markdown;     // before_prompt_build
extendedCtx.action = "revise";       // before_agent_finalize
```

OpenClaw expects return values:
```ts
return { prependContext: markdown };
return { action: "revise", reason: "..." };
```

### 4.3 Missing `allowConversationAccess`

`before_agent_reply`, `before_prompt_build`, `before_agent_finalize`, `agent_end` are **raw conversation hooks**. Non-bundled plugins must declare `allowConversationAccess: true` or they are silently skipped.

### 4.4 `registerSessionExtension` is Stub

Plan state persistence relies on `session.data.plan_state` direct mutation instead of the official `api.registerSessionExtension("plan_state", ...)` API.

### 4.5 Handler Signature

Current: `api.on("hook", async (event, _ctx) => { ... })`
Official: `api.on("hook", async (event) => { ... })` — context is on `event.context`

## 5. Acceptance Criteria

- [ ] `src/index.ts` exports a `definePluginEntry` object with `register(api)` callback
- [ ] `src/openclaw-entry.ts` is removed or becomes a thin re-export
- [ ] All hook handlers return values instead of mutating event/context objects
- [ ] `allowConversationAccess: true` is declared where required
- [ ] `api.registerSessionExtension("plan_state", ...)` is wired in `register(api)`
- [ ] All existing unit tests pass
- [ ] Integration test Dockerfile references the correct entry path
- [ ] Build (`npm run build`) succeeds without errors

## 6. Open Questions / Risks

- **Risk:** `allowConversationAccess` exact declaration location (manifest vs entry object) needs verification
- **Risk:** Some hooks (`heartbeat_prompt_contribution`) are not confirmed in official docs — may need removal
- **Risk:** `api.registerSessionExtension` exact signature needs confirmation at implementation time
- **Risk:** `api.on()` may swallow return values for observation-only hooks — need to test which hooks accept decisions

## 7. Technical Constraints (from AGENTS.md)

- TypeScript strict mode, target `es2022`, module `NodeNext`
- All async operations need `try/catch`
- No `any` types in production code
- `workspace/` and `PLANS/` are gitignored
- Plugin config lives in `plugin.json`
