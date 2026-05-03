## 1. Tool Setup

- [ ] 1.1 Create `scripts/validate-traceability.ts` with TypeScript shebang and CLI argument parsing
- [ ] 1.2 Define CLI flags: `--specs-dir`, `--src-dir`, `--tests-dir`, `--format`, `--since`
- [ ] 1.3 Add `validate:traceability` script to `package.json`
- [ ] 1.4 Add dev dependency for TypeScript execution (tsx or ts-node)

## 2. Spec File Scanner

- [ ] 2.1 Implement recursive directory scan for `openspec/specs/**/*.md`
- [ ] 2.2 Parse markdown to extract `### Requirement:` headers and associated FR-* IDs
- [ ] 2.3 Build requirement registry: `Map<frId, { capability, specFile, requirementName }>`
- [ ] 2.4 Handle FR-* IDs with letter suffixes (e.g., FR-BUILD-003a)
- [ ] 2.5 Ignore FR-* IDs in non-requirement contexts (examples, paragraphs)

## 3. Code Annotation Scanner

- [ ] 3.1 Implement recursive directory scan for `src/**/*.ts` and `tests/**/*.ts`
- [ ] 3.2 Parse JSDoc comment blocks using regex to extract `@implements {FR-XXX-NNN}` and `@satisfies {FR-XXX-NNN}`
- [ ] 3.3 Build annotation registry: `Map<frId, Array<{ file, line, tag, context }>>`
- [ ] 3.4 Handle multiple annotations per JSDoc block
- [ ] 3.5 Ignore FR-* IDs in non-JSDoc comments and string literals
- [ ] 3.6 Report malformed annotations (missing braces, invalid format)

## 4. Coverage Validation Engine

- [ ] 4.1 Compare requirement registry against annotation registry
- [ ] 4.2 Identify uncovered requirements (in specs, not in code)
- [ ] 4.3 Identify orphaned annotations (in code, not in specs)
- [ ] 4.4 Calculate coverage percentage: `covered / total * 100`
- [ ] 4.5 Generate structured report object with all findings

## 5. Output Formatters

- [ ] 5.1 Implement human-readable text formatter with colored output
- [ ] 5.2 Implement JSON formatter (`--format json`) for CI consumption
- [ ] 5.3 Print summary: total requirements, covered, uncovered, orphaned, coverage %
- [ ] 5.4 Print detailed list of uncovered requirements with spec file references
- [ ] 5.5 Print detailed list of orphaned annotations with file/line references

## 6. CLI and Exit Behavior

- [ ] 6.1 Exit with code 0 when coverage is 100% with no orphaned annotations
- [ ] 6.2 Exit with code 1 when any requirement is uncovered
- [ ] 6.3 Exit with code 1 when any orphaned annotation exists
- [ ] 6.4 Support `--help` flag showing usage
- [ ] 6.5 Support `--verbose` flag for detailed per-file scanning output

## 7. CI Integration

- [ ] 7.1 Add traceability validation step to `.github/workflows/opencode.yml`
- [ ] 7.2 Configure step to run `npm run validate:traceability`
- [ ] 7.3 Ensure CI fails on uncovered requirements
- [ ] 7.4 Add CI step to upload JSON report as artifact

## 8. Testing

- [ ] 8.1 Create `tests/traceability.test.ts` with unit tests for the scanner
- [ ] 8.2 Test: extract requirements from mock spec markdown
- [ ] 8.3 Test: extract annotations from mock TypeScript source
- [ ] 8.4 Test: detect uncovered requirements
- [ ] 8.5 Test: detect orphaned annotations
- [ ] 8.6 Test: calculate coverage percentage correctly
- [ ] 8.7 Test: JSON output format
- [ ] 8.8 Test: CLI exit codes
- [ ] 8.9 Achieve >80% test coverage for `scripts/validate-traceability.ts`

## 9. Documentation

- [ ] 9.1 Add annotation conventions section to `AGENTS.md` or `README.md`
- [ ] 9.2 Document `@implements` and `@satisfies` usage with examples
- [ ] 9.3 Document how to run the tool locally
- [ ] 9.4 Document CI integration and failure modes
