/**
 * Zod schema generator — converts parsed interface definitions into
 * Zod schema objects for runtime validation.
 */

import { InterfaceDef, PropertyDef } from "./types.js";

/**
 * Generate a Zod schema source file from parsed interface definitions.
 *
 * Each interface gets a corresponding `export const XxxSchema = z.object({...})`
 * declaration.  String-literal unions become `z.enum()`, arrays become `z.array()`,
 * and optional properties are wrapped with `.optional()`.
 *
 * @param interfaces - Array of parsed interface definitions
 * @returns Complete Zod schema file content as a string
 */
export function generateZodSchemas(interfaces: InterfaceDef[]): string {
  const ordered = topologicalSortForZod(interfaces);

  const lines: string[] = [
    "/**",
    " * Auto-generated Zod schemas from OpenSpec specifications",
    " *",
    " * DO NOT EDIT DIRECTLY - Update openspec/specs/... .md instead",
    " * Regenerate: npm run validate-types -- --generate",
    " */",
    "",
    'import { z } from "zod";',
    "",
  ];

  for (const iface of ordered) {
    lines.push(...emitZodSchema(iface));
    lines.push("");
  }

  return lines.join("\n");
}

/** Emit a single Zod schema declaration */
function emitZodSchema(iface: InterfaceDef): string[] {
  const lines: string[] = [];

  if (iface.doc) {
    lines.push("/**");
    for (const docLine of iface.doc.split("\n")) {
      lines.push(` * ${docLine}`);
    }
    lines.push(" */");
  }

  lines.push(`export const ${iface.name}Schema = z.object({`);

  for (const prop of iface.properties) {
    if (prop.doc) {
      lines.push(`  /** ${prop.doc} */`);
    }
    const schema = propertyToZod(prop);
    lines.push(`  ${prop.name}: ${schema},`);
  }

  lines.push("});");

  return lines;
}

/** Convert a single property definition to a Zod expression string */
function propertyToZod(prop: PropertyDef): string {
  let schema = typeToZod(prop.type);

  if (prop.optional) {
    schema = `${schema}.optional()`;
  }

  return schema;
}

/** Convert a TypeScript type string to a Zod expression string */
function typeToZod(type: string): string {
  const trimmed = type.trim();

  // Array type: Foo[]
  if (trimmed.endsWith("[]")) {
    const elementType = trimmed.slice(0, -2).trim();
    return `z.array(${typeToZod(elementType)})`;
  }

  // Record type
  const recordMatch = trimmed.match(/Record\s*<\s*(\w+)\s*,\s*(\w+)\s*>/);
  if (recordMatch) {
    const keyType = recordMatch[1];
    const valType = recordMatch[2];
    if (keyType === "string") {
      return `z.record(${typeToZod(valType)})`;
    }
    // Fallback for non-string keys
    return `z.record(z.any())`;
  }

  // Union type with string literals: "a" | "b" | "c"
  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((p) => p.trim());
    const literals = parts.filter((p) => p.startsWith('"') || p.startsWith("'"));
    if (literals.length === parts.length && literals.length > 0) {
      // All parts are string literals — use z.enum()
      const values = literals.map((l) => l.replace(/^['"]|['"]$/g, ""));
      return `z.enum([${values.map((v) => `"${v}"`).join(", ")}])`;
    }
    // Mixed union — use z.union() with z.literal() for literals
    const unionParts = parts.map((p) => typeToZod(p));
    return `z.union([${unionParts.join(", ")}])`;
  }

  // Primitive types
  switch (trimmed) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "undefined":
      return "z.undefined()";
    case "null":
      return "z.null()";
    case "any":
      return "z.any()";
    case "unknown":
      return "z.unknown()";
    case "never":
      return "z.never()";
    case "object":
      return "z.object({})";
    default:
      // Reference to another interface schema
      return `${trimmed}Schema`;
  }
}

/**
 * Sort interfaces so that schemas referenced by other schemas appear first.
 *
 * @param interfaces - Array of interface definitions
 * @returns Topologically sorted array
 */
function topologicalSortForZod(interfaces: InterfaceDef[]): InterfaceDef[] {
  const map = new Map<string, InterfaceDef>();
  for (const iface of interfaces) {
    map.set(iface.name, iface);
  }

  const visited = new Set<string>();
  const result: InterfaceDef[] = [];

  function visit(name: string, stack: Set<string>): void {
    if (visited.has(name)) return;
    if (stack.has(name)) return;

    const iface = map.get(name);
    if (!iface) return;

    stack.add(name);

    for (const prop of iface.properties) {
      const refs = extractSchemaReferences(prop.type);
      for (const ref of refs) {
        if (map.has(ref)) {
          visit(ref, stack);
        }
      }
    }

    stack.delete(name);
    visited.add(name);
    result.push(iface);
  }

  for (const iface of interfaces) {
    visit(iface.name, new Set<string>());
  }

  return result;
}

/** Extract schema references from a type string (for Zod dependency ordering) */
function extractSchemaReferences(type: string): string[] {
  const primitives = new Set([
    "string",
    "number",
    "boolean",
    "undefined",
    "null",
    "any",
    "unknown",
    "never",
    "object",
    "Record",
  ]);

  const base = type.replace(/\[\]/g, "").trim();

  const recordMatch = base.match(/Record\s*<\s*(\w+)\s*,\s*(\w+)\s*>/);
  if (recordMatch) {
    const refs: string[] = [];
    const val = recordMatch[2];
    if (!primitives.has(val)) refs.push(val);
    return refs;
  }

  if (base.includes("|")) {
    const parts = base.split("|").map((p) => p.trim());
    const refs: string[] = [];
    for (const part of parts) {
      if (part.startsWith('"') || part.startsWith("'")) continue;
      if (primitives.has(part)) continue;
      if (/^-?\d+(\.\d+)?$/.test(part)) continue;
      refs.push(part);
    }
    return refs;
  }

  if (primitives.has(base)) return [];
  if (base.startsWith('"') || base.startsWith("'")) return [];
  if (/^-?\d+(\.\d+)?$/.test(base)) return [];

  return [base];
}
