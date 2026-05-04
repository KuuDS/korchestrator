/**
 * TypeScript transpiler — converts parsed interface definitions into
 * valid TypeScript source code with JSDoc comments.
 */

import { InterfaceDef } from "./types.js";

/**
 * Generate a TypeScript source file from parsed interface definitions.
 *
 * Interfaces are emitted in topological order so that referenced types
 * appear before the types that depend on them.
 *
 * @param interfaces - Array of parsed interface definitions
 * @returns Complete TypeScript file content as a string
 */
export function transpileToTypeScript(interfaces: InterfaceDef[]): string {
  const ordered = topologicalSort(interfaces);

  const lines: string[] = [
    "/**",
    " * Auto-generated TypeScript interfaces from OpenSpec specifications",
    " *",
    " * DO NOT EDIT DIRECTLY - Update openspec/specs/... .md instead",
    " * Regenerate: npm run validate-types -- --generate",
    " */",
    "",
  ];

  for (const iface of ordered) {
    lines.push(...emitInterface(iface));
    lines.push("");
  }

  return lines.join("\n");
}

/** Emit a single interface declaration with JSDoc */
function emitInterface(iface: InterfaceDef): string[] {
  const lines: string[] = [];

  if (iface.doc) {
    lines.push("/**");
    for (const docLine of iface.doc.split("\n")) {
      lines.push(` * ${docLine}`);
    }
    lines.push(" */");
  }

  lines.push(`export interface ${iface.name} {`);

  for (const prop of iface.properties) {
    if (prop.doc) {
      lines.push(`  /** ${prop.doc} */`);
    }
    const optional = prop.optional ? "?" : "";
    lines.push(`  ${prop.name}${optional}: ${prop.type};`);
  }

  lines.push("}");

  return lines;
}

/**
 * Sort interfaces in topological order based on property type references.
 *
 * @param interfaces - Array of interface definitions
 * @returns Topologically sorted array
 */
function topologicalSort(interfaces: InterfaceDef[]): InterfaceDef[] {
  const map = new Map<string, InterfaceDef>();
  for (const iface of interfaces) {
    map.set(iface.name, iface);
  }

  const visited = new Set<string>();
  const result: InterfaceDef[] = [];

  function visit(name: string, stack: Set<string>): void {
    if (visited.has(name)) return;
    if (stack.has(name)) {
      // Circular dependency — break it by returning
      return;
    }

    const iface = map.get(name);
    if (!iface) return;

    stack.add(name);

    for (const prop of iface.properties) {
      const refs = extractTypeReferences(prop.type);
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

/** Extract simple type names from a type string (excludes primitives and literals) */
function extractTypeReferences(type: string): string[] {
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

  // Remove array brackets
  const base = type.replace(/\[\]/g, "").trim();

  // Handle Record<K, V>
  const recordMatch = base.match(/Record<\s*(\w+)\s*,\s*(\w+)\s*>/);
  if (recordMatch) {
    const refs: string[] = [];
    const key = recordMatch[1];
    const val = recordMatch[2];
    if (!primitives.has(key)) refs.push(key);
    if (!primitives.has(val)) refs.push(val);
    return refs;
  }

  // Handle union types — split by | and collect non-primitive, non-literal parts
  const parts = base.split("|").map((p) => p.trim());
  const refs: string[] = [];

  for (const part of parts) {
    // Skip string literals
    if (part.startsWith('"') || part.startsWith("'")) continue;
    // Skip primitives
    if (primitives.has(part)) continue;
    // Skip numeric literals
    if (/^-?\d+(\.\d+)?$/.test(part)) continue;
    refs.push(part);
  }

  return refs;
}
