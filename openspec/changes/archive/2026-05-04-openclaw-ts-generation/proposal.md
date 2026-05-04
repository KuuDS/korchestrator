## Why

The korchestrator plugin defines rich data structures (Plan, Task, AgentRole, RepairDecision, etc.) in its PRD and specifications, but currently has no automated way to generate TypeScript interfaces and runtime validation schemas from these definitions. Manual type maintenance is error-prone and creates drift between spec requirements and implementation. This change introduces TypeScript code generation utilities that transpile spec definitions into TypeScript interfaces and Zod schemas, ensuring type parity and reducing maintenance burden.

## What Changes

- Create a spec-to-TypeScript transpiler that reads spec markdown files and generates `.ts` interface files
- Create a Zod schema generator that produces runtime validation schemas from type definitions
- Implement type parity validation to ensure generated types match spec requirements exactly
- Add `scripts/validate-types.ts` script for CI/type-checking integration
- Generate types for all PRD §5 data structures: Plan, Task, AgentRole, RepairDecision, HealthCheck, Progress, ExecutionMetrics

## Capabilities

### New Capabilities

- `spec-to-typescript`: Transpile spec markdown type definitions into TypeScript interfaces
- `zod-schema-generation`: Generate Zod schemas from TypeScript interfaces for runtime validation
- `type-parity-validation`: Validate that generated TypeScript types match spec requirements exactly

### Modified Capabilities

- None. This is a pure tooling addition with no runtime behavior changes.

## Impact

- New directory: `scripts/` containing `validate-types.ts`
- New directory: `src/codegen/` containing transpiler and generator modules
- New dev dependency: `zod` (if not already present)
- New npm script: `npm run validate-types` → `ts-node scripts/validate-types.ts`
- Generated files: `src/generated/types.ts`, `src/generated/schemas.ts` (gitignored or committed based on team preference)
- No runtime impact on plugin behavior
