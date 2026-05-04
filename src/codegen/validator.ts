/**
 * Type parity validator — compares spec definitions against generated files
 * and reports mismatches in interface names, properties, types, and optionality.
 */

import {
  SpecDefinition,
  GeneratedFile,
  ValidationResult,
  ValidationError,
  InterfaceDef,
  PropertyDef,
} from "./types.js";

/**
 * Validate that generated TypeScript files match the spec definitions exactly.
 *
 * @param specs - Parsed spec definitions
 * @param generated - Generated output files
 * @returns Validation result with success flag and error list
 */
export function validateParity(
  specs: SpecDefinition[],
  generated: GeneratedFile[]
): ValidationResult {
  const errors: ValidationError[] = [];

  // Flatten all spec interfaces
  const specInterfaces = new Map<string, { iface: InterfaceDef; filePath: string }>();
  for (const spec of specs) {
    for (const iface of spec.interfaces) {
      specInterfaces.set(iface.name, { iface, filePath: spec.filePath });
    }
  }

  // Flatten all generated interfaces
  const genInterfaces = new Map<string, { iface: InterfaceDef; filePath: string }>();
  for (const file of generated) {
    for (const iface of file.interfaces) {
      genInterfaces.set(iface.name, { iface, filePath: file.filePath });
    }
  }

  // Check for missing interfaces in generated files
  for (const [name, { filePath }] of specInterfaces) {
    if (!genInterfaces.has(name)) {
      errors.push({
        message: `Missing interface "${name}" in generated files`,
        filePath,
        interfaceName: name,
      });
    }
  }

  // Check for extra interfaces in generated files
  for (const [name, { filePath }] of genInterfaces) {
    if (!specInterfaces.has(name)) {
      errors.push({
        message: `Extra interface "${name}" not found in specs`,
        filePath,
        interfaceName: name,
      });
    }
  }

  // Compare properties for interfaces that exist in both
  for (const [name, { iface: specIface }] of specInterfaces) {
    const genEntry = genInterfaces.get(name);
    if (!genEntry) continue;

    const genIface = genEntry.iface;
    const genPath = genEntry.filePath;

    const specProps = new Map<string, PropertyDef>();
    for (const prop of specIface.properties) {
      specProps.set(prop.name, prop);
    }

    const genProps = new Map<string, PropertyDef>();
    for (const prop of genIface.properties) {
      genProps.set(prop.name, prop);
    }

    // Missing properties
    for (const [propName] of specProps) {
      if (!genProps.has(propName)) {
        errors.push({
          message: `Missing property "${propName}" in interface "${name}"`,
          filePath: genPath,
          interfaceName: name,
          propertyName: propName,
        });
      }
    }

    // Extra properties
    for (const [propName] of genProps) {
      if (!specProps.has(propName)) {
        errors.push({
          message: `Extra property "${propName}" in interface "${name}"`,
          filePath: genPath,
          interfaceName: name,
          propertyName: propName,
        });
      }
    }

    // Type and optionality mismatches
    for (const [propName, specProp] of specProps) {
      const genProp = genProps.get(propName);
      if (!genProp) continue;

      if (specProp.type !== genProp.type) {
        errors.push({
          message: `Type mismatch for "${propName}" in interface "${name}": spec="${specProp.type}", generated="${genProp.type}"`,
          filePath: genPath,
          interfaceName: name,
          propertyName: propName,
        });
      }

      if (specProp.optional !== genProp.optional) {
        errors.push({
          message: `Optionality mismatch for "${propName}" in interface "${name}": spec=${specProp.optional ? "optional" : "required"}, generated=${genProp.optional ? "optional" : "required"}`,
          filePath: genPath,
          interfaceName: name,
          propertyName: propName,
        });
      }
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}
