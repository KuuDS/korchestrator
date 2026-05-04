## ADDED Requirements

### Requirement: JSDoc Annotation Syntax

The project SHALL use standardized JSDoc syntax for requirement traceability annotations.

#### Scenario: Basic @implements syntax
- **WHEN** a developer annotates a function with `/** @implements {FR-PLAN-001} */`
- **THEN** the annotation SHALL be recognized by the traceability tool
- **AND** the annotation SHALL be valid JSDoc syntax parseable by TypeScript

#### Scenario: Multi-line JSDoc block
- **WHEN** a developer writes:
  ```
  /**
   * Classifies user requests by complexity.
   * @implements {FR-PLAN-001}
   * @see docs/openclaw-plan-task-build-prd.md#FR-PLAN-001
   */
  ```
- **THEN** the tool SHALL extract `FR-PLAN-001` from the block
- **AND** the tool SHALL ignore the `@see` tag for coverage purposes

#### Scenario: Multiple requirements per annotation
- **WHEN** a function implements multiple requirements:
  ```
  /** @implements {FR-PLAN-001} @implements {FR-PLAN-002} */
  ```
- **THEN** the tool SHALL extract both `FR-PLAN-001` and `FR-PLAN-002`
- **AND** both SHALL count as coverage for their respective requirements

#### Scenario: Invalid annotation format
- **WHEN** a comment contains `@implements FR-PLAN-001` without braces
- **THEN** the tool SHALL NOT recognize it as a valid annotation
- **AND** the tool SHALL report it as a malformed annotation warning

### Requirement: Annotation Placement Conventions

The project SHALL define where requirement annotations are placed in source files.

#### Scenario: Function-level annotation
- **WHEN** a function directly implements a requirement
- **THEN** the `@implements` tag SHALL be placed in the JSDoc block immediately preceding the function

#### Scenario: Class-level annotation
- **WHEN** a class implements multiple requirements through its methods
- **THEN** the class MAY have a top-level JSDoc block with all `@implements` tags
- **AND** individual methods MAY have their own `@implements` tags for specific requirements

#### Scenario: Test-level annotation
- **WHEN** a test case verifies a specific requirement scenario
- **THEN** the `@satisfies` tag SHALL be placed in the JSDoc block immediately preceding the test

#### Scenario: Module-level annotation
- **WHEN** an entire module file implements a capability
- **THEN** a file-level JSDoc block at the top of the file MAY contain `@implements` tags
- **AND** the tool SHALL recognize file-level annotations

### Requirement: Annotation Maintenance

The project SHALL keep annotations in sync with code and spec changes.

#### Scenario: Spec requirement added
- **WHEN** a new requirement is added to a spec file
- **THEN** a corresponding code annotation SHALL be added in the implementation change
- **AND** the CI pipeline SHALL fail until the annotation is added

#### Scenario: Spec requirement removed
- **WHEN** a requirement is removed from a spec file
- **THEN** the corresponding code annotation MAY be removed
- **AND** the tool SHALL report the annotation as orphaned until removed

#### Scenario: Code refactored
- **WHEN** implementation is moved between files
- **THEN** the `@implements` annotation SHALL move with the implementation
- **AND** the tool SHALL continue to recognize the coverage
