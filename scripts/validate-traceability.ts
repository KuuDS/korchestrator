/**
 * Requirement traceability validation tool.
 *
 * Scans OpenSpec spec files for FR-* requirement IDs and TypeScript source
 * files for JSDoc annotations (@implements, @satisfies), then validates
 * bidirectional coverage.
 *
 * Usage:
 *   npx tsx scripts/validate-traceability.ts [options]
 *
 * Options:
 *   --specs-dir <dir>   Specs directory (default: openspec/specs)
 *   --src-dir <dir>     Source directory (default: src)
 *   --tests-dir <dir>   Tests directory (default: tests)
 *   --format <format>   Output format: text | json (default: text)
 *   --since <date>      Only check files modified since date (ISO 8601)
 *   --verbose           Detailed per-file scanning output
 *   --help              Show usage
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

// =============================================================================
// Types
// =============================================================================

/** A single requirement extracted from a spec file. */
export interface RequirementEntry {
  /** The FR-* ID, e.g. FR-PLAN-001 */
  frId: string;

  /** Capability name derived from the spec file path. */
  capability: string;

  /** Path to the spec file, relative to cwd. */
  specFile: string;

  /** Human-readable requirement name from the header. */
  requirementName: string;
}

/** A single code annotation extracted from a TypeScript file. */
export interface AnnotationEntry {
  /** The FR-* ID referenced by the annotation. */
  frId: string;

  /** Path to the source file, relative to cwd. */
  file: string;

  /** 1-based line number of the annotation tag. */
  line: number;

  /** The JSDoc tag: "implements" or "satisfies". */
  tag: "implements" | "satisfies";

  /** Surrounding context (the JSDoc block line). */
  context: string;
}

/** A malformed annotation found during scanning. */
export interface MalformedAnnotation {
  /** Path to the source file. */
  file: string;

  /** 1-based line number. */
  line: number;

  /** The raw malformed text. */
  text: string;

  /** Reason why it is malformed. */
  reason: string;
}

/** Structured coverage report. */
export interface TraceabilityReport {
  /** Total number of requirements found in specs. */
  totalRequirements: number;

  /** Number of requirements covered by at least one annotation. */
  coveredRequirements: number;

  /** Requirements with no annotations. */
  uncoveredRequirements: RequirementEntry[];

  /** Annotations referencing non-existent requirements. */
  orphanedAnnotations: AnnotationEntry[];

  /** Coverage percentage (0-100). */
  coveragePercent: number;

  /** Malformed annotations detected. */
  malformedAnnotations: MalformedAnnotation[];
}

/** CLI options parsed from process.argv. */
export interface CliOptions {
  specsDir: string;
  srcDir: string;
  testsDir: string;
  format: "text" | "json";
  since: Date | null;
  verbose: boolean;
  help: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Regex for FR-* IDs: FR-<CAPS>-<3+digits>[optional letter]. */
export const FR_ID_REGEX = /FR-[A-Z]+-\d{3,}[a-zA-Z]?/g;

/** Regex for requirement headers like "### Requirement: Name (FR-PLAN-001)" */
export const REQUIREMENT_HEADER_REGEX = /^#{3,4}\s+Requirement:\s+(.+)/;

/** Regex for JSDoc annotation tags: "@implements {FR-XXX-NNN}" or "@satisfies {FR-XXX-NNN}" */
export const ANNOTATION_TAG_REGEX =
  /@(implements|satisfies)\s*\{([A-Z0-9a-z-]+)\}/g;

/** Regex for malformed annotations (missing braces). */
export const MALFORMED_ANNOTATION_REGEX =
  /@(implements|satisfies)\s+([A-Z0-9a-z-]+)(?!\s*\{)/g;

// =============================================================================
// File System Helpers
// =============================================================================

/**
 * Recursively list all files matching an extension under a directory.
 *
 * @param dir - Directory to scan
 * @param ext - File extension to match (e.g. ".md", ".ts")
 * @returns Array of absolute file paths
 */
export function listFilesRecursive(dir: string, ext: string): string[] {
  const results: string[] = [];
  const stack: string[] = [dir];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry);
      try {
        const st = statSync(fullPath);
        if (st.isDirectory()) {
          stack.push(fullPath);
        } else if (st.isFile() && fullPath.endsWith(ext)) {
          results.push(fullPath);
        }
      } catch {
        // ignore inaccessible files
      }
    }
  }

  return results;
}

