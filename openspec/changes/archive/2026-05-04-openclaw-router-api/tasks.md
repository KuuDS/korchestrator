## 1. Setup

- [x] 1.1 Create `src/router.ts` module file with TaskRouter class skeleton
- [x] 1.2 Define `AgentRole`, `Task`, `Plan` interfaces in `src/types.ts` (if not already present)
- [x] 1.3 Export TaskRouter and defaultRoles from `src/router.ts`

## 2. Core TaskRouter Implementation

- [x] 2.1 Implement `constructor(config: { maxConcurrency: number; agentPool: AgentRole[] })`
- [x] 2.2 Implement `getReadyTasks(plan: Plan): Task[]` — filter pending tasks with all dependencies satisfied
- [x] 2.3 Implement `routeBySkill(task: Task): AgentRole` — three-tier matching (exact → intersection → fallback)
- [x] 2.4 Implement `checkConcurrency(plan: Plan): { block: boolean; reason?: string }` — check running count against maxConcurrency
- [x] 2.5 Implement `spawnTask(plan: Plan, task: Task): Promise<AgentRole>` — verify ready, route, mark running, return agent
- [x] 2.6 Implement `trackLifecycle(event: LifecycleEvent): Promise<void>` — handle spawned/ended events, update taskRunMap and status
- [x] 2.7 Implement `hasMoreWork(plan: Plan): boolean` — check for pending or running tasks
- [x] 2.8 Implement `getProgress(plan: Plan): Progress` — return task counts by status

## 3. Hook Integration

- [x] 3.1 Register `subagent_delivery_target` hook (priority 70) to call `routeBySkill()`
- [x] 3.2 Register `subagent_spawning` hook (priority 70) to call `checkConcurrency()` and mark tasks as running
- [x] 3.3 Register `subagent_spawned` hook (priority 50) to call `trackLifecycle({ type: "spawned" })`
- [x] 3.4 Register `subagent_ended` hook (priority 50) to call `trackLifecycle({ type: "ended" })`
- [x] 3.5 Wire TaskRouter instance into `src/index.ts` plugin entry

## 4. Testing

- [x] 4.1 Create `tests/router.test.ts` with unit tests for `getReadyTasks()`
- [x] 4.2 Add unit tests for `routeBySkill()` — exact match, partial match, fallback scenarios
- [x] 4.3 Add unit tests for `checkConcurrency()` — at limit, below limit, queue progression
- [x] 4.4 Add unit tests for `spawnTask()` — valid dispatch, invalid task state
- [x] 4.5 Add unit tests for `trackLifecycle()` — spawned and ended events
- [x] 4.6 Add unit tests for `getProgress()` and `hasMoreWork()`
- [x] 4.7 Add unit tests for invalid status transition rejection
- [x] 4.8 Ensure >80% test coverage for router module

## 5. Documentation

- [x] 5.1 Add JSDoc comments to all public TaskRouter methods
- [x] 5.2 Document the skill matching algorithm in `src/router.ts`
- [ ] 5.3 Update README with Task Router configuration options
