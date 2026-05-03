## 1. Setup

- [ ] 1.1 Initialize `package.json` with project metadata and `zod` dependency
- [ ] 1.2 Create `tsconfig.json` with strict mode, target `es2022`, module `NodeNext`
- [ ] 1.3 Create `src/types.ts` file with module header and import statements

## 2. Core Interface Definitions

- [ ] 2.1 Define `Task` interface with all fields from PRD §5.1
- [ ] 2.2 Define `Plan` interface with all fields from PRD §5.1
- [ ] 2.3 Define `AgentRole` interface with all fields from PRD §5.1
- [ ] 2.4 Define `RepairDecision` interface with all fields from PRD §5.2
- [ ] 2.5 Define `HealthCheck` interface with all fields from PRD §5.2
- [ ] 2.6 Define `PluginConfig` interface with all fields from PRD §5.3 / §6.1

## 3. Zod Schema Definitions

- [ ] 3.1 Create `TaskSchema` Zod object matching Task interface with skill enum validation
- [ ] 3.2 Create `PlanSchema` Zod object matching Plan interface
- [ ] 3.3 Create `AgentRoleSchema` Zod object matching AgentRole interface
- [ ] 3.4 Create `RepairDecisionSchema` Zod object matching RepairDecision interface
- [ ] 3.5 Create `HealthCheckSchema` Zod object matching HealthCheck interface
- [ ] 3.6 Create `PluginConfigSchema` Zod object matching PluginConfig interface with conditional validation for webhook/otel URLs
- [ ] 3.7 Derive TypeScript types from Zod schemas using `z.infer<>` and verify compatibility with hand-written interfaces

## 4. Unit Tests

- [ ] 4.1 Write tests for `TaskSchema` covering valid tasks and invalid skill values
- [ ] 4.2 Write tests for `PlanSchema` covering valid plans and invalid status values
- [ ] 4.3 Write tests for `AgentRoleSchema` covering valid roles and missing required fields
- [ ] 4.4 Write tests for `RepairDecisionSchema` covering all strategy values
- [ ] 4.5 Write tests for `HealthCheckSchema` covering valid and empty failedTasks
- [ ] 4.6 Write tests for `PluginConfigSchema` covering valid config, invalid maxConcurrency, and missing webhook URL
- [ ] 4.7 Write tests verifying inferred types are assignable to hand-written interfaces

## 5. Validation

- [ ] 5.1 Run unit tests and ensure >80% coverage for `src/types.ts`
- [ ] 5.2 Run `tsc --noEmit` to verify strict mode compliance with zero errors
- [ ] 5.3 Run `openspec status --change openclaw-core-types` to verify artifact completeness