/**
 * Check whether a file was modified on or after a given date.
 *
 * @param filePath - Absolute path to the file
 * @param since - Date threshold
 * @returns true if the file mtime >= since
 */
export function isModifiedSince(filePath: string, since: Date): boolean {
  try {
    const st = statSync(filePath);
    return st.mtime >= since;
  } catch {
    return false;
  }
}

// =============================================================================
// Spec Scanner
// =============================================================================

/**
 * Extract the capability name from a spec file path.
 * E.g. "openspec/specs/planner/spec.md" returns "planner"
 *
 * @param specFile - Absolute or relative path to the spec file
 * @param specsDir - Root specs directory
 * @returns Capability name
 */
export function extractCapability(specFile: string, specsDir: string): string {
  const rel = relative(specsDir, specFile);
  const firstSegment = rel.split(/[/\\]/)[0];
  return firstSegment ?? "unknown";
}

/**
 * Parse a spec markdown file and extract requirements.
 *
 * Only FR-* IDs that appear under a "### Requirement:" or "#### Requirement:"
 * header are recorded. IDs in paragraphs, examples, or other contexts are
 * ignored.
 *
 * @param specFile - Absolute path to the spec file
 * @param specsDir - Root specs directory (for capability extraction)
 * @returns Array of requirement entries
 */
export function parseSpecFile(
  specFile: string,
  specsDir: string
): RequirementEntry[] {
  const content = readFileSync(specFile, "utf-8");
  const lines = content.split("\n");
  const requirements: RequirementEntry[] = [];
  let inRequirementHeader = false;
  let currentHeader = "";

  for (const line of lines) {
    const match = REQUIREMENT_HEADER_REGEX.exec(line);
    if (match !== null) {
      inRequirementHeader = true;
      currentHeader = match[1] ?? "";
      const ids = extractFrIds(currentHeader);
      const capability = extractCapability(specFile, specsDir);
      for (const frId of ids) {
        requirements.push({
          frId,
          capability,
          specFile: relative(process.cwd(), specFile),
          requirementName: currentHeader.replace("(" + frId + ")", "").trim(),
        });
      }
      continue;
    }

    if (inRequirementHeader) {
      // Stop considering this requirement block once we hit another header
      // at the same or higher level (e.g. another ### or ##)
      if (/^#{1,4}\s/.test(line) && !line.startsWith("#####")) {
        inRequirementHeader = false;
        currentHeader = "";
      }
    }
  }

  return requirements;
}

/**
 * Extract all FR-* IDs from a string.
 *
 * @param text - Text to search
 * @returns Array of FR-* IDs
 */
export function extractFrIds(text: string): string[] {
  const matches = text.matchAll(FR_ID_REGEX);
  return Array.from(matches).map((m) => m[0]);
}

/**
 * Scan all spec files in a directory and build a requirement registry.
 *
 * @param specsDir - Root specs directory
 * @param since - Optional date filter
 * @returns Map of frId to RequirementEntry array (multiple specs may define same ID)
 */
export function scanSpecs(
  specsDir: string,
  since: Date | null
): Map<string, RequirementEntry[]> {
  const files = listFilesRecursive(specsDir, ".md");
  const registry = new Map<string, RequirementEntry[]>();

  for (const file of files) {
    if (since !== null && !isModifiedSince(file, since)) {
      continue;
    }
    const reqs = parseSpecFile(file, specsDir);
    for (const req of reqs) {
      const existing = registry.get(req.frId);
      if (existing !== undefined) {
        existing.push(req);
      } else {
        registry.set(req.frId, [req]);
      }
    }
  }

  return registry;
}

// =============================================================================
// Code Annotation Scanner
// =============================================================================

/**
 * Parse a TypeScript file and extract JSDoc requirement annotations.
 *
 * Only scans JSDoc comment blocks (slash-star ... star-slash). FR-* IDs in regular
 * comments or string literals are ignored.
 *
 * @param filePath - Absolute path to the TypeScript file
 * @returns Object with annotations and malformed findings
 */
