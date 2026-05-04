## ADDED Requirements

### Requirement: FR-* ID Extraction from Specifications

The traceability validation tool SHALL extract all FR-* requirement identifiers from OpenSpec specification files.

#### Scenario: Extract requirements from spec files
- **WHEN** the tool scans `openspec/specs/**/*.md`
- **AND** a spec file contains `### Requirement: Complexity Classification (FR-PLAN-001)`
- **THEN** the tool SHALL record `FR-PLAN-001` as a required requirement
- **AND** the tool SHALL associate it with the `planner` capability

#### Scenario: Ignore FR-* IDs in non-requirement contexts
- **WHEN** the tool scans a spec file
- **AND** an FR-* ID appears in a paragraph or example block
- **AND** the ID is not under a `### Requirement:` header
- **THEN** the tool SHALL NOT record it as a required requirement

#### Scenario: Handle multiple requirements per spec
- **WHEN** a spec file contains requirements `FR-TASK-001`, `FR-TASK-002`, and `FR-TASK-003`
- **THEN** the tool SHALL extract all three IDs
- **AND** the tool SHALL report the total count per spec file

### Requirement: FR-* Annotation Extraction from Code

The traceability validation tool SHALL extract all FR-* requirement annotations from TypeScript source and test files.

#### Scenario: Extract @implements annotations
- **WHEN** the tool scans `src/**/*.ts`
- **AND** a source file contains `/** @implements {FR-PLAN-001} */`
- **THEN** the tool SHALL record `FR-PLAN-001` as implemented
- **AND** the tool SHALL record the file path and line number

#### Scenario: Extract @satisfies annotations
- **WHEN** the tool scans `tests/**/*.ts`
- **AND** a test file contains `/** @satisfies {FR-BUILD-003a} */`
- **THEN** the tool SHALL record `FR-BUILD-003a` as tested
- **AND** the tool SHALL record the file path and line number

#### Scenario: Ignore FR-* IDs in non-annotation contexts
- **WHEN** the tool scans a TypeScript file
- **AND** an FR-* ID appears in a string literal or regular code comment
- **AND** the ID is not inside a JSDoc block with `@implements` or `@satisfies`
- **THEN** the tool SHALL NOT record it as a code annotation

#### Scenario: Handle multiple annotations per file
- **WHEN** a source file contains `@implements {FR-PLAN-001}` and `@implements {FR-PLAN-002}`
- **THEN** the tool SHALL extract both IDs
- **AND** the tool SHALL associate both with the same file

### Requirement: Bidirectional Coverage Validation

The traceability validation tool SHALL validate bidirectional coverage between specifications and code annotations.

#### Scenario: Detect uncovered requirements
- **WHEN** `FR-BUILD-003a` exists in specs
- **AND** no code file contains `@implements {FR-BUILD-003a}` or `@satisfies {FR-BUILD-003a}`
- **THEN** the tool SHALL report `FR-BUILD-003a` as uncovered
- **AND** the report SHALL include the spec file where the requirement is defined

#### Scenario: Detect orphaned annotations
- **WHEN** a code file contains `@implements {FR-UNKNOWN-999}`
- **AND** `FR-UNKNOWN-999` does not exist in any spec file
- **THEN** the tool SHALL report `FR-UNKNOWN-999` as orphaned
- **AND** the report SHALL include the code file and line number

#### Scenario: Full coverage report
- **WHEN** all spec requirements have at least one code annotation
- **AND** all code annotations reference valid spec requirements
- **THEN** the tool SHALL report 100% coverage
- **AND** the tool SHALL exit with status code 0

### Requirement: CI Pipeline Integration

The traceability validation tool SHALL integrate with CI pipelines via command-line interface and exit codes.

#### Scenario: CI failure on uncovered requirements
- **WHEN** the tool is run in a CI pipeline
- **AND** one or more requirements are uncovered
- **THEN** the tool SHALL print a summary report
- **AND** the tool SHALL exit with status code 1

#### Scenario: CI success on full coverage
- **WHEN** the tool is run in a CI pipeline
- **AND** all requirements are covered with no orphaned annotations
- **THEN** the tool SHALL print a success message with coverage percentage
- **AND** the tool SHALL exit with status code 0

#### Scenario: JSON output for programmatic consumption
- **WHEN** the tool is invoked with `--format json`
- **THEN** the tool SHALL output a JSON object containing:
  - `totalRequirements`: number
  - `coveredRequirements`: number
  - `uncoveredRequirements`: array of requirement IDs
  - `orphanedAnnotations`: array of annotation objects
  - `coveragePercent`: number

### Requirement: Code Annotation Conventions

The project SHALL define and document JSDoc annotation conventions for requirement traceability.

#### Scenario: @implements convention
- **WHEN** a function or class implements a requirement
- **THEN** the JSDoc block SHALL contain `@implements {FR-XXX-NNN}`
- **AND** the tag SHALL appear before the function or class declaration

#### Scenario: @satisfies convention
- **WHEN** a test case verifies a requirement
- **THEN** the JSDoc block SHALL contain `@satisfies {FR-XXX-NNN}`
- **AND** the tag SHALL appear before the test function or `it()` block

#### Scenario: @see cross-reference convention
- **WHEN** additional PRD context is helpful
- **THEN** the JSDoc block MAY contain `@see docs/openclaw-plan-task-build-prd.md#FR-XXX-NNN`
- **AND** the tool SHALL NOT require `@see` tags for coverage validation
