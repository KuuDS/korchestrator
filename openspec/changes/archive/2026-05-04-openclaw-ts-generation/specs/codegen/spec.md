## ADDED Requirements

### Requirement: Spec-to-TypeScript Transpiler

The system SHALL provide a transpiler that converts spec markdown type definitions into TypeScript interfaces.

#### Scenario: Parse spec markdown
- GIVEN a spec markdown file containing TypeScript interface definitions in fenced code blocks
- WHEN the transpiler processes the file
- THEN the system SHALL extract all `interface` declarations
- AND generate corresponding TypeScript interface files

#### Scenario: Generate TypeScript interfaces
- GIVEN extracted interface definitions from specs
- WHEN the transpiler generates output
- THEN each interface SHALL be emitted as a valid TypeScript `export interface`
- AND all properties SHALL preserve their types, optionality, and documentation comments
- AND string literal union types SHALL be preserved (e.g., `status: "pending" | "running"`)

#### Scenario: Handle nested types
- GIVEN an interface with properties referencing other interfaces
- WHEN the transpiler generates output
- THEN the system SHALL emit interfaces in dependency order
- AND cross-references between interfaces SHALL be preserved

### Requirement: Zod Schema Generator

The system SHALL generate Zod schemas from TypeScript interface definitions for runtime validation.

#### Scenario: Generate Zod schemas from interfaces
- GIVEN a TypeScript interface definition
- WHEN the Zod generator processes it
- THEN the system SHALL emit a corresponding Zod schema object
- AND the schema SHALL validate all properties with matching types

#### Scenario: String literal union validation
- GIVEN a property with a string literal union type (e.g., `status: "pending" | "running" | "done"`)
- WHEN the Zod schema is generated
- THEN the system SHALL use `z.enum()` or `z.literal()` union for validation
- AND invalid values SHALL fail schema validation

#### Scenario: Optional property handling
- GIVEN an interface with optional properties (e.g., `result?: string`)
- WHEN the Zod schema is generated
- THEN the system SHALL use `z.optional()` for those properties
- AND missing optional properties SHALL pass validation

#### Scenario: Array type handling
- GIVEN an interface with array properties (e.g., `skills: string[]`)
- WHEN the Zod schema is generated
- THEN the system SHALL use `z.array()` with the appropriate element type
- AND empty arrays SHALL pass validation

### Requirement: Type Parity Validation

The system SHALL validate that generated TypeScript types match spec requirements exactly.

#### Scenario: Detect missing properties
- GIVEN a spec interface defines a property
- AND the generated TypeScript interface omits that property
- WHEN `validate-types.ts` is executed
- THEN the system SHALL report a parity error
- AND the validation SHALL exit with a non-zero status code

#### Scenario: Detect type mismatches
- GIVEN a spec property has type `string`
- AND the generated TypeScript has type `number`
- WHEN `validate-types.ts` is executed
- THEN the system SHALL report a type mismatch error
- AND the validation SHALL exit with a non-zero status code

#### Scenario: Detect optional vs required mismatches
- GIVEN a spec property is required
- AND the generated TypeScript marks it as optional
- WHEN `validate-types.ts` is executed
- THEN the system SHALL report an optionality mismatch error

#### Scenario: Successful validation
- GIVEN all generated types match spec definitions exactly
- WHEN `validate-types.ts` is executed
- THEN the system SHALL report success
- AND the validation SHALL exit with status code 0

### Requirement: CLI Integration

The system SHALL provide a command-line interface for code generation and validation.

#### Scenario: Generate types command
- GIVEN the `scripts/validate-types.ts` script
- WHEN executed with the `--generate` flag
- THEN the system SHALL regenerate all TypeScript interfaces and Zod schemas
- AND write them to the configured output directory

#### Scenario: Validate types command
- GIVEN the `scripts/validate-types.ts` script
- WHEN executed without flags (default mode)
- THEN the system SHALL validate existing generated files against specs
- AND report any parity errors

#### Scenario: Watch mode
- GIVEN the `scripts/validate-types.ts` script
- WHEN executed with the `--watch` flag
- THEN the system SHALL monitor spec files for changes
- AND regenerate types automatically when specs change
