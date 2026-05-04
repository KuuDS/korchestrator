## 1. Setup

- [x] 1.1 Initialize `package.json` with project metadata and `zod` dependency
- [x] 1.2 Create `tsconfig.json` with strict mode, target `es2022`, module `NodeNext`
- [x] 1.3 Create `src/types.ts` file with module header and import statements

## 2. Core Interface Definitions

- [x] 2.1 Define `Task` interface with all fields from PRD §5.1
- [x] 2.2 Define `Plan` interface with all fields from PRD §5.1
- [x] 2.3 Define `AgentRole` interface with all fields from PRD §5.1
- [x] 2.4 Define `RepairDecision` interface with all fields from PRD §5.2
- [x] 2.5 Define `HealthCheck` interface with all fields from PRD §5.2
- [x] 2.6 Define `PluginConfig` interface with all fields from PRD §5.3 / §6.1

## 3. Zod Schema Definitions

- [x] 3.1 Create `TaskSchema` Zod object matching Task interface with skill enum validation
- [x] 3.2 Create `PlanSchema` Zod object matching Plan interface
- [x] 3.3 Create `AgentRoleSchema` Zod object matching AgentRole interface
- [x] 3.4 Create `RepairDecisionSchema` Zod object matching RepairDecision interface
- [x] 3.5 Create `HealthCheckSchema` Zod object matching HealthCheck interface
- [x] 3.6 Create `PluginConfigSchema` Zod object matching PluginConfig interface with conditional validation for webhook/otel URLs
- [x] 3.7 Derive TypeScript types from Zod schemas using `z.infer<>` and verify compatibility with hand-written interfaces

## 4. Unit Tests

- [x] 4.1 Write tests for `TaskSchema` covering valid tasks and invalid skill values
- [x] 4.2 Write tests for `PlanSchema` covering valid plans and invalid status values
- [x] 4.3 Write tests for `AgentRoleSchema` covering valid roles and missing required fields
- [x] 4.4 Write tests for `RepairDecisionSchema` covering all strategy values
- [x] 4.5 Write tests for `HealthCheckSchema` covering valid and empty failedTasks
- [x] 4.6 Write tests for `PluginConfigSchema` covering valid config, invalid maxConcurrency, and missing webhook URL
- [x] 4.7 Write tests verifying inferred types are assignable to hand-written interfaces

## 5. Validation

- [x] 5.1 Run unit tests and ensure >80% coverage for `src/types.ts`
- [x] 5.2 Run `tsc --noEmit` to verify strict mode compliance with zero errors
- [x] 5.3 Run `openspec status --change openclaw-core-types` to verify artifact completeness
