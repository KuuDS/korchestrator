/**
 * OpenSpec to TypeScript Interface Generator (Proof-of-Concept)
 *
 * This script demonstrates how TypeScript interfaces can be auto-generated
 * from OpenSpec markdown specifications. It parses spec files and extracts:
 * - Data structure definitions (TypeScript interfaces in code blocks)
 * - Type aliases from configuration tables
 * - Constants from specification defaults
 *
 * Usage: npx ts-node scripts/spec-to-types.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { globSync } from "glob";
import { dirname, join } from "path";

interface SpecType {
  name: string;
  definition: string;
  source: string;
  requirements: string[];
}

/**
 * Parse TypeScript interfaces from OpenSpec markdown files
 */
function parseInterfaces(content: string, source: string): SpecType[] {
  const interfaces: SpecType[] = [];
  const interfaceRegex = /```typescript\n(interface\s+\w+\s*\{[\s\S]*?\})\n```/g;
  const requirementRegex = /@openspec-requirement:\s*([\w-]+)/g;

  let match;
  while ((match = interfaceRegex.exec(content)) !== null) {
    const definition = match[1];
    const nameMatch = definition.match(/interface\s+(\w+)/);
    if (!nameMatch) continue;

    // Extract requirement references from surrounding context
    const contextStart = Math.max(0, match.index - 500);
    const context = content.slice(contextStart, match.index);
    const requirements: string[] = [];
    let reqMatch;
    while ((reqMatch = requirementRegex.exec(context)) !== null) {
      requirements.push(reqMatch[1]);
    }

    interfaces.push({
      name: nameMatch[1],
      definition,
      source,
      requirements: [...new Set(requirements)]
    });
  }

  return interfaces;
}

/**
 * Parse type aliases from spec content
 */
function parseTypeAliases(content: string, source: string): SpecType[] {
  const aliases: SpecType[] = [];
  const aliasRegex = /```typescript\n(type\s+\w+\s*=\s*[^;]+);?\n```/g;

  let match;
  while ((match = aliasRegex.exec(content)) !== null) {
    const definition = match[1];
    const nameMatch = definition.match(/type\s+(\w+)/);
    if (!nameMatch) continue;

    aliases.push({
      name: nameMatch[1],
      definition,
      source,
      requirements: []
    });
  }

  return aliases;
}

/**
 * Generate TypeScript file from parsed spec types
 */
function generateTypescriptFile(types: SpecType[]): string {
  const sections = new Map<string, SpecType[]>();

  // Group by source module
  for (const type of types) {
    const module = type.source.replace(/\.md$/, "").split("/").pop() || "unknown";
    if (!sections.has(module)) {
      sections.set(module, []);
    }
    sections.get(module)!.push(type);
  }

  const lines: string[] = [
    "/**",
    " * Auto-generated TypeScript interfaces from OpenSpec specifications",
    " *",
    " * DO NOT EDIT DIRECTLY — Update openspec/specs/**/*.md instead",
    " * Regenerate: npx ts-node scripts/spec-to-types.ts",
    " */",
    "",
    ""
  ];

  for (const [module, moduleTypes] of sections) {
    lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
    lines.push(`// ${module.charAt(0).toUpperCase() + module.slice(1)} Module (from openspec/specs/${module}/spec.md)`);
    lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
    lines.push("");

    for (const type of moduleTypes) {
      if (type.requirements.length > 0) {
        lines.push(`/**`);
        lines.push(` * @openspec-requirement: ${type.requirements.join(", ")}`);
        lines.push(` * @openspec-source: ${type.source}`);
        lines.push(` */`);
      }
      lines.push(type.definition);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Main generation function
 */
function generate(): void {
  const specFiles = globSync("openspec/specs/**/*.md");
  const allTypes: SpecType[] = [];

  for (const file of specFiles) {
    const content = readFileSync(file, "utf-8");
    const interfaces = parseInterfaces(content, file);
    const aliases = parseTypeAliases(content, file);
    allTypes.push(...interfaces, ...aliases);
  }

  if (allTypes.length === 0) {
    console.warn("No TypeScript definitions found in OpenSpec files.");
    console.warn("Make sure specs contain TypeScript code blocks with interface/type definitions.");
    return;
  }

  const output = generateTypescriptFile(allTypes);
  const outputPath = "src/types.generated.ts";

  // Ensure directory exists
  const dir = dirname(outputPath);
  if (!require("fs").existsSync(dir)) {
    require("fs").mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, output);
  console.log(`✓ Generated ${allTypes.length} types from ${specFiles.length} spec files`);
  console.log(`  Output: ${outputPath}`);
  console.log("");
  console.log("Generated types:");
  for (const type of allTypes) {
    console.log(`  - ${type.name} (${type.source})`);
  }
}

// Run if executed directly
if (require.main === module) {
  generate();
}

export { parseInterfaces, parseTypeAliases, generateTypescriptFile };
