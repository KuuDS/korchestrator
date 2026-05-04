## Context

The Planner module is the entry point of the Plan-Task-Build orchestration pipeline. It runs inside the OpenClaw plugin lifecycle and must interact with the OpenClaw Plugin SDK to register hooks, persist session state, and inject prompt context. The current codebase is greenfield — no existing Planner implementation exists. The PRD (§3.1, §5.1, §6.1, §7.2) defines the required behavior, data structures, and API surface.

Key constraints:
- Zero core invasion — all logic must live in plugin hooks
- All async operations must have try/catch (PRD §10.2)
- No `any` types in production code (PRD §10.2)
- TypeScript strict mode, target `es2022`, module `NodeNext`

## Goals / Non-Goals

**Goals:**
- Implement a robust 3-tier complexity classification system (L1 rule cache, L2 LLM, L3 fallback)
- Decompose complex requests into validated DAG task plans
- Persist plan state across conversation turns via Session Extensions
- Inject plan context into prompts for immediate or deferred execution
- Provide comprehensive error handling with safe fallbacks

**Non-Goals:**
- Task execution or routing (handled by TaskRouter module)
- Dynamic replanning on failure (handled by Replanner module)
- Result aggregation or metrics collection (handled by Blackboard module)
- UI rendering of plan progress (handled by Control UI via `pluginExtensions`)

## Decisions

1. **L1 rule cache uses RegExp patterns, not ML** — Simple regex matching is sufficient for common greetings and short queries. This avoids LLM latency/cost for 80%+ of user requests. Alternative: lightweight classifier model — rejected due to added dependency and no clear accuracy gain for this use case.

2. **Zod over JSON Schema or manual parsing** — Zod provides runtime validation with TypeScript inference, reducing boilerplate. Alternative: `ajv` with JSON Schema — rejected because Zod integrates better with TypeScript strict mode and produces more readable error messages.

3. **Single-task fallback on decomposition failure** — When LLM returns invalid JSON or fails schema validation, create a single-task plan with the original request as description and `code` skill. Alternative: retry with different prompt — rejected because retry loops add latency and the single-task plan is functionally equivalent for most cases.

4. **Scheme A (direct execution) as default** — Plan context is injected into the current turn via `before_prompt_build` without returning `syntheticReply`. Alternative: Scheme B (user confirmation) — rejected because it creates a "fake start" experience where the user must type "continue" before any work begins.

5. **Task ID format `task_NNN`** — Enforced via Zod regex `^task_[0-9]+$`. This provides human-readable IDs that sort naturally and are easy to reference in dependencies. Alternative: UUID — rejected because UUIDs are harder to debug and reference in logs/dependencies.

## Risks / Trade-offs

- **[Risk] LLM classification latency** — L2 LLM call adds ~500-2000ms to every non-cached request. → **Mitigation**: L1 rule cache catches common simple requests with zero LLM overhead. `skipClassification` config allows power users to bypass entirely.

- **[Risk] LLM generates invalid task decomposition** — LLM may hallucinate invalid skills, circular dependencies, or malformed JSON. → **Mitigation**: Zod schema validation + DAG validation + single-task fallback on any validation failure.

- **[Risk] Session Extension data size** — Large plans with many tasks could bloat session state. → **Mitigation**: `maxTasks` config (default 10) limits plan size. Future: plan compression or Blackboard offloading.

- **[Risk] OpenClaw SDK API changes** — `registerSessionExtension` and `enqueueNextTurnInjection` are relatively new APIs. → **Mitigation**: Wrap all SDK calls in try/catch, provide graceful degradation, monitor OpenClaw changelog.

## Migration Plan

N/A — this is a new module in a greenfield project. No migration required.

## Open Questions

1. Should L1 rule cache support hot-reloading of rules without gateway restart? (PRD §3.5 suggests config hot-reload covers this)
2. What is the maximum acceptable latency for L2 classification? (Need benchmark after implementation)
3. Should `toMarkdown()` include task results or only task descriptions? (PRD shows only descriptions + status)
