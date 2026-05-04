/**
 * Spec markdown parser — extracts TypeScript interfaces and scenario blocks
 * from OpenSpec markdown files.
 */

import { readFileSync } from "fs";
import { InterfaceDef, PropertyDef, ScenarioDef, SpecDefinition } from "./types.js";

/**
 * Read a spec markdown file and extract all interface and scenario definitions.
 *
 * @param filePath - Absolute or relative path to the markdown spec file
 * @returns Array of spec definitions (one entry per file)
 */
export function parseSpecFile(filePath: string): SpecDefinition[] {
  const content = readFileSync(filePath, "utf-8");
  const interfaces = extractInterfaces(content);
  const scenarios = extractScenarios(content);
  return [{ filePath, interfaces, scenarios }];
}

/**
 * Extract TypeScript interface declarations from markdown content.
 *
 * Looks for ```typescript code blocks that contain `interface` declarations.
 *
 * @param content - Raw markdown text
 * @returns Array of parsed interface definitions
 */
export function extractInterfaces(content: string): InterfaceDef[] {
  const interfaces: InterfaceDef[] = [];

  // Match ```typescript ... ``` blocks (with optional language tag variations)
  const codeBlockRegex = /```(?:typescript|ts)\n([\s\S]*?)```/g;

  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = codeBlockRegex.exec(content)) !== null) {
    const block = blockMatch[1];

    // Match interface declarations inside the block
    const interfaceRegex = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?interface\s+(\w+)\s*\{([\s\S]*?)\}/g;

    let ifaceMatch: RegExpExecArray | null;
    while ((ifaceMatch = interfaceRegex.exec(block)) !== null) {
      const doc = ifaceMatch[1] ? cleanDocComment(ifaceMatch[1]) : undefined;
      const name = ifaceMatch[2];
      const body = ifaceMatch[3];
      const properties = parseProperties(body);
      interfaces.push({ name, properties, doc });
    }
  }

  // Also match bare interface declarations outside code blocks (for generated files)
  const bareInterfaceRegex = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?export\s+interface\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let bareMatch: RegExpExecArray | null;
  while ((bareMatch = bareInterfaceRegex.exec(content)) !== null) {
    const doc = bareMatch[1] ? cleanDocComment(bareMatch[1]) : undefined;
    const name = bareMatch[2];
    const body = bareMatch[3];
    const properties = parseProperties(body);
    interfaces.push({ name, properties, doc });
  }

  return interfaces;
}

/**
 * Extract scenario blocks from markdown content.
 *
 * Scenarios are identified by `#### Scenario:` headings.
 *
 * @param content - Raw markdown text
 * @returns Array of parsed scenario definitions
 */
export function extractScenarios(content: string): ScenarioDef[] {
  const scenarios: ScenarioDef[] = [];

  // Match requirement IDs that precede scenarios
  const requirementRegex = /### Requirement:\s*([^\n]+)\s*\n[\s\S]*?(?=### Requirement:|\n## |$)/g;

  let reqMatch: RegExpExecArray | null;
  while ((reqMatch = requirementRegex.exec(content)) !== null) {
    const reqBlock = reqMatch[0];
    const reqIdMatch = reqBlock.match(/\((FR-[A-Z]+-\d{3})\)/);
    const requirementId = reqIdMatch ? reqIdMatch[1] : undefined;

    const scenarioRegex = /#### Scenario:\s*(.+?)\n([\s\S]*?)(?=#### Scenario:|### Requirement:|## |$)/g;

    let scenMatch: RegExpExecArray | null;
    while ((scenMatch = scenarioRegex.exec(reqBlock)) !== null) {
      const title = scenMatch[1].trim();
      const scenarioContent = scenMatch[2].trim();
      scenarios.push({ title, content: scenarioContent, requirementId });
    }
  }

  // Also try a global scan for scenarios not nested under requirements
  const globalScenarioRegex = /#### Scenario:\s*(.+?)\n([\s\S]*?)(?=#### Scenario:|### Requirement:|## |$)/g;

  let globalMatch: RegExpExecArray | null;
  while ((globalMatch = globalScenarioRegex.exec(content)) !== null) {
    const title = globalMatch[1].trim();
    const scenarioContent = globalMatch[2].trim();
    // Only add if not already present
    if (!scenarios.some((s) => s.title === title)) {
      scenarios.push({ title, content: scenarioContent });
    }
  }

  return scenarios;
}

/** Clean JSDoc comment text by removing leading asterisks and extra whitespace */
function cleanDocComment(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** Parse properties from an interface body string */
function parseProperties(body: string): PropertyDef[] {
  const properties: PropertyDef[] = [];

  const lines = body.split("\n");
  let pendingDoc: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    // Capture JSDoc-style single-line comments inside interface body
    if (line.startsWith("//")) {
      pendingDoc = line.replace(/^\/\/\s*/, "").trim();
      continue;
    }

    // Capture JSDoc-style multi-line comments inside interface body: /** ... */
    if (line.startsWith("/**")) {
      const endIdx = line.indexOf("*/");
      if (endIdx !== -1) {
        pendingDoc = line
          .slice(line.indexOf("/**") + 3, endIdx)
          .replace(/^\s*\*\s?/, "")
          .trim();
      } else {
        pendingDoc = line.replace(/^\/\*\*\s*\*?\s?/, "").trim();
      }
      continue;
    }

    // Match property declaration: name?: type; or name: type;
    const propMatch = line.match(/^(\w+)(\?)?:\s*([^;]+);?\s*$/);
    if (propMatch) {
      const name = propMatch[1];
      const optional = propMatch[2] === "?";
      const type = propMatch[3].trim();
      properties.push({ name, type, optional, doc: pendingDoc });
      pendingDoc = undefined;
    }
  }

  return properties;
}
