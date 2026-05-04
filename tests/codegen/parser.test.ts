/**
 * Tests for the spec markdown parser.
 */

import { describe, it, expect } from "vitest";
import { extractInterfaces, extractScenarios, parseSpecFile } from "../../src/codegen/parser.js";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("extractInterfaces", () => {
  it("parses a simple interface from a typescript code block", () => {
    const markdown = `
## Data Structures

\`\`\`typescript
interface Task {
  id: string;
  description: string;
}
\`\`\`
`;
    const result = extractInterfaces(markdown);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Task");
    expect(result[0].properties).toHaveLength(2);
    expect(result[0].properties[0].name).toBe("id");
    expect(result[0].properties[0].type).toBe("string");
    expect(result[0].properties[0].optional).toBe(false);
  });

  it("detects optional properties", () => {
    const markdown = `
\`\`\`typescript
interface Task {
  id: string;
  result?: string;
}
\`\`\`
`;
    const result = extractInterfaces(markdown);
    const prop = result[0].properties.find((p) => p.name === "result");
    expect(prop).toBeDefined();
    expect(prop!.optional).toBe(true);
  });

  it("detects array types", () => {
    const markdown = `
\`\`\`typescript
interface Plan {
  tasks: Task[];
  tags: string[];
}
\`\`\`
`;
    const result = extractInterfaces(markdown);
    const tasksProp = result[0].properties.find((p) => p.name === "tasks");
    expect(tasksProp!.type).toBe("Task[]");
    const tagsProp = result[0].properties.find((p) => p.name === "tags");
    expect(tagsProp!.type).toBe("string[]");
  });

  it("preserves string literal union types", () => {
    const markdown = `
\`\`\`typescript
interface Task {
  status: "pending" | "running" | "done";
}
\`\`\`
`;
    const result = extractInterfaces(markdown);
    const prop = result[0].properties[0];
    expect(prop.type).toBe('"pending" | "running" | "done"');
  });

  it("extracts JSDoc comments", () => {
    const markdown = `
\`\`\`typescript
/**
 * A task in the plan
 */
interface Task {
  /** Unique identifier */
  id: string;
}
\`\`\`
`;
    const result = extractInterfaces(markdown);
    expect(result[0].doc).toBe("A task in the plan");
    expect(result[0].properties[0].doc).toBe("Unique identifier");
  });

  it("parses multiple interfaces", () => {
    const markdown = `
\`\`\`typescript
interface Task {
  id: string;
}

interface Plan {
  tasks: Task[];
}
\`\`\`
`;
    const result = extractInterfaces(markdown);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Task");
    expect(result[1].name).toBe("Plan");
  });

  it("handles Record types", () => {
    const markdown = `
\`\`\`typescript
interface Plan {
  taskRunMap: Record<string, string>;
}
\`\`\`
`;
    const result = extractInterfaces(markdown);
    expect(result[0].properties[0].type).toBe("Record<string, string>");
  });

  it("returns empty array when no typescript blocks", () => {
    const result = extractInterfaces("# Just markdown\nNo code here.");
    expect(result).toHaveLength(0);
  });
});

describe("extractScenarios", () => {
  it("extracts scenario blocks", () => {
    const markdown = `
### Requirement: Foo (FR-PLAN-001)

#### Scenario: Valid plan generation
- GIVEN a complex request
- WHEN the planner creates a plan
- THEN tasks are generated

#### Scenario: Invalid request
- GIVEN bad input
- WHEN processed
- THEN error is thrown
`;
    const result = extractScenarios(markdown);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Valid plan generation");
    expect(result[0].requirementId).toBe("FR-PLAN-001");
    expect(result[1].title).toBe("Invalid request");
  });

  it("returns empty array when no scenarios", () => {
    const result = extractScenarios("# Just markdown\nNo scenarios.");
    expect(result).toHaveLength(0);
  });
});

describe("parseSpecFile", () => {
  it("reads a file and returns spec definitions", () => {
    const dir = mkdtempSync(join(tmpdir(), "codegen-test-"));
    const filePath = join(dir, "spec.md");
    writeFileSync(
      filePath,
      `
## Data Structures

\`\`\`typescript
interface Task {
  id: string;
}
\`\`\`

### Requirement: Test (FR-TEST-001)

#### Scenario: Basic
- GIVEN x
- WHEN y
- THEN z
`
    );

    const result = parseSpecFile(filePath);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe(filePath);
    expect(result[0].interfaces).toHaveLength(1);
    expect(result[0].scenarios).toHaveLength(1);

    rmSync(dir, { recursive: true, force: true });
  });
});
