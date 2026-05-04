## Why

The korchestrator project has 15+ functional requirements (FR-PLAN-001 through FR-CONFIG-004) spread across a 1600-line PRD, multiple OpenSpec spec files, and planned source code. Without automated traceability, there is no systematic way to verify that every documented requirement has a corresponding code implementation, or that code annotations remain in sync with spec changes. This tooling closes the gap between specification and implementation, enabling CI-gated enforcement of requirement coverage.

## What Changes

- Create `scripts/validate-traceability.ts` — a standalone TypeScript CLI tool that:
  - Scans all `openspec/specs/**/*.md` files to extract FR-* requirement IDs
  - Scans `src/**/*.ts` and `tests/**/*.ts` for JSDoc `@implements` or `@satisfies` annotations referencing FR-* IDs
  - Validates that every FR-* ID found in specs has at least one code reference
  - Reports uncovered requirements, orphaned code annotations, and coverage statistics
  - Exits with non-zero status when coverage is incomplete (for CI pipeline integration)
- Establish code annotation conventions:
  - JSDoc `@implements {FR-XXX-NNN}` on functions/classes that implement a requirement
  - JSDoc `@satisfies {FR-XXX-NNN}` on test cases that verify a requirement
  - Optional `@see docs/openclaw-plan-task-build-prd.md#FR-XXX-NNN` for PRD cross-reference
- Add npm script `npm run validate:traceability` to invoke the tool
- Add GitHub Actions CI step to run traceability validation on every PR
- No runtime module changes — this is a development-time and CI-time tooling change only

## Capabilities

### New Capabilities

- `traceability-validation`: Automated extraction and validation of FR-* requirement coverage across specs and code
- `code-annotation`: JSDoc annotation conventions for requirement traceability in source and test files

### Modified Capabilities

- None (this is a pure tooling change)

## Impact

- **New file**: `scripts/validate-traceability.ts` — the traceability validation CLI
- **New file**: `tests/traceability.test.ts` — unit tests for the validation tool itself
- **Modified file**: `package.json` — add `validate:traceability` script and any new dev dependencies
- **Modified file**: `.github/workflows/opencode.yml` — add traceability validation step
- **Dependencies**: `fs/promises`, `path`, `glob` or built-in fs for file scanning; no runtime dependencies
- **PRD references**: §6.2 (migration strategy), §10.2 (quality requirements — JSDoc, test coverage)
