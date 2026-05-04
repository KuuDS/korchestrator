/**
 * Tests for the type parity validator.
 */

import { describe, it, expect } from "vitest";
import { validateParity } from "../../src/codegen/validator.js";
import { SpecDefinition, GeneratedFile, InterfaceDef } from "../../src/codegen/types.js";

describe("validateParity", () => {
  it("returns success when specs and generated match", () => {
    const iface: InterfaceDef = {
      name: "Task",
      properties: [{ name: "id", type: "string", optional: false }],
    };

    const specs: SpecDefinition[] = [
      { filePath: "spec.md", interfaces: [iface], scenarios: [] },
    ];

    const generated: GeneratedFile[] = [
      { filePath: "gen.ts", content: "", interfaces: [iface] },
    ];

    const result = validateParity(specs, generated);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing interface in generated files", () => {
    const specs: SpecDefinition[] = [
      {
        filePath: "spec.md",
        interfaces: [{ name: "Task", properties: [] }],
        scenarios: [],
      },
    ];

    const generated: GeneratedFile[] = [
      { filePath: "gen.ts", content: "", interfaces: [] },
    ];

    const result = validateParity(specs, generated);
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain('Missing interface "Task"');
  });

  it("detects extra interface in generated files", () => {
    const specs: SpecDefinition[] = [
      { filePath: "spec.md", interfaces: [], scenarios: [] },
    ];

    const generated: GeneratedFile[] = [
      {
        filePath: "gen.ts",
        content: "",
        interfaces: [{ name: "Extra", properties: [] }],
      },
    ];

    const result = validateParity(specs, generated);
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain('Extra interface "Extra"');
  });

  it("detects missing property", () => {
    const specs: SpecDefinition[] = [
      {
        filePath: "spec.md",
        interfaces: [
          {
            name: "Task",
            properties: [
              { name: "id", type: "string", optional: false },
              { name: "description", type: "string", optional: false },
            ],
          },
        ],
        scenarios: [],
      },
    ];

    const generated: GeneratedFile[] = [
      {
        filePath: "gen.ts",
        content: "",
        interfaces: [
          {
            name: "Task",
            properties: [{ name: "id", type: "string", optional: false }],
          },
        ],
      },
    ];

    const result = validateParity(specs, generated);
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain('Missing property "description"');
  });

  it("detects type mismatch", () => {
    const specs: SpecDefinition[] = [
      {
        filePath: "spec.md",
        interfaces: [
          {
            name: "Task",
            properties: [{ name: "id", type: "string", optional: false }],
          },
        ],
        scenarios: [],
      },
    ];

    const generated: GeneratedFile[] = [
      {
        filePath: "gen.ts",
        content: "",
        interfaces: [
          {
            name: "Task",
            properties: [{ name: "id", type: "number", optional: false }],
          },
        ],
      },
    ];

    const result = validateParity(specs, generated);
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain("Type mismatch");
    expect(result.errors[0].message).toContain('spec="string"');
    expect(result.errors[0].message).toContain('generated="number"');
  });

  it("detects optionality mismatch", () => {
    const specs: SpecDefinition[] = [
      {
        filePath: "spec.md",
        interfaces: [
          {
            name: "Task",
            properties: [{ name: "id", type: "string", optional: false }],
          },
        ],
        scenarios: [],
      },
    ];

    const generated: GeneratedFile[] = [
      {
        filePath: "gen.ts",
        content: "",
        interfaces: [
          {
            name: "Task",
            properties: [{ name: "id", type: "string", optional: true }],
          },
        ],
      },
    ];

    const result = validateParity(specs, generated);
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain("Optionality mismatch");
  });

  it("reports multiple errors", () => {
    const specs: SpecDefinition[] = [
      {
        filePath: "spec.md",
        interfaces: [
          {
            name: "Task",
            properties: [
              { name: "id", type: "string", optional: false },
              { name: "count", type: "number", optional: false },
            ],
          },
        ],
        scenarios: [],
      },
    ];

    const generated: GeneratedFile[] = [
      {
        filePath: "gen.ts",
        content: "",
        interfaces: [
          {
            name: "Task",
            properties: [
              { name: "id", type: "number", optional: true },
            ],
          },
        ],
      },
    ];

    const result = validateParity(specs, generated);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3); // missing prop + type mismatch + optionality mismatch
  });
});
