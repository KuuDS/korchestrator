## Context

The korchestrator plugin is a hook-based, zero-core-invasion OpenClaw plugin that registers handlers across 12+ extension points. Currently, hook signatures are inferred from usage or documented in comments. As the plugin grows, the risk of type mismatches (e.g., returning the wrong shape from `before_agent_reply`, forgetting the `priority` option) increases. A formal contract layer provides compile-time guarantees and serves as living documentation.

The PRD §4.2 (lines 227-243) documents all hooks with priorities, purposes, and return values. This design translates that documentation into executable TypeScript contracts.

## Goals / Non-Goals

**Goals:**
- Define TypeScript interfaces for all 12 hooks used by the plugin
- Capture handler signatures, return types, context requirements, and priority levels
- Support both sync and async handler variants
- Provide typed registration helpers to enforce contracts at the call site
- Enable compile-time detection of invalid hook registrations

**Non-Goals:**
- Runtime validation of hook return values (that belongs in the hook implementations)
- Wrapping or intercepting the OpenClaw `api.on()` function itself
- Defining contracts for hooks NOT used by this plugin (e.g., `on_message`, `on_file_upload`)
- Generating documentation from types (can be added later)

## Decisions

1. **Interface-per-hook vs. unified HookMap**
   - **Decision**: Define a separate interface for each hook (`BeforeAgentReplyHook`, `BeforeToolCallHook`, etc.) AND a unified `HookRegistry` type that maps hook names to their interfaces.
   - **Rationale**: Individual interfaces are readable and self-documenting. The registry enables generic registration helpers (`registerHook<K extends HookName>(name: K, handler: HookRegistry[K])`).
   - **Alternative considered**: Single massive `HookHandler` union type — rejected because it obscures which parameters belong to which hook.

2. **Async-first signatures with sync compatibility**
   - **Decision**: All hook handler types return `Promise<T> | T` (or just `T` for void hooks) using TypeScript union types.
   - **Rationale**: OpenClaw supports both sync and async handlers. A union type allows either without forcing `async` on simple handlers.
   - **Alternative considered**: Separate `SyncBeforeAgentReplyHook` and `AsyncBeforeAgentReplyHook` — rejected as overly verbose; TypeScript infers sync compatibility automatically.

3. **Context types derived from OpenClaw SDK**
   - **Decision**: Context types (`HookContext`, `SessionContext`) reference the OpenClaw Plugin SDK types rather than redefining them.
   - **Rationale**: Avoids drift when the SDK updates. Use `import type` to prevent circular dependencies.
   - **Alternative considered**: Inline context definitions — rejected due to maintenance burden.

4. **Priority as a const enum / literal union**
   - **Decision**: Define `HookPriority` as a union of specific numeric literals: `90 | 80 | 70 | 60 | 50 | 40`.
   - **Rationale**: Matches PRD §4.2 exactly. Prevents arbitrary priority values that could conflict with other plugins.
   - **Alternative considered**: `number` — rejected because it allows any value, defeating the purpose of a contract.

5. **Return type strictness**
   - **Decision**: Return types use exact object shapes (e.g., `{ syntheticReply?: string }` for `before_agent_reply`, `{ targetAgentId: string }` for `subagent_delivery_target`).
   - **Rationale**: Prevents returning extra properties that OpenClaw may ignore or misinterpret. Uses `undefined` return type for hooks that may return nothing.
   - **Alternative considered**: `Record<string, unknown>` — rejected as too permissive.

## Risks / Trade-offs

- **[Risk]** OpenClaw SDK type updates may break contract compatibility.
  - **Mitigation**: Use `import type` and pin SDK version in `package.json`. Add CI typecheck step.

- **[Risk]** Strict return types may reject valid but undocumented return shapes.
  - **Mitigation**: Start with PRD-documented shapes. Use `satisfies` operator for gradual adoption. Allow `undefined` return for all hooks.

- **[Risk]** 12 separate interfaces create boilerplate.
  - **Mitigation**: Use a mapped type (`HookRegistry`) for generic operations. Individual interfaces are only needed at definition time.

## Migration Plan

No migration required. This is a new contract module. Existing hook registrations can be gradually typed by importing from `src/contracts/hooks.ts`. The plugin entrypoint (`src/index.ts`) will be the primary adopter.

## Open Questions

- Should we include JSDoc comments on each interface for IDE hover documentation?
  - **Resolution**: Yes — include JSDoc with PRD reference (e.g., `@see PRD §4.2`).

- Should `agent_end` have a defined return type or remain `void`?
  - **Resolution**: `void` — PRD §4.2 marks it as "—" (no return value), and it's described as "fire-and-forget with 30s timeout protection".
