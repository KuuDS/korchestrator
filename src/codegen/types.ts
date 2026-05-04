/**
 * Core type definitions for the spec-to-TypeScript code generation pipeline.
 */

/** Represents a parsed property of an interface */
export interface PropertyDef {
  /** Property name */
  name: string;
  /** TypeScript type string (e.g., "string", "number", "Task[]") */
  type: string;
  /** Whether the property is optional */
  optional: boolean;
  /** JSDoc comment for the property, if any */
  doc?: string;
}

/** Represents a parsed interface definition from a spec */
export interface InterfaceDef {
  /** Interface name */
  name: string;
  /** Properties of the interface */
  properties: PropertyDef[];
  /** JSDoc comment for the interface, if any */
  doc?: string;
}

/** Represents a parsed scenario block from a spec */
export interface ScenarioDef {
  /** Scenario title */
  title: string;
  /** Scenario description / GIVEN-WHEN-THEN text */
  content: string;
  /** Requirement ID this scenario belongs to */
  requirementId?: string;
}

/** Represents a parsed spec file with its interfaces and scenarios */
export interface SpecDefinition {
  /** Absolute path to the spec file */
  filePath: string;
  /** Interfaces defined in this spec */
  interfaces: InterfaceDef[];
  /** Scenarios defined in this spec */
  scenarios: ScenarioDef[];
}

/** Represents a generated output file */
export interface GeneratedFile {
  /** Absolute path to the generated file */
  filePath: string;
  /** File content */
  content: string;
  /** Interfaces found in the generated content */
  interfaces: InterfaceDef[];
}

/** A single validation error */
export interface ValidationError {
  /** Error message */
  message: string;
  /** File path where the error was found */
  filePath: string;
  /** Interface name, if applicable */
  interfaceName?: string;
  /** Property name, if applicable */
  propertyName?: string;
}

/** Result of a parity validation run */
export interface ValidationResult {
  /** Whether validation passed */
  success: boolean;
  /** List of errors found */
  errors: ValidationError[];
}