export function parseTypeScriptFile(filePath: string): {
  annotations: AnnotationEntry[];
  malformed: MalformedAnnotation[];
} {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const annotations: AnnotationEntry[] = [];
  const malformed: MalformedAnnotation[] = [];

  let inJsDoc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("/**")) {
      inJsDoc = true;
      // Handle single-line JSDoc: /** ... */
      if (trimmed.endsWith("*/")) {
        const blockContent = trimmed.slice(3, -2).trim();
        const result = extractAnnotationsFromBlock(
          blockContent,
          filePath,
          i + 1
        );
        annotations.push(...result.annotations);
        malformed.push(...result.malformed);
        inJsDoc = false;
      }
      continue;
    }

    if (inJsDoc && trimmed.endsWith("*/")) {
      inJsDoc = false;
      continue;
    }

    if (inJsDoc) {
      const result = extractAnnotationsFromBlock(
        trimmed.replace(/^\*\s?/, ""),
        filePath,
        i + 1
      );
      annotations.push(...result.annotations);
      malformed.push(...result.malformed);
    }
  }

  return { annotations, malformed };
}

/**
 * Extract annotations and malformed annotations from a single JSDoc line.
 *
 * @param line - The JSDoc line content (without slash-star prefix and star-slash suffix)
 * @param filePath - Absolute path to the source file
 * @param lineNumber - 1-based line number
 * @returns Extracted annotations and malformed entries
 */
export function extractAnnotationsFromBlock(
  line: string,
  filePath: string,
  lineNumber: number
): { annotations: AnnotationEntry[]; malformed: MalformedAnnotation[] } {
  const annotations: AnnotationEntry[] = [];
  const malformed: MalformedAnnotation[] = [];

  // Find valid annotations with braces
  const validMatches = line.matchAll(ANNOTATION_TAG_REGEX);
  for (const match of validMatches) {
    const tag = match[1] as "implements" | "satisfies";
    const frId = match[2];
    if (isValidFrId(frId)) {
      annotations.push({
        frId,
        file: relative(process.cwd(), filePath),
        line: lineNumber,
        tag,
        context: line.trim(),
      });
    }
  }

  // Find malformed annotations (missing braces)
  const malformedMatches = line.matchAll(MALFORMED_ANNOTATION_REGEX);
  for (const match of malformedMatches) {
    // Skip if this was already matched by the valid regex
    const fullMatch = match[0];
    const frId = match[2];
    if (!isValidFrId(frId)) {
      malformed.push({
        file: relative(process.cwd(), filePath),
        line: lineNumber,
        text: fullMatch,
        reason: "Invalid FR-ID format: " + frId,
      });
    } else if (!line.includes("{" + frId + "}")) {
      malformed.push({
        file: relative(process.cwd(), filePath),
        line: lineNumber,
        text: fullMatch,
        reason: "Missing braces around FR-ID",
      });
    }
  }

  return { annotations, malformed };
}

/**
 * Validate whether a string matches the FR-* ID pattern.
 *
 * @param id - Candidate ID
 * @returns true if the ID matches FR-[A-Z]+-\d{3,}[a-zA-Z]?
 */
export function isValidFrId(id: string): boolean {
  return /^FR-[A-Z]+-\d{3,}[a-zA-Z]?$/.test(id);
}

/**
 * Scan TypeScript files in a directory for requirement annotations.
 *
 * @param dir - Directory to scan
 * @param since - Optional date filter
 * @returns Object with annotation registry and malformed list
 */
export function scanTypeScriptFiles(
  dir: string,
  since: Date | null
): {
  registry: Map<string, AnnotationEntry[]>;
  malformed: MalformedAnnotation[];
} {
  const files = listFilesRecursive(dir, ".ts");
  const registry = new Map<string, AnnotationEntry[]>();
  const malformed: MalformedAnnotation[] = [];

  for (const file of files) {
    if (since !== null && !isModifiedSince(file, since)) {
      continue;
    }
    const result = parseTypeScriptFile(file);
    for (const ann of result.annotations) {
      const existing = registry.get(ann.frId);
      if (existing !== undefined) {
        existing.push(ann);
      } else {
        registry.set(ann.frId, [ann]);
      }
    }
    malformed.push(...result.malformed);
  }

  return { registry, malformed };
}

// =============================================================================
// Coverage Validation
// =============================================================================

/**
 * Compare requirement registry against annotation registry and produce
 * a structured coverage report.
 *
 * @param reqRegistry - Map of frId to RequirementEntry array
 * @param annRegistry - Map of frId to AnnotationEntry array
 * @param malformed - List of malformed annotations
 * @returns TraceabilityReport
 */
