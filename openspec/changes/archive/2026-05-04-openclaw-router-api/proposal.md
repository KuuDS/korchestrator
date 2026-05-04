## Why

The Plan-Task-Build orchestration pattern requires a robust mechanism to route decomposed tasks to the most appropriate Subagent based on skill requirements. Currently, the korchestrator plugin has no formalized Task Router module API, leaving a gap between Plan generation (Planner) and task execution (Build). This change establishes the Task Router as a first-class module with a well-defined public API, enabling skill-based routing, concurrency control, dependency resolution, and lifecycle tracking.

## What Changes

- Create `TaskRouter` class with public API methods: `routeBySkill()`, `getReadyTasks()`, `checkConcurrency()`, `spawnTask()`, `trackLifecycle()`
- Define 4 standard agent roles (researcher, coder, browser, reviewer) with predefined skill sets and model assignments
- Implement concurrency control with default limit of 3 concurrent subagents
- Add dependency resolution logic to filter ready tasks before routing
- Implement lifecycle tracking for task state transitions (pending → running → done/failed/skipped)
- Register `subagent_delivery_target`, `subagent_spawning`, `subagent_spawned`, and `subagent_ended` hooks

## Capabilities

### New Capabilities

- `task-routing`: Skill-based task-to-agent matching with exact, intersection, and fallback strategies
- `concurrency-control`: Configurable concurrent subagent execution limiting with queue management
- `lifecycle-tracking`: Task state transition management and runId→taskId mapping persistence

### Modified Capabilities

- `task`: Extends existing Task Router spec with new public API methods (`spawnTask`, `trackLifecycle`) and formalizes the TaskRouter class interface from PRD §6.2

## Impact

- New source file: `src/router.ts` (TaskRouter module)
- New test file: `tests/router.test.ts`
- Affects hook registrations in `src/index.ts` for `subagent_delivery_target` (priority 70), `subagent_spawning` (priority 70), `subagent_spawned` (priority 50), `subagent_ended` (priority 50)
- Depends on `Plan` and `Task` types from `src/types.ts`
- Integrates with Session Extension (`plan_state`) for state persistence
- No breaking changes to existing Planner or Replanner APIs
