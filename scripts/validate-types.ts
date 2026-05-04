/**
 * CLI entry point for spec-to-TypeScript code generation and validation.
 *
 * Usage:
 *   npx tsx scripts/validate-types.ts           # validate existing generated files
 *   npx tsx scripts/validate-types.ts --generate # regenerate all types from specs
 *   npx tsx scripts/validate-types.ts --watch    # watch mode
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { globSync } from "glob";
import { dirname, join, resolve } from "path";
import { watch } from "chokidar";
import { parseSpecFile, extractInterfaces } from "../src/codegen/parser.js";
import { transpileToTypeScript } from "../src/codegen/transpiler.js";
import { generateZodSchemas } from "../src/codegen/zod-generator.js";
import { validateParity } from "../src/codegen/validator.js";
import {
  SpecDefinition,
  GeneratedFile,
  ValidationResult,
} from "../src/codegen/types.js";

const SPECS_GLOB = "openspec/specs/**/*.md";
const OUTPUT_DIR = "src/generated";
const TYPES_FILE = join(OUTPUT_DIR, "types.ts");
const SCHEMAS_FILE = join(OUTPUT_DIR, "schemas.ts");

/**
 * Parse all spec files found by the glob pattern.
 *
 * @returns Array of spec definitions
 */
function loadSpecs(): SpecDefinition[] {
  const files = globSync(SPECS_GLOB);
  const specs: SpecDefinition[] = [];
  for (const file of files) {
    specs.push(...parseSpecFile(file));
  }
  return specs;
}

/**
 * Regenerate TypeScript interfaces and Zod schemas from specs.
 */
function generate(): void {
  console.log("Generating types from specs...\n");

  const specs = loadSpecs();

  if (specs.length === 0) {
    console.warn("No spec files found.");
    return;
  }

  // Flatten all interfaces
  const allInterfaces = specs.flatMap((s) => s.interfaces);

  // Generate TypeScript
  const tsContent = transpileToTypeScript(allInterfaces);
  ensureDir(OUTPUT_DIR);
  writeFileSync(TYPES_FILE, tsContent);
  console.log(`✓ Generated ${TYPES_FILE} (${allInterfaces.length} interfaces)`);

  // Generate Zod schemas
  const zodContent = generateZodSchemas(allInterfaces);
  writeFileSync(SCHEMAS_FILE, zodContent);
  console.log(`✓ Generated ${SCHEMAS_FILE}`);
}

/**
 * Validate existing generated files against specs.
 *
 * @returns Validation result
 */
function validate(): ValidationResult {
  console.log("Validating generated types against specs...\n");

  const specs = loadSpecs();

  const generated: GeneratedFile[] = [];

  if (existsSync(TYPES_FILE)) {
    const content = readFileSync(TYPES_FILE, "utf-8");
    const interfaces = extractInterfaces(content);
    generated.push({ filePath: TYPES_FILE, content, interfaces });
  }

  if (existsSync(SCHEMAS_FILE)) {
    const content = readFileSync(SCHEMAS_FILE, "utf-8");
    const interfaces = extractInterfaces(content);
    generated.push({ filePath: SCHEMAS_FILE, content, interfaces });
  }

  // Flatten generated interfaces across all generated files for parity check
  const allGenInterfaces = generated.flatMap((g) => g.interfaces);
  const mergedGenerated: GeneratedFile[] = [
    {
      filePath: "src/generated",
      content: "",
      interfaces: allGenInterfaces,
    },
  ];

  const result = validateParity(specs, mergedGenerated);

  if (result.success) {
    console.log("✓ All generated types match spec definitions.");
  } else {
    console.error(`✗ Found ${result.errors.length} parity error(s):\n`);
    for (const err of result.errors) {
      console.error(`  [${err.filePath}] ${err.message}`);
    }
  }

  return result;
}

/**
 * Watch spec files and regenerate on change.
 */
function watchMode(): void {
  console.log(`Watching ${SPECS_GLOB} for changes...`);

  generate();

  const watcher = watch(SPECS_GLOB, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on("change", (path: string) => {
    console.log(`\nSpec changed: ${path}`);
    try {
      generate();
      const result = validate();
      if (!result.success) {
        process.exitCode = 1;
      } else {
        process.exitCode = 0;
      }
    } catch (err) {
      console.error("Error during regeneration:", err);
      process.exitCode = 1;
    }
  });

  watcher.on("add", (path: string) => {
    console.log(`\nSpec added: ${path}`);
    try {
      generate();
      validate();
    } catch (err) {
      console.error("Error during regeneration:", err);
    }
  });
}

/** Ensure a directory exists */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Main CLI entry point */
function main(): void {
  const args = process.argv.slice(2);
  const generateFlag = args.includes("--generate");
  const watchFlag = args.includes("--watch");
  const validateFlag = args.includes("--validate") || (!generateFlag && !watchFlag);

  if (generateFlag) {
    generate();
  }

  if (validateFlag) {
    const result = validate();
    if (!result.success) {
      process.exit(1);
    }
  }

  if (watchFlag) {
    watchMode();
  }
}

main();