export function validateCoverage(
  reqRegistry: Map<string, RequirementEntry[]>,
  annRegistry: Map<string, AnnotationEntry[]>,
  malformed: MalformedAnnotation[]
): TraceabilityReport {
  const totalRequirements = reqRegistry.size;
  let coveredRequirements = 0;
  const uncoveredRequirements: RequirementEntry[] = [];
  const orphanedAnnotations: AnnotationEntry[] = [];

  for (const [frId, entries] of reqRegistry) {
    const hasAnnotation = annRegistry.has(frId);
    if (hasAnnotation) {
      coveredRequirements++;
    } else {
      // Use the first entry as the representative
      uncoveredRequirements.push(entries[0]);
    }
  }

  for (const [frId, entries] of annRegistry) {
    if (!reqRegistry.has(frId)) {
      orphanedAnnotations.push(...entries);
    }
  }

  const coveragePercent =
    totalRequirements === 0
      ? 0
      : Math.round((coveredRequirements / totalRequirements) * 100 * 100) / 100;

  return {
    totalRequirements,
    coveredRequirements,
    uncoveredRequirements,
    orphanedAnnotations,
    coveragePercent,
    malformedAnnotations: malformed,
  };
}

// =============================================================================
// Output Formatters
// =============================================================================

/**
 * Format a traceability report as human-readable text with ANSI colors.
 *
 * @param report - The report to format
 * @returns Text string
 */
