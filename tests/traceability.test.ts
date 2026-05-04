import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  extractFrIds,
  isValidFrId,
  parseSpecFile,
  parseTypeScriptFile,
  extractAnnotationsFromBlock,
  validateCoverage,
  formatJsonReport,
  formatTextReport,
  parseCliArgs,
  main,
  type RequirementEntry,
  type AnnotationEntry,
  type MalformedAnnotation,
} from "../scripts/validate-traceability.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function createTempDir(): string {
  const dir = join(tmpdir(), `traceability-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// extractFrIds
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractFrIds", () => {
  it("extracts FR-PLAN-001 from text", () => {
    expect(extractFrIds("This refers to FR-PLAN-001 in a sentence")).toEqual([
      "FR-PLAN-001",
    ]);
  });

  it("extracts multiple FR-* IDs", () => {
    const text = "FR-PLAN-001 and FR-TASK-002 and FR-BUILD-003a";
    expect(extractFrIds(text)).toEqual([
      "FR-PLAN-001",
      "FR-TASK-002",
      "FR-BUILD-003a",
    ]);
  });

  it("returns empty array when no IDs present", () => {
    expect(extractFrIds("No requirements here")).toEqual([]);
  });

  it("handles letter suffixes", () => {
    expect(extractFrIds("FR-BUILD-003a")).toEqual(["FR-BUILD-003a"]);
    expect(extractFrIds("FR-BUILD-003b")).toEqual(["FR-BUILD-003b"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isValidFrId
// ═══════════════════════════════════════════════════════════════════════════════

describe("isValidFrId", () => {
  it("accepts valid FR-* IDs", () => {
    expect(isValidFrId("FR-PLAN-001")).toBe(true);
    expect(isValidFrId("FR-TASK-1234")).toBe(true);
    expect(isValidFrId("FR-BUILD-003a")).toBe(true);
  });

  it("rejects invalid FR-* IDs", () => {
    expect(isValidFrId("FR-PLAN-01")).toBe(false);
    expect(isValidFrId("FR-plan-001")).toBe(false);
    expect(isValidFrId("FR-001")).toBe(false);
    expect(isValidFrId("PLAN-001")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseSpecFile
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseSpecFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it("extracts requirements from spec markdown", () => {
    const specContent = `# Planner Spec

### Requirement: Complexity Classification (FR-PLAN-001)

Some description here.

### Requirement: Task Decomposition (FR-PLAN-002)

More description.
`;
    const specFile = join(tmpDir, "planner", "spec.md");
    mkdirSync(join(tmpDir, "planner"), { recursive: true });
    writeFileSync(specFile, specContent);

    const reqs = parseSpecFile(specFile, tmpDir);
    expect(reqs).toHaveLength(2);
    expect(reqs[0].frId).toBe("FR-PLAN-001");
    expect(reqs[0].requirementName).toBe("Complexity Classification");
    expect(reqs[0].capability).toBe("planner");
    expect(reqs[1].frId).toBe("FR-PLAN-002");
  });

  it("ignores FR-* IDs in non-requirement contexts", () => {
    const specContent = `# Planner Spec

Some paragraph mentioning FR-PLAN-999.

### Requirement: Real Requirement (FR-PLAN-001)

This is the real one.
`;
    const specFile = join(tmpDir, "planner", "spec.md");
    mkdirSync(join(tmpDir, "planner"), { recursive: true });
    writeFileSync(specFile, specContent);

    const reqs = parseSpecFile(specFile, tmpDir);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].frId).toBe("FR-PLAN-001");
  });

  it("handles letter suffixes in requirement IDs", () => {
    const specContent = `### Requirement: Build Strategy (FR-BUILD-003a)
`;
    const specFile = join(tmpDir, "build", "spec.md");
    mkdirSync(join(tmpDir, "build"), { recursive: true });
    writeFileSync(specFile, specContent);

    const reqs = parseSpecFile(specFile, tmpDir);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].frId).toBe("FR-BUILD-003a");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseTypeScriptFile
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseTypeScriptFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it("extracts @implements annotations from JSDoc", () => {
    const code = `
/**
 * Classifies user requests.
 * @implements {FR-PLAN-001}
 */
export function classify(request: string): string {
  return "simple";
}
`;
    const file = join(tmpDir, "planner.ts");
    writeFileSync(file, code);

    const result = parseTypeScriptFile(file);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].frId).toBe("FR-PLAN-001");
    expect(result.annotations[0].tag).toBe("implements");
    expect(result.annotations[0].line).toBe(4);
  });

  it("extracts @satisfies annotations from JSDoc", () => {
    const code = `
/**
 * @satisfies {FR-BUILD-003a}
 */
it("should retry failed tasks", () => {
  expect(true).toBe(true);
});
`;
    const file = join(tmpDir, "test.ts");
    writeFileSync(file, code);

    const result = parseTypeScriptFile(file);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].frId).toBe("FR-BUILD-003a");
    expect(result.annotations[0].tag).toBe("satisfies");
  });

  it("handles multiple annotations per JSDoc block", () => {
    const code = `
/**
 * @implements {FR-PLAN-001}
 * @implements {FR-PLAN-002}
 */
export class Planner {}
`;
    const file = join(tmpDir, "planner.ts");
    writeFileSync(file, code);

    const result = parseTypeScriptFile(file);
    expect(result.annotations).toHaveLength(2);
    expect(result.annotations[0].frId).toBe("FR-PLAN-001");
    expect(result.annotations[1].frId).toBe("FR-PLAN-002");
  });

  it("ignores FR-* IDs in non-JSDoc comments", () => {
    const code = `
// This function implements FR-PLAN-001
export function classify(request: string): string {
  return "simple";
}
`;
    const file = join(tmpDir, "planner.ts");
    writeFileSync(file, code);

    const result = parseTypeScriptFile(file);
    expect(result.annotations).toHaveLength(0);
  });

  it("ignores FR-* IDs in string literals", () => {
    const code = `
export const msg = "See FR-PLAN-001 for details";
`;
    const file = join(tmpDir, "planner.ts");
    writeFileSync(file, code);

    const result = parseTypeScriptFile(file);
    expect(result.annotations).toHaveLength(0);
  });

  it("reports malformed annotations", () => {
    const code = `
/** @implements FR-PLAN-001 */
export function classify(request: string): string {
  return "simple";
}
`;
    const file = join(tmpDir, "planner.ts");
    writeFileSync(file, code);

    const result = parseTypeScriptFile(file);
    expect(result.annotations).toHaveLength(0);
    expect(result.malformed.length).toBeGreaterThan(0);
    expect(result.malformed[0].reason).toContain("Missing braces");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractAnnotationsFromBlock
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractAnnotationsFromBlock", () => {
  it("extracts valid annotation", () => {
    const result = extractAnnotationsFromBlock(
      "@implements {FR-PLAN-001}",
      "/src/planner.ts",
      5
    );
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].frId).toBe("FR-PLAN-001");
    expect(result.annotations[0].tag).toBe("implements");
  });

  it("extracts multiple annotations in one line", () => {
    const result = extractAnnotationsFromBlock(
      "@implements {FR-PLAN-001} @satisfies {FR-PLAN-002}",
      "/src/planner.ts",
      5
    );
    expect(result.annotations).toHaveLength(2);
  });

  it("reports malformed annotation without braces", () => {
    const result = extractAnnotationsFromBlock(
      "@implements FR-PLAN-001",
      "/src/planner.ts",
      5
    );
    expect(result.annotations).toHaveLength(0);
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0].reason).toContain("Missing braces");
  });

  it("ignores invalid FR-ID format", () => {
    const result = extractAnnotationsFromBlock(
      "@implements FR-01",
      "/src/planner.ts",
      5
    );
    expect(result.annotations).toHaveLength(0);
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0].reason).toContain("Invalid FR-ID format");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// validateCoverage
// ═══════════════════════════════════════════════════════════════════════════════

describe("validateCoverage", () => {
  it("detects uncovered requirements", () => {
    const reqRegistry = new Map<string, RequirementEntry[]>();
    reqRegistry.set("FR-PLAN-001", [
      {
        frId: "FR-PLAN-001",
        capability: "planner",
        specFile: "openspec/specs/planner/spec.md",
        requirementName: "Complexity Classification",
      },
    ]);

    const annRegistry = new Map<string, AnnotationEntry[]>();
    const malformed: MalformedAnnotation[] = [];

    const report = validateCoverage(reqRegistry, annRegistry, malformed);
    expect(report.totalRequirements).toBe(1);
    expect(report.coveredRequirements).toBe(0);
    expect(report.uncoveredRequirements).toHaveLength(1);
    expect(report.uncoveredRequirements[0].frId).toBe("FR-PLAN-001");
    expect(report.coveragePercent).toBe(0);
  });

  it("detects orphaned annotations", () => {
    const reqRegistry = new Map<string, RequirementEntry[]>();

    const annRegistry = new Map<string, AnnotationEntry[]>();
    annRegistry.set("FR-UNKNOWN-999", [
      {
        frId: "FR-UNKNOWN-999",
        file: "src/planner.ts",
        line: 10,
        tag: "implements",
        context: "@implements {FR-UNKNOWN-999}",
      },
    ]);

    const malformed: MalformedAnnotation[] = [];

    const report = validateCoverage(reqRegistry, annRegistry, malformed);
    expect(report.orphanedAnnotations).toHaveLength(1);
    expect(report.orphanedAnnotations[0].frId).toBe("FR-UNKNOWN-999");
    expect(report.coveragePercent).toBe(0);
  });

  it("calculates coverage percentage correctly", () => {
    const reqRegistry = new Map<string, RequirementEntry[]>();
    reqRegistry.set("FR-PLAN-001", [
      {
        frId: "FR-PLAN-001",
        capability: "planner",
        specFile: "openspec/specs/planner/spec.md",
        requirementName: "Complexity Classification",
      },
    ]);
    reqRegistry.set("FR-PLAN-002", [
      {
        frId: "FR-PLAN-002",
        capability: "planner",
        specFile: "openspec/specs/planner/spec.md",
        requirementName: "Task Decomposition",
      },
    ]);

    const annRegistry = new Map<string, AnnotationEntry[]>();
    annRegistry.set("FR-PLAN-001", [
      {
        frId: "FR-PLAN-001",
        file: "src/planner.ts",
        line: 10,
        tag: "implements",
        context: "@implements {FR-PLAN-001}",
      },
    ]);

    const malformed: MalformedAnnotation[] = [];

    const report = validateCoverage(reqRegistry, annRegistry, malformed);
    expect(report.totalRequirements).toBe(2);
    expect(report.coveredRequirements).toBe(1);
    expect(report.coveragePercent).toBe(50);
  });

  it("reports 100% coverage when all requirements are covered", () => {
    const reqRegistry = new Map<string, RequirementEntry[]>();
    reqRegistry.set("FR-PLAN-001", [
      {
        frId: "FR-PLAN-001",
        capability: "planner",
        specFile: "openspec/specs/planner/spec.md",
        requirementName: "Complexity Classification",
      },
    ]);

    const annRegistry = new Map<string, AnnotationEntry[]>();
    annRegistry.set("FR-PLAN-001", [
      {
        frId: "FR-PLAN-001",
        file: "src/planner.ts",
        line: 10,
        tag: "implements",
        context: "@implements {FR-PLAN-001}",
      },
    ]);

    const malformed: MalformedAnnotation[] = [];

    const report = validateCoverage(reqRegistry, annRegistry, malformed);
    expect(report.coveragePercent).toBe(100);
    expect(report.uncoveredRequirements).toHaveLength(0);
    expect(report.orphanedAnnotations).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// formatJsonReport
// ═══════════════════════════════════════════════════════════════════════════════

describe("formatJsonReport", () => {
  it("produces valid JSON with expected fields", () => {
    const report = {
      totalRequirements: 2,
      coveredRequirements: 1,
      uncoveredRequirements: [
        {
          frId: "FR-PLAN-002",
          capability: "planner",
          specFile: "openspec/specs/planner/spec.md",
          requirementName: "Task Decomposition",
        },
      ],
      orphanedAnnotations: [
        {
          frId: "FR-UNKNOWN-999",
          file: "src/planner.ts",
          line: 10,
          tag: "implements" as const,
          context: "@implements {FR-UNKNOWN-999}",
        },
      ],
      coveragePercent: 50,
      malformedAnnotations: [],
    };

    const json = formatJsonReport(report);
    const parsed = JSON.parse(json);
    expect(parsed.totalRequirements).toBe(2);
    expect(parsed.coveredRequirements).toBe(1);
    expect(parsed.uncoveredRequirements).toHaveLength(1);
    expect(parsed.orphanedAnnotations).toHaveLength(1);
    expect(parsed.coveragePercent).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// formatTextReport
// ═══════════════════════════════════════════════════════════════════════════════

describe("formatTextReport", () => {
  it("includes summary statistics", () => {
    const report = {
      totalRequirements: 2,
      coveredRequirements: 1,
      uncoveredRequirements: [],
      orphanedAnnotations: [],
      coveragePercent: 50,
      malformedAnnotations: [],
    };

    const text = formatTextReport(report);
    expect(text).toContain("Total Requirements:    2");
    expect(text).toContain("Covered:               1");
    expect(text).toContain("Coverage:");
    expect(text).toContain("50%");
  });

  it("lists uncovered requirements", () => {
    const report = {
      totalRequirements: 1,
      coveredRequirements: 0,
      uncoveredRequirements: [
        {
          frId: "FR-PLAN-001",
          capability: "planner",
          specFile: "openspec/specs/planner/spec.md",
          requirementName: "Complexity Classification",
        },
      ],
      orphanedAnnotations: [],
      coveragePercent: 0,
      malformedAnnotations: [],
    };

    const text = formatTextReport(report);
    expect(text).toContain("FR-PLAN-001");
    expect(text).toContain("Complexity Classification");
  });

  it("lists orphaned annotations", () => {
    const report = {
      totalRequirements: 0,
      coveredRequirements: 0,
      uncoveredRequirements: [],
      orphanedAnnotations: [
        {
          frId: "FR-UNKNOWN-999",
          file: "src/planner.ts",
          line: 10,
          tag: "implements" as const,
          context: "@implements {FR-UNKNOWN-999}",
        },
      ],
      coveragePercent: 0,
      malformedAnnotations: [],
    };

    const text = formatTextReport(report);
    expect(text).toContain("FR-UNKNOWN-999");
    expect(text).toContain("src/planner.ts:10");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseCliArgs
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseCliArgs", () => {
  it("parses default options", () => {
    const opts = parseCliArgs([]);
    expect(opts.specsDir).toBe("openspec/specs");
    expect(opts.srcDir).toBe("src");
    expect(opts.testsDir).toBe("tests");
    expect(opts.format).toBe("text");
    expect(opts.since).toBeNull();
    expect(opts.verbose).toBe(false);
    expect(opts.help).toBe(false);
  });

  it("parses custom directories", () => {
    const opts = parseCliArgs([
      "--specs-dir",
      "custom/specs",
      "--src-dir",
      "custom/src",
      "--tests-dir",
      "custom/tests",
    ]);
    expect(opts.specsDir).toBe("custom/specs");
    expect(opts.srcDir).toBe("custom/src");
    expect(opts.testsDir).toBe("custom/tests");
  });

  it("parses --format json", () => {
    const opts = parseCliArgs(["--format", "json"]);
    expect(opts.format).toBe("json");
  });

  it("parses --since date", () => {
    const opts = parseCliArgs(["--since", "2024-01-01"]);
    expect(opts.since).toEqual(new Date("2024-01-01"));
  });

  it("parses --verbose", () => {
    const opts = parseCliArgs(["--verbose"]);
    expect(opts.verbose).toBe(true);
  });

  it("parses --help", () => {
    const opts = parseCliArgs(["--help"]);
    expect(opts.help).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// main (CLI exit codes)
// ═══════════════════════════════════════════════════════════════════════════════

describe("main", () => {
  let tmpDir: string;
  let specsDir: string;
  let srcDir: string;
  let testsDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    specsDir = join(tmpDir, "specs");
    srcDir = join(tmpDir, "src");
    testsDir = join(tmpDir, "tests");
    mkdirSync(specsDir, { recursive: true });
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(testsDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it("returns 0 when coverage is 100% with no orphaned annotations", () => {
    writeFileSync(
      join(specsDir, "planner.md"),
      "### Requirement: Complexity Classification (FR-PLAN-001)\n"
    );
    writeFileSync(
      join(srcDir, "planner.ts"),
      "/** @implements {FR-PLAN-001} */\nexport function classify() {}\n"
    );

    const exitCode = main([
      "--specs-dir",
      specsDir,
      "--src-dir",
      srcDir,
      "--tests-dir",
      testsDir,
      "--format",
      "json",
    ]);
    expect(exitCode).toBe(0);
  });

  it("returns 1 when there are uncovered requirements", () => {
    writeFileSync(
      join(specsDir, "planner.md"),
      "### Requirement: Complexity Classification (FR-PLAN-001)\n"
    );
    writeFileSync(join(srcDir, "planner.ts"), "export function classify() {}\n");

    const exitCode = main([
      "--specs-dir",
      specsDir,
      "--src-dir",
      srcDir,
      "--tests-dir",
      testsDir,
      "--format",
      "json",
    ]);
    expect(exitCode).toBe(1);
  });

  it("returns 1 when there are orphaned annotations", () => {
    writeFileSync(join(specsDir, "planner.md"), "# Empty spec\n");
    writeFileSync(
      join(srcDir, "planner.ts"),
      "/** @implements {FR-UNKNOWN-999} */\nexport function classify() {}\n"
    );

    const exitCode = main([
      "--specs-dir",
      specsDir,
      "--src-dir",
      srcDir,
      "--tests-dir",
      testsDir,
      "--format",
      "json",
    ]);
    expect(exitCode).toBe(1);
  });

  it("returns 0 for --help", () => {
    const exitCode = main(["--help"]);
    expect(exitCode).toBe(0);
  });
});
