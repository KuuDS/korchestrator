## Context

The korchestrator project uses OpenSpec for spec-driven development. Specifications live in `openspec/specs/<capability>/spec.md` and define requirements using FR-* IDs (e.g., FR-PLAN-001, FR-BUILD-003). The PRD at `docs/openclaw-plan-task-build-prd.md` is the source of truth for requirement definitions. However, there is currently no automated mechanism to verify that:

1. Every FR-* ID in specs is implemented in code
2. Every FR-* annotation in code references a valid requirement
3. Coverage metrics are tracked over time

This tooling change addresses that gap.

## Goals / Non-Goals

**Goals:**
- Extract all FR-* requirement IDs from OpenSpec spec files
- Extract all FR-* annotations from TypeScript source and test files
- Compute bidirectional coverage: spec-to-code and code-to-spec
- Report uncovered requirements and orphaned annotations
- Integrate with CI pipeline (non-zero exit on incomplete coverage)
- Define and document JSDoc annotation conventions

**Non-Goals:**
- Automatic code generation from specs
- Runtime requirement checking (this is build-time/CI-time only)
- Integration with external requirement management tools (Jira, etc.)
- Enforcement of annotation presence in every function (coverage check only)
- Validation of PRD-to-spec consistency (out of scope; specs are the checked artifact)

## Decisions

1. **FR-* ID pattern: `/FR-[A-Z]+-\d{3,4}/g`**
   - Rationale: Matches all existing IDs in the PRD (FR-PLAN-001 through FR-CONFIG-004) and allows 3-4 digit suffixes for future expansion.
   - Alternative: Strict 3-digit only → rejected because FR-BUILD-003a/b/c sub-requirements may use 4 digits or letter suffixes.

2. **Code annotations use JSDoc `@implements` and `@satisfies` tags**
   - Rationale: These are standard JSDoc tags with clear semantics. `@implements` for implementation, `@satisfies` for test verification. TypeScript tooling recognizes them.
   - Alternative: Custom tags like `@req` or `@fr` → rejected because they are non-standard and may conflict with linters.

3. **Scan directories: `openspec/specs/`, `src/`, `tests/`**
   - Rationale: These are the three canonical directories for specs, source, and tests. The tool is configurable via CLI flags for flexibility.
   - Alternative: Hardcode only `src/` → rejected because tests also contain requirement references.

4. **Exit code 0 on full coverage, 1 on any gap**
   - Rationale: Standard Unix convention for CI integration. The tool prints a human-readable report before exiting.
   - Alternative: Exit code equals gap count → rejected because CI systems typically only check zero vs non-zero.

5. **Output format: structured JSON + human-readable text**
   - Rationale: JSON enables downstream tooling (dashboards, PR comments). Text is for local developer feedback and CI logs.
   - Alternative: Only text → rejected because JSON is needed for programmatic consumption.

6. **No external runtime dependencies**
   - Rationale: The tool only needs file system access and regex. Keeping it dependency-free avoids version conflicts and speeds up CI.
   - Alternative: Use `glob` npm package → rejected because Node.js 20+ has `fs.glob` and we can use simple recursive readdir.

## Risks / Trade-offs

- **[Risk] False positives from FR-* IDs in comments or strings** → Mitigation: Only scan JSDoc comment blocks for code annotations; only scan `### Requirement:` and `#### Scenario:` headers for spec IDs. General code comments are ignored.
- **[Risk] Spec files may use FR-* IDs in examples or documentation without being actual requirements** → Mitigation: Only extract IDs that appear under `### Requirement:` headers in spec files.
- **[Risk] Annotation drift — code is updated but annotations are not** → Mitigation: CI gate prevents merges with uncovered requirements. Code review should also check annotations.
- **[Risk] Large repos may have slow file scanning** → Mitigation: The tool caches file mtimes and supports `--watch` mode for local development. CI runs on changed files only via `--since` flag.
- **[Trade-off] Annotation conventions add boilerplate** → The conventions are lightweight (single JSDoc tag). The value of traceability outweighs the annotation cost.

## Migration Plan

No migration needed — this is a new tooling addition. After the tool is created:
1. Run `npm run validate:traceability` locally to establish baseline
2. Add JSDoc annotations to existing source files in follow-up changes
3. Enable CI gate after baseline coverage reaches acceptable threshold

## Open Questions

- Should the tool support `@covers` as an alias for `@satisfies` in test files? (Current: no, keep it simple.)
- Should uncovered requirements be allowed with an explicit `@todo {FR-XXX-NNN}` annotation? (Current: no, all specs requirements must be covered.)
- Should the tool validate that scenario descriptions match test case names? (Current: no, out of scope.)