export function formatTextReport(report: TraceabilityReport): string {
  const lines: string[] = [];
  lines.push("===============================================================");
  lines.push("  Requirement Traceability Report");
  lines.push("===============================================================");
  lines.push("");

  // Summary
  const statusColor =
    report.uncoveredRequirements.length === 0 &&
    report.orphanedAnnotations.length === 0 &&
    report.malformedAnnotations.length === 0
      ? "\x1b[32m" // green
      : "\x1b[31m"; // red
  const reset = "\x1b[0m";

  lines.push("  Total Requirements:    " + report.totalRequirements);
  lines.push("  Covered:               " + report.coveredRequirements);
  lines.push("  Uncovered:             " + report.uncoveredRequirements.length);
  lines.push("  Orphaned Annotations:  " + report.orphanedAnnotations.length);
  lines.push("  Malformed:             " + report.malformedAnnotations.length);
  lines.push("  Coverage:              " + statusColor + report.coveragePercent + "%" + reset);
  lines.push("");

  // Uncovered
  if (report.uncoveredRequirements.length > 0) {
    lines.push("  -------------------------------------------------------------");
    lines.push("  Uncovered Requirements");
    lines.push("  -------------------------------------------------------------");
    for (const req of report.uncoveredRequirements) {
      lines.push("    - " + req.frId + " - " + req.requirementName);
      lines.push("      " + req.specFile);
    }
    lines.push("");
  }

  // Orphaned
  if (report.orphanedAnnotations.length > 0) {
    lines.push("  -------------------------------------------------------------");
    lines.push("  Orphaned Annotations");
    lines.push("  -------------------------------------------------------------");
    for (const ann of report.orphanedAnnotations) {
      lines.push(
        "    - " + ann.frId + " (" + ann.tag + ") - " + ann.file + ":" + ann.line
      );
    }
    lines.push("");
  }

  // Malformed
  if (report.malformedAnnotations.length > 0) {
    lines.push("  -------------------------------------------------------------");
    lines.push("  Malformed Annotations");
    lines.push("  -------------------------------------------------------------");
    for (const m of report.malformedAnnotations) {
      lines.push("    - " + m.file + ":" + m.line + " - " + m.reason);
      lines.push("      " + m.text);
    }
    lines.push("");
  }

  // Final status
  if (
    report.uncoveredRequirements.length === 0 &&
    report.orphanedAnnotations.length === 0 &&
    report.malformedAnnotations.length === 0
  ) {
    lines.push(statusColor + "  OK All requirements covered with no issues." + reset);
  } else {
    lines.push(
      statusColor + "  FAIL Found " + (report.uncoveredRequirements.length + report.orphanedAnnotations.length + report.malformedAnnotations.length) + " issue(s)." + reset
    );
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Format a traceability report as JSON.
 *
 * @param report - The report to format
 * @returns JSON string
 */
export function formatJsonReport(report: TraceabilityReport): string {
  return JSON.stringify(
    {
      totalRequirements: report.totalRequirements,
      coveredRequirements: report.coveredRequirements,
      uncoveredRequirements: report.uncoveredRequirements.map((r) => ({
        frId: r.frId,
        capability: r.capability,
        specFile: r.specFile,
        requirementName: r.requirementName,
      })),
      orphanedAnnotations: report.orphanedAnnotations.map((a) => ({
        frId: a.frId,
        file: a.file,
        line: a.line,
        tag: a.tag,
      })),
      coveragePercent: report.coveragePercent,
      malformedAnnotations: report.malformedAnnotations.map((m) => ({
        file: m.file,
        line: m.line,
        text: m.text,
        reason: m.reason,
      })),
    },
    null,
    2
  );
}

// =============================================================================
// CLI
// =============================================================================

/**
 * Parse CLI arguments into a structured options object.
 *
 * @param args - process.argv.slice(2)
 * @returns Parsed CliOptions
 */
export function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    specsDir: "openspec/specs",
    srcDir: "src",
    testsDir: "tests",
    format: "text",
    since: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--specs-dir":
        options.specsDir = args[++i] ?? options.specsDir;
        break;
      case "--src-dir":
        options.srcDir = args[++i] ?? options.srcDir;
        break;
      case "--tests-dir":
        options.testsDir = args[++i] ?? options.testsDir;
        break;
      case "--format":
        options.format = (args[++i] as "text" | "json") ?? "text";
        break;
      case "--since": {
        const dateStr = args[++i];
        if (dateStr !== undefined) {
          options.since = new Date(dateStr);
        }
        break;
      }
      case "--verbose":
        options.verbose = true;
        break;
      case "--help":
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Print usage information to stdout.
 */
export function printUsage(): void {
  console.log(
    "\n" +
    "Usage: npx tsx scripts/validate-traceability.ts [options]\n" +
    "\n" +
    "Options:\n" +
    "  --specs-dir <dir>   Specs directory (default: openspec/specs)\n" +
    "  --src-dir <dir>     Source directory (default: src)\n" +
    "  --tests-dir <dir>   Tests directory (default: tests)\n" +
    "  --format <format>   Output format: text | json (default: text)\n" +
    "  --since <date>      Only check files modified since date (ISO 8601)\n" +
    "  --verbose           Detailed per-file scanning output\n" +
    "  --help              Show this help message\n" +
    "\n" +
    "Exit codes:\n" +
    "  0  All requirements covered, no orphaned annotations\n" +
    "  1  Uncovered requirements or orphaned annotations found\n"
  );
}

/**
 * Main entry point for the traceability validator.
 *
 * @param args - CLI arguments (process.argv.slice(2))
 * @returns Exit code (0 or 1)
 */
export function main(args: string[]): number {
  const options = parseCliArgs(args);

  if (options.help) {
    printUsage();
    return 0;
  }

  if (options.verbose) {
    console.log("Scanning specs:   " + options.specsDir);
    console.log("Scanning src:     " + options.srcDir);
    console.log("Scanning tests:   " + options.testsDir);
    if (options.since !== null) {
      console.log("Since:            " + options.since.toISOString());
    }
    console.log("");
  }

  const reqRegistry = scanSpecs(options.specsDir, options.since);

  const srcResult = scanTypeScriptFiles(options.srcDir, options.since);
  const testResult = scanTypeScriptFiles(options.testsDir, options.since);

  // Merge annotation registries
  const annRegistry = new Map<string, AnnotationEntry[]>();
  for (const [frId, entries] of srcResult.registry) {
    annRegistry.set(frId, entries);
  }
  for (const [frId, entries] of testResult.registry) {
    const existing = annRegistry.get(frId);
    if (existing !== undefined) {
      existing.push(...entries);
    } else {
      annRegistry.set(frId, entries);
    }
  }

  const malformed = [...srcResult.malformed, ...testResult.malformed];

  if (options.verbose) {
    console.log("Found " + reqRegistry.size + " requirements in specs");
    console.log("Found " + annRegistry.size + " annotated requirements in code");
    console.log("Found " + malformed.length + " malformed annotations");
    console.log("");
  }

  const report = validateCoverage(reqRegistry, annRegistry, malformed);

  if (options.format === "json") {
    console.log(formatJsonReport(report));
  } else {
    console.log(formatTextReport(report));
  }

  const hasIssues =
    report.uncoveredRequirements.length > 0 ||
    report.orphanedAnnotations.length > 0 ||
    report.malformedAnnotations.length > 0;

  return hasIssues ? 1 : 0;
}

// Run if executed directly
if (import.meta.url === "file://" + process.argv[1]) {
  const exitCode = main(process.argv.slice(2));
  process.exit(exitCode);
}
