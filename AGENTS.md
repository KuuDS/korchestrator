# AGENTS.md — korchestrator

## What this is

An **OpenClaw plugin** that implements the **Plan-Task-Build** multi-agent orchestration pattern.
It decomposes complex user requests into sub-tasks, routes them to specialized subagents
(Researcher / Coder / BrowserOperator / Reviewer), and dynamically replans on failure.

## Source of truth

- **Full PRD / spec**: `docs/openclaw-plan-task-build-prd.md` — contains exact data structures,
  hook mappings, module interfaces, and directory layout. Read it before any implementation work.

## Architecture (from PRD)

- **Hook-based, zero-core-invasion** — all logic lives in OpenClaw plugin hooks
  (`before_agent_reply`, `before_prompt_build`, `subagent_delivery_target`,
  `before_agent_finalize`, `before_tool_call`, `after_tool_call`, `agent_end`)
- **Core modules**: `Planner` → `TaskRouter` → `Replanner` + `Blackboard`
- **Session state** persisted via `registerSessionExtension("plan_state")`
- **Turn injection** via `enqueueNextTurnInjection()` for cross-turn context

## Repo state

- **Greenfield** — no `package.json`, `tsconfig.json`, or source files yet.
- Expected entrypoint: `src/index.ts` exporting `definePluginEntry({ id: "plan-subagent", ... })`
- Expected package name: `openclaw-plugin-plan-subagent`
- Target build output: `dist/index.js` (see PRD §8 plugin.json)

## Toolchain to set up

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

## Conventions

- All async operations need `try/catch` (PRD §10.2)
- No `any` types in production code (PRD §10.2)
- `workspace/` and `PLANS/` are gitignored (runtime artifact directories for Blackboard)
- Plugin config lives in `plugin.json` (see PRD §8 for schema)
