/**
 * Integration tests for the full codegen pipeline.
 */

import { describe, it, expect } from "vitest";
import { extractInterfaces, extractScenarios, parseSpecFile } from "../../src/codegen/parser.js";
import { transpileToTypeScript } from "../../src/codegen/transpiler.js";
import { generateZodSchemas } from "../../src/codegen/zod-generator.js";
import { validateParity } from "../../src/codegen/validator.js";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SAMPLE_SPEC = `
# Planner Specification

## Data Structures

\`\`\`typescript
interface Task {
  id: string;
  description: string;
  skills: string[];
  dependencies: string[];
  status: "pending" | "running" | "done" | "failed" | "skipped";
  requiresApproval: boolean;
  assignedAgent?: string;
  result?: string;
  startedAt?: number;
  completedAt?: number;
}

interface Plan {
  id: string;
  status: "planning" | "executing" | "reviewing" | "done";
  tasks: Task[];
  taskRunMap: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}
\`\`\`

### Requirement: Task Decomposition (FR-PLAN-002)

#### Scenario: Valid plan generation
- GIVEN a complex request
- WHEN the Planner creates a plan
- THEN tasks are generated with valid IDs
`;

describe("full pipeline", () => {
  it("parses, transpiles, generates zod, and validates parity", () => {
    // 1. Parse
    const interfaces = extractInterfaces(SAMPLE_SPEC);
    expect(interfaces).toHaveLength(2);
    expect(interfaces[0].name).toBe("Task");
    expect(interfaces[1].name).toBe("Plan");

    const scenarios = extractScenarios(SAMPLE_SPEC);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].title).toBe("Valid plan generation");

    // 2. Transpile to TypeScript
    const tsOutput = transpileToTypeScript(interfaces);
    expect(tsOutput).toContain("export interface Task {");
    expect(tsOutput).toContain("export interface Plan {");
    expect(tsOutput).toContain("tasks: Task[];");
    expect(tsOutput).toContain('status: "pending" | "running" | "done" | "failed" | "skipped";');
    expect(tsOutput).toContain("assignedAgent?: string;");
    expect(tsOutput).toContain("taskRunMap: Record<string, string>;");

    // Task should appear before Plan (dependency order)
    const taskIndex = tsOutput.indexOf("export interface Task {");
    const planIndex = tsOutput.indexOf("export interface Plan {");
    expect(taskIndex).toBeLessThan(planIndex);

    // 3. Generate Zod schemas
    const zodOutput = generateZodSchemas(interfaces);
    expect(zodOutput).toContain("export const TaskSchema = z.object");
    expect(zodOutput).toContain("export const PlanSchema = z.object");
    expect(zodOutput).toContain('z.enum(["pending", "running", "done", "failed", "skipped"])');
    expect(zodOutput).toContain("z.array(TaskSchema)");
    expect(zodOutput).toContain("z.record(z.string())");
    expect(zodOutput).toContain("assignedAgent: z.string().optional()");

    // TaskSchema should appear before PlanSchema
    const zodTaskIndex = zodOutput.indexOf("export const TaskSchema");
    const zodPlanIndex = zodOutput.indexOf("export const PlanSchema");
    expect(zodTaskIndex).toBeLessThan(zodPlanIndex);

    // 4. Validate parity
    const specs = [{ filePath: "spec.md", interfaces, scenarios }];
    const generated = [
      { filePath: "types.ts", content: tsOutput, interfaces },
    ];
    const result = validateParity(specs, generated);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reads a real spec file end-to-end", () => {
    const dir = mkdtempSync(join(tmpdir(), "codegen-integration-"));
    const filePath = join(dir, "spec.md");
    writeFileSync(filePath, SAMPLE_SPEC);

    const specs = parseSpecFile(filePath);
    expect(specs).toHaveLength(1);

    const allInterfaces = specs.flatMap((s) => s.interfaces);
    const tsOutput = transpileToTypeScript(allInterfaces);
    const zodOutput = generateZodSchemas(allInterfaces);

    expect(tsOutput).toContain("export interface Task");
    expect(zodOutput).toContain("export const TaskSchema");

    rmSync(dir, { recursive: true, force: true });
  });

  it("detects parity mismatch after spec change", () => {
    const originalInterfaces = extractInterfaces(SAMPLE_SPEC);

    // Simulate generated files that are out of date
    const staleInterfaces = [
      {
        name: "Task",
        properties: [
          { name: "id", type: "string", optional: false },
          // missing description, skills, etc.
        ],
      },
    ];

    const specs = [{ filePath: "spec.md", interfaces: originalInterfaces, scenarios: [] }];
    const generated = [
      { filePath: "types.ts", content: "", interfaces: staleInterfaces },
    ];

    const result = validateParity(specs, generated);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
