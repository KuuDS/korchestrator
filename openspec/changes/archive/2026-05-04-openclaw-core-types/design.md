## Context

The korchestrator project is a greenfield OpenClaw plugin. There are currently no source files, no `package.json`, and no `tsconfig.json`. The PRD defines a complete set of data structures in §5 and a plugin configuration schema in §5.3 / §6.1. These types are referenced by every other module in the system. This change must be implemented first so that downstream modules (Planner, TaskRouter, Replanner, Blackboard) can import from a single source of truth.

## Goals / Non-Goals

**Goals:**
- Define all core TypeScript interfaces in a single `src/types.ts` module
- Provide Zod schemas for every interface to enable runtime validation
- Ensure strict TypeScript compliance (no `any` types)
- Achieve >80% test coverage for schema validation logic
- Establish the type contract as a stable foundation for all downstream work

**Non-Goals:**
- Implementing the modules that consume these types (Planned in separate changes)
- Runtime business logic (classification, routing, replanning)
- OpenClaw hook implementations
- Plugin entrypoint (`src/index.ts`)

## Decisions

1. **Single `src/types.ts` file vs. per-module type files**: Consolidate all types into one file. Rationale: The type count is small (~6 interfaces + schemas), and a single file eliminates import cycle risks. If the type surface grows beyond 20+ interfaces, we can split into `src/types/plan.ts`, `src/types/config.ts`, etc. in a future refactoring.

2. **Zod over io-ts / class-validator**: Use Zod for runtime validation. Rationale: Zod is the most popular TypeScript schema library, has excellent type inference (`z.infer<typeof Schema>`), and is already referenced in the PRD (planner.ts uses `z`). Alternative (io-ts) rejected due to more verbose API and smaller community.

3. **String literal unions over enums**: Use `"pending" | "running" | "done" | "failed" | "skipped"` instead of `enum TaskStatus`. Rationale: string literal unions are more ergonomic in TypeScript, serialize naturally to JSON without numeric indirection, and align with the PRD's interface definitions. Enums would require extra import boilerplate.

4. **Optional fields with explicit undefined vs. missing keys**: Use optional syntax (`startedAt?: number`) rather than explicit `undefined` union. Rationale: matches PRD exactly, produces cleaner JSON serialization, and is the TypeScript convention for optional properties.

5. **`_retryCount` as optional number**: Include `_retryCount?: number` on Task interface. Rationale: PRD §11 (2024-05-02 revision) explicitly added this field to eliminate `(task as any)` casts. The underscore prefix signals internal/private usage.

## Risks / Trade-offs

- **[Risk] Type changes after downstream modules are built require cascading updates** → Mitigation: Types are derived directly from PRD §5 which has been finalized. Any PRD revision must be reflected here first.
- **[Risk] Zod schema and TypeScript interface drift** → Mitigation: Use `z.infer<typeof Schema>` to derive the TypeScript interface from the Zod schema, ensuring a single source of truth. Where `z.infer` is insufficient (e.g., JSDoc comments), keep interface and schema adjacent in the same file.
- **[Risk] Overly strict schemas reject valid LLM outputs** → Mitigation: Schemas match PRD exactly. LLM output validation failures are handled by caller (Planner falls back to single-task plan).

## Migration Plan

N/A — greenfield. No existing code to migrate.

## Open Questions

- Should `PluginConfig` include OpenClaw-specific fields (e.g., `hooks.allowConversationAccess`) or only the plugin's custom config? (Current design: only custom config fields as defined in PRD §5.3.)
- Should Zod schemas include custom error messages for better debugging? (Current design: default Zod messages; can enhance if needed.)
