/**
 * Tests for the TypeScript transpiler.
 */

import { describe, it, expect } from "vitest";
import { transpileToTypeScript } from "../../src/codegen/transpiler.js";
import { InterfaceDef } from "../../src/codegen/types.js";

describe("transpileToTypeScript", () => {
  it("generates a simple interface", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Task",
        properties: [
          { name: "id", type: "string", optional: false },
          { name: "done", type: "boolean", optional: false },
        ],
      },
    ];

    const output = transpileToTypeScript(interfaces);
    expect(output).toContain("export interface Task {");
    expect(output).toContain("id: string;");
    expect(output).toContain("done: boolean;");
  });

  it("includes JSDoc comments", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Task",
        doc: "A unit of work",
        properties: [{ name: "id", type: "string", optional: false, doc: "Unique id" }],
      },
    ];

    const output = transpileToTypeScript(interfaces);
    expect(output).toContain("/**");
    expect(output).toContain(" * A unit of work");
    expect(output).toContain(" */");
    expect(output).toContain("/** Unique id */");
  });

  it("handles optional properties", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Task",
        properties: [{ name: "result", type: "string", optional: true }],
      },
    ];

    const output = transpileToTypeScript(interfaces);
    expect(output).toContain("result?: string;");
  });

  it("preserves string literal union types", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Task",
        properties: [
          { name: "status", type: '"pending" | "running" | "done"', optional: false },
        ],
      },
    ];

    const output = transpileToTypeScript(interfaces);
    expect(output).toContain('status: "pending" | "running" | "done";');
  });

  it("emits interfaces in dependency order", () => {
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

    const output = transpileToTypeScript(interfaces);
    const taskIndex = output.indexOf("export interface Task {");
    const planIndex = output.indexOf("export interface Plan {");
    expect(taskIndex).toBeLessThan(planIndex);
  });

  it("handles Record types", () => {
    const interfaces: InterfaceDef[] = [
      {
        name: "Plan",
        properties: [{ name: "taskRunMap", type: "Record<string, string>", optional: false }],
      },
    ];

    const output = transpileToTypeScript(interfaces);
    expect(output).toContain("taskRunMap: Record<string, string>;");
  });

  it("generates auto-generated header", () => {
    const output = transpileToTypeScript([]);
    expect(output).toContain("Auto-generated TypeScript interfaces");
    expect(output).toContain("DO NOT EDIT DIRECTLY");
  });
});
