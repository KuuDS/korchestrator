/**
 * Requirement Traceability Validator
 *
 * Ensures every FR-* requirement ID from the PRD has:
 * 1. A corresponding OpenSpec spec entry
 * 2. At least one code reference (JSDoc or comment)
 *
 * Usage: npx ts-node scripts/validate-traceability.ts
 */

import { readFileSync } from "fs";
import { globSync } from "glob";

interface RequirementTrace {
  id: string;
  specFiles: string[];
  codeFiles: string[];
  status: "missing-spec" | "missing-code" | "complete" | "unknown";
}

/**
 * Extract all FR-* requirement IDs from the PRD
 */
function extractPRDRequirements(): string[] {
  const prdContent = readFileSync("docs/openclaw-plan-task-build-prd.md", "utf-8");
  const requirementRegex = /#### (FR-[A-Z]+-\d{3})/g;
  const requirements: string[] = [];

  let match;
  while ((match = requirementRegex.exec(prdContent)) !== null) {
    requirements.push(match[1]);
  }

  return [...new Set(requirements)].sort();
}

/**
 * Find spec files referencing each requirement
 */
function findSpecReferences(requirementIds: string[]): Map<string, string[]> {
  const specFiles = globSync("openspec/specs/**/*.md");
  const references = new Map<string, string[]>();

  for (const id of requirementIds) {
    references.set(id, []);
  }

  for (const file of specFiles) {
    const content = readFileSync(file, "utf-8");
    for (const id of requirementIds) {
      if (content.includes(id)) {
        references.get(id)!.push(file);
      }
    }
  }

  return references;
}

/**
 * Find code files referencing each requirement
 */
function findCodeReferences(requirementIds: string[]): Map<string, string[]> {
  const codeFiles = globSync("src/**/*.{ts,tsx}");
  const references = new Map<string, string[]>();

  for (const id of requirementIds) {
    references.set(id, []);
  }

  for (const file of codeFiles) {
    const content = readFileSync(file, "utf-8");
    for (const id of requirementIds) {
      if (content.includes(id)) {
        references.get(id)!.push(file);
      }
    }
  }

  return references;
}

/**
 * Validate traceability and generate report
 */
function validate(): void {
  console.log("Requirement Traceability Validation");
  console.log("====================================\n");

  const requirements = extractPRDRequirements();
  console.log(`Found ${requirements.length} requirements in PRD:\n`);

  const specRefs = findSpecReferences(requirements);
  const codeRefs = findCodeReferences(requirements);

  const traces: RequirementTrace[] = requirements.map((id) => {
    const specFiles = specRefs.get(id) || [];
    const codeFiles = codeRefs.get(id) || [];

    let status: RequirementTrace["status"];
    if (specFiles.length === 0) {
      status = "missing-spec";
    } else if (codeFiles.length === 0) {
      status = "missing-code";
    } else {
      status = "complete";
    }

    return { id, specFiles, codeFiles, status };
  });

  // Summary
  const complete = traces.filter((t) => t.status === "complete").length;
  const missingSpec = traces.filter((t) => t.status === "missing-spec").length;
  const missingCode = traces.filter((t) => t.status === "missing-code").length;

  console.log(`Complete:     ${complete}/${requirements.length}`);
  console.log(`Missing spec: ${missingSpec}/${requirements.length}`);
  console.log(`Missing code: ${missingCode}/${requirements.length}\n`);

  // Details
  console.log("Detailed Report:");
  console.log("----------------\n");

  for (const trace of traces) {
    const statusIcon =
      trace.status === "complete"
        ? "✓"
        : trace.status === "missing-spec"
          ? "✗"
          : "⚠";
    console.log(`${statusIcon} ${trace.id}`);

    if (trace.specFiles.length > 0) {
      console.log(`  Spec:  ${trace.specFiles.join(", ")}`);
    } else {
      console.log(`  Spec:  NOT FOUND`);
    }

    if (trace.codeFiles.length > 0) {
      console.log(`  Code:  ${trace.codeFiles.join(", ")}`);
    } else {
      console.log(`  Code:  NOT FOUND`);
    }
    console.log("");
  }

  // Exit with error if incomplete
  if (missingSpec > 0 || missingCode > 0) {
    console.error(
      `\nValidation failed: ${missingSpec + missingCode} requirements lack full traceability.`
    );
    process.exit(1);
  }

  console.log("\n✓ All requirements have complete traceability.");
}

// Run if executed directly
if (require.main === module) {
  validate();
}

export { extractPRDRequirements, findSpecReferences, findCodeReferences };
