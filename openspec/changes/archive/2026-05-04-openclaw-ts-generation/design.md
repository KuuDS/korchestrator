## Context

The korchestrator PRD defines comprehensive TypeScript interfaces in §5 (Data Structures) and §6 (Module Interfaces). These interfaces are currently embedded in markdown documentation and inline code examples. Maintaining parity between spec definitions and implementation types is manual and error-prone. This change introduces automated code generation to bridge the gap.

## Goals / Non-Goals

**Goals:**
- Parse spec markdown files and extract type definitions into generated TypeScript interfaces
- Generate Zod schemas from type definitions for runtime validation (used by Planner's LLM response validation)
- Provide a validation script that fails CI when generated types drift from specs
- Support all PRD §5 data structures: Plan, Task, AgentRole, RepairDecision, HealthCheck, Progress, ExecutionMetrics

**Non-Goals:**
- Generate implementation code (methods, classes, business logic)
- Generate types for external dependencies (OpenClaw Plugin SDK types)
- Support non-TypeScript output languages
- Real-time code generation during plugin runtime

## Decisions

1. **Markdown Parsing Strategy**: Use regex-based extraction from fenced code blocks in spec files. Specs use consistent `#### Scenario` and `### Requirement` headers, making structured extraction feasible without a full markdown AST parser.
   - *Alternative considered*: Use a full markdown AST parser (remark). Rejected to minimize dependencies; regex extraction is sufficient for the well-structured spec format.

2. **Zod as Schema Library**: Zod is already used in the Planner module for LLM response validation (PRD §7.2). Reusing Zod ensures consistency.
   - *Alternative considered*: Joi, Yup, valibot. Rejected because Zod is already a project dependency.

3. **Generation Output Location**: Generated files go to `src/generated/` with a header comment `// Auto-generated from specs. Do not edit manually.`
   - *Alternative considered*: Generate to `dist/` at build time. Rejected to allow TypeScript compiler to type-check generated code alongside hand-written code.

4. **Validation Strategy**: The `validate-types.ts` script compares spec-defined interfaces against generated interfaces using TypeScript compiler API. Drift detection is structural (property names, types, optionality) not textual.

5. **Manual Override Escape Hatch**: Developers can add `// @openspec-ignore` comments to generated files for edge cases, but CI will warn on ignored fields.

## Risks / Trade-offs

- **[Risk]** Spec markdown format changes could break the parser → **Mitigation**: Parser is tested against all existing spec files; changes to spec format require parser updates.
- **[Risk]** Generated types may not capture all TypeScript nuances (generics, conditional types) → **Mitigation**: Scope is limited to interface/object types; complex types remain hand-written.
- **[Risk]** Additional build step increases CI time → **Mitigation**: Generation is cached based on spec file mtimes; validation is fast ( TypeScript compiler API ).

## Migration Plan

No migration required. This is a new tooling addition. Existing hand-written types in `src/types.ts` will be gradually replaced by generated types in subsequent changes.

## Open Questions

1. Should generated files be committed to git or generated at build time? → **Decision**: Commit to git for visibility, but CI validates they are up-to-date.
2. Should the transpiler support union types beyond simple string literals (e.g., `status: "pending" | "running"`)? → **Decision**: Yes, string literal unions are supported as they are common in the PRD.
