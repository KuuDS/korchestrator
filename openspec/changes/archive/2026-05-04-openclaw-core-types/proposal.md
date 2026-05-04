## Why

The Plan-Task-Build orchestration pipeline is being built as a greenfield TypeScript project with no existing type definitions. All core modules — Planner, TaskRouter, Replanner, and Blackboard — depend on shared data structures (Plan, Task, AgentRole, RepairDecision, HealthCheck) and a unified plugin configuration interface. Without a centralized type system, each module would define its own incompatible interfaces, leading to type drift, brittle integrations, and maintenance overhead. Establishing core types first (PRD §5, §6.1) ensures type safety across the entire plugin and enables downstream modules to compile against a stable contract.

## What Changes

- Create `src/types.ts` containing all foundational TypeScript interfaces:
  - `Plan` — session extension state for plan execution (PRD §5.1)
  - `Task` — atomic subtask with skills, dependencies, and lifecycle status (PRD §5.1)
  - `AgentRole` — subagent role definition with skill set and model (PRD §5.1)
  - `RepairDecision` — replanner strategy selection (PRD §5.2)
  - `HealthCheck` — plan health assessment result (PRD §5.2)
  - `PluginConfig` — complete plugin configuration interface (PRD §6.1 / §5.3)
- Create Zod schemas for all interfaces to enable runtime validation of LLM outputs and plugin configuration
- Export all types and schemas from `src/types.ts` for consumption by other modules
- **BREAKING**: This change establishes the type contract that all subsequent module changes must adhere to. Any modification to these interfaces after downstream modules are implemented will require cascading updates.

## Capabilities

### New Capabilities
- `core-types`: Foundational TypeScript type definitions and Zod runtime validation schemas for the entire Plan-Task-Build plugin

### Modified Capabilities
- None — this is a foundational greenfield change. Existing specs (planner, task, config, monitor) reference these types but do not require behavioral changes.

## Impact

- **New file**: `src/types.ts` — central type definition module
- **New test file**: `tests/types.test.ts` — Zod schema validation tests
- **Dependencies**: `zod` package for runtime schema validation
- **Downstream impact**: All subsequent module implementations (planner, router, replanner, blackboard) import from `src/types.ts`
- **Build impact**: `tsconfig.json` must be configured with strict mode; no `any` types allowed in production code
