## 1. Setup

- [ ] 1.1 Create `src/router.ts` module file with TaskRouter class skeleton
- [ ] 1.2 Define `AgentRole`, `Task`, `Plan` interfaces in `src/types.ts` (if not already present)
- [ ] 1.3 Export TaskRouter and defaultRoles from `src/router.ts`

## 2. Core TaskRouter Implementation

- [ ] 2.1 Implement `constructor(config: { maxConcurrency: number; agentPool: AgentRole[] })`
- [ ] 2.2 Implement `getReadyTasks(plan: Plan): Task[]` — filter pending tasks with all dependencies satisfied
- [ ] 2.3 Implement `routeBySkill(task: Task): AgentRole` — three-tier matching (exact → intersection → fallback)
- [ ] 2.4 Implement `checkConcurrency(plan: Plan): { block: boolean; reason?: string }` — check running count against maxConcurrency
- [ ] 2.5 Implement `spawnTask(plan: Plan, task: Task): Promise<AgentRole>` — verify ready, route, mark running, return agent
- [ ] 2.6 Implement `trackLifecycle(event: LifecycleEvent): Promise<void>` — handle spawned/ended events, update taskRunMap and status
- [ ] 2.7 Implement `hasMoreWork(plan: Plan): boolean` — check for pending or running tasks
- [ ] 2.8 Implement `getProgress(plan: Plan): Progress` — return task counts by status

## 3. Hook Integration

- [ ] 3.1 Register `subagent_delivery_target` hook (priority 70) to call `routeBySkill()`
- [ ] 3.2 Register `subagent_spawning` hook (priority 70) to call `checkConcurrency()` and mark tasks as running
- [ ] 3.3 Register `subagent_spawned` hook (priority 50) to call `trackLifecycle({ type: "spawned" })`
- [ ] 3.4 Register `subagent_ended` hook (priority 50) to call `trackLifecycle({ type: "ended" })`
- [ ] 3.5 Wire TaskRouter instance into `src/index.ts` plugin entry

## 4. Testing

- [ ] 4.1 Create `tests/router.test.ts` with unit tests for `getReadyTasks()`
- [ ] 4.2 Add unit tests for `routeBySkill()` — exact match, partial match, fallback scenarios
- [ ] 4.3 Add unit tests for `checkConcurrency()` — at limit, below limit, queue progression
- [ ] 4.4 Add unit tests for `spawnTask()` — valid dispatch, invalid task state
- [ ] 4.5 Add unit tests for `trackLifecycle()` — spawned and ended events
- [ ] 4.6 Add unit tests for `getProgress()` and `hasMoreWork()`
- [ ] 4.7 Add unit tests for invalid status transition rejection
- [ ] 4.8 Ensure >80% test coverage for router module

## 5. Documentation

- [ ] 5.1 Add JSDoc comments to all public TaskRouter methods
- [ ] 5.2 Document the skill matching algorithm in `src/router.ts`
- [ ] 5.3 Update README with Task Router configuration options
