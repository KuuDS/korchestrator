## 1. Setup

- [x] 1.1 Create `src/contracts/hooks.ts` module file
- [x] 1.2 Create `tests/hooks.test.ts` type-level test file
- [x] 1.3 Define base context types: `HookContext`, `SessionContext`, `PlanContext`

## 2. Event Type Definitions

- [x] 2.1 Define `GatewayEvent` interface with config and API reference
- [x] 2.2 Define `BeforeAgentReplyEvent` interface with user request and session
- [x] 2.3 Define `BeforePromptBuildEvent` interface with session and plan state
- [x] 2.4 Define `SubagentDeliveryTargetEvent` interface with task and agent pool
- [x] 2.5 Define `SubagentSpawningEvent` interface with runId and concurrency state
- [x] 2.6 Define `BeforeAgentFinalizeEvent` interface with plan and task statuses
- [x] 2.7 Define `BeforeToolCallEvent` interface with tool name, params, and runId
- [x] 2.8 Define `AfterToolCallEvent` interface with result, error, and duration
- [x] 2.9 Define `SubagentSpawnedEvent` interface with runId and taskId
- [x] 2.10 Define `SubagentEndedEvent` interface with runId, result, and duration
- [x] 2.11 Define `HeartbeatPromptContributionEvent` interface with plan summary
- [x] 2.12 Define `AgentEndEvent` interface with execution metrics

## 3. Hook Handler Interfaces

- [x] 3.1 Define `GatewayStartHook` handler type (priority 90, void return)
- [x] 3.2 Define `GatewayStopHook` handler type (priority 90, void return)
- [x] 3.3 Define `BeforeAgentReplyHook` handler type (priority 80, syntheticReply return)
- [x] 3.4 Define `BeforePromptBuildHook` handler type (priority 70, prependContext return)
- [x] 3.5 Define `SubagentDeliveryTargetHook` handler type (priority 70, targetAgentId return)
- [x] 3.6 Define `SubagentSpawningHook` handler type (priority 70, block/reason return)
- [x] 3.7 Define `BeforeAgentFinalizeHook` handler type (priority 60, action return)
- [x] 3.8 Define `BeforeToolCallHook` handler type (priority 50, params/block/approval return)
- [x] 3.9 Define `AfterToolCallHook` handler type (priority 50, void return)
- [x] 3.10 Define `SubagentSpawnedHook` handler type (priority 50, void return)
- [x] 3.11 Define `SubagentEndedHook` handler type (priority 50, void return)
- [x] 3.12 Define `HeartbeatPromptContributionHook` handler type (priority 40, contribution return)
- [x] 3.13 Define `AgentEndHook` handler type (no priority, void return)

## 4. Registry and Helpers

- [x] 4.1 Define `HookName` union type with all 12 hook names
- [x] 4.2 Define `HookPriority` union type with allowed values: `90 | 80 | 70 | 60 | 50 | 40`
- [x] 4.3 Define `HookRegistry` mapped type mapping hook names to handler interfaces
- [x] 4.4 Define `registerHook()` generic helper function
- [x] 4.5 Define `createHookRegistry()` factory function

## 5. Type-Level Testing

- [x] 5.1 Write type-level test verifying all 12 hooks are in `HookName`
- [x] 5.2 Write type-level test verifying `HookPriority` rejects invalid values
- [x] 5.3 Write type-level test verifying `HookRegistry[K]` matches expected handler for each hook
- [x] 5.4 Write type-level test verifying `registerHook()` enforces correct signature
- [x] 5.5 Write runtime test verifying exported types are accessible
- [x] 5.6 Verify TypeScript compilation passes (`npm run typecheck`)

## 6. Documentation

- [x] 6.1 Add JSDoc to each hook interface referencing PRD §4.2
- [x] 6.2 Add JSDoc to `HookPriority` with allowed values
- [x] 6.3 Add JSDoc to `registerHook()` with usage example
- [x] 6.4 Verify no `any` types in contract definitions
