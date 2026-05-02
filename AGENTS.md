# AGENTS.md — korchestrator

## What this is

An **OpenClaw plugin** implementing the **Plan-Task-Build** multi-agent orchestration pattern.
It decomposes complex requests into sub-tasks, routes them to specialized Subagents
(Researcher / Coder / BrowserOperator / Reviewer), and dynamically replans on failure.

## Source of truth

- **Full PRD / spec**: `docs/openclaw-plan-task-build-prd.md` — exact data structures, hook mappings, module interfaces, and directory layout. Read before any implementation work.

## Architecture (from PRD)

- **Hook-based, zero-core-invasion** — all logic lives in OpenClaw plugin hooks with assigned priorities:
  - `before_agent_reply` (priority 80) — complexity detection + Plan generation
  - `before_prompt_build` (priority 70) — Plan context injection
  - `subagent_delivery_target` (priority 70) — Task → Subagent routing
  - `before_agent_finalize` (priority 60) — revise/finalize decision
  - `before_tool_call` / `after_tool_call` (priority 50) — interception / result collection
  - `agent_end` — metrics logging
- **Core modules**: `Planner` → `TaskRouter` → `Replanner` + `Blackboard`
- **Session state** persisted via `registerSessionExtension("plan_state")`
- **Turn injection** via `enqueueNextTurnInjection()` for cross-turn context

## Repo state

- **Greenfield** — no `package.json`, `tsconfig.json`, or source files yet.
- Expected entrypoint: `src/index.ts` exporting `definePluginEntry({ id: "plan-subagent", ... })`
- Expected package name: `openclaw-plugin-plan-subagent`
- Target build output: `dist/index.js` (see PRD §8 plugin.json)

## Toolchain (planned)

1. TypeScript (strict mode, target `es2022`, module `NodeNext`)
2. Test runner — Vitest or Jest (PRD §9 expects unit + integration tests, >80% coverage)
3. Build step — `tsc` or `tsup` to emit `dist/`
4. Recommended scripts once `package.json` exists:
   - `npm run build` → compile to `dist/`
   - `npm run test` → unit tests
   - `npm run test:integration` → integration tests
   - `npm run lint` → ESLint or `tsc --noEmit`
   - `npm run typecheck` → `tsc --noEmit`

## OpenCode / CI

- GitHub Actions workflow: `.github/workflows/opencode.yml`
- Triggered by comments containing `/oc` or `/opencode` on issues and PR review comments
- Uses model `kimi-for-coding/k2p6`
- Local OpenCode config: `.opencode.json` (enables `omo-slim` plugin)

## Conventions

- All async operations need `try/catch` (PRD §10.2)
- No `any` types in production code (PRD §10.2)
- `workspace/` and `PLANS/` are gitignored (runtime artifact directories for Blackboard)
- Plugin config lives in `plugin.json` (see PRD §8 for schema)
