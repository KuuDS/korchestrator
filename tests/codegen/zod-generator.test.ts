/**
 * Tests for the Zod schema generator.
 */

import { describe, it, expect } from "vitest";
import { generateZodSchemas } from "../../src/codegen/zod-generator.js";
import { InterfaceDef } from "../../src/codegen/types.js";

describe("generateZodSchemas", () => {
  it("maps primitive types to zod validators", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Task",
        properties: [
          { name: "id", type: "string", optional: false },
          { name: "count", type: "number", optional: false },
          { name: "active", type: "boolean", optional: false },
        ],
      },
    ];

    const output = generateZodSchemas(interfaces);
    expect(output).toContain("id: z.string()");
    expect(output).toContain("count: z.number()");
    expect(output).toContain("active: z.boolean()");
  });

  it("maps string literal unions to z.enum", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Task",
        properties: [
          { name: "status", type: '"pending" | "running" | "done"', optional: false },
        ],
      },
    ];

    const output = generateZodSchemas(interfaces);
    expect(output).toContain('z.enum(["pending", "running", "done"])');
  });

  it("maps optional properties to z.optional", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Task",
        properties: [{ name: "result", type: "string", optional: true }],
      },
    ];

    const output = generateZodSchemas(interfaces);
    expect(output).toContain("result: z.string().optional()");
  });

  it("maps array types to z.array", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Plan",
        properties: [
          { name: "tasks", type: "Task[]", optional: false },
          { name: "tags", type: "string[]", optional: false },
        ],
      },
      {
        name: "Task",
        properties: [{ name: "id", type: "string", optional: false }],
      },
    ];

    const output = generateZodSchemas(interfaces);
    expect(output).toContain("tasks: z.array(TaskSchema)");
    expect(output).toContain("tags: z.array(z.string())");
  });

  it("references other interface schemas", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Plan",
        properties: [{ name: "tasks", type: "Task[]", optional: false }],
      },
      {
        name: "Task",
        properties: [{ name: "id", type: "string", optional: false }],
      },
    ];

    const output = generateZodSchemas(interfaces);
    expect(output).toContain("TaskSchema");
    expect(output).toContain("PlanSchema");
  });

  it("emits schemas in dependency order", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Plan",
        properties: [{ name: "tasks", type: "Task[]", optional: false }],
      },
      {
        name: "Task",
        properties: [{ name: "id", type: "string", optional: false }],
      },
    ];

    const output = generateZodSchemas(interfaces);
    const taskIndex = output.indexOf("export const TaskSchema");
    const planIndex = output.indexOf("export const PlanSchema");
    expect(taskIndex).toBeLessThan(planIndex);
  });

  it("handles Record types", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Plan",
        properties: [{ name: "taskRunMap", type: "Record<string, string>", optional: false }],
      },
    ];

    const output = generateZodSchemas(interfaces);
    expect(output).toContain("taskRunMap: z.record(z.string())");
  });

  it("includes z import", () => {
    const output = generateZodSchemas([]);
    expect(output).toContain('import { z } from "zod"');
  });
});
