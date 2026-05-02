import { describe, it, expect } from "vitest";
import { Planner } from "../src/planner";
import { ClassificationRule } from "../src/types";

describe("Planner.classify", () => {
  const planner = new Planner({ model: "gpt-4o-mini" });

  it("should classify greeting as simple", async () => {
    const result = await planner.classify("Hello!");
    expect(result).toBe("simple");
  });

  it("should classify simple question as simple", async () => {
    const result = await planner.classify("What is TypeScript?");
    expect(result).toBe("simple");
  });

  it("should classify short request as simple", async () => {
    const result = await planner.classify("Help me");
    expect(result).toBe("simple");
  });

  it("should classify complex creation task as complex", async () => {
    const result = await planner.classify("Create a web application with user authentication and database integration");
    expect(result).toBe("complex");
  });

  it("should classify multi-step task as complex", async () => {
    const result = await planner.classify("Search for data and then analyze it and create a report");
    expect(result).toBe("complex");
  });

  it("should return complex when skipClassification is true", async () => {
    const plannerWithSkip = new Planner({ model: "gpt-4o-mini", skipClassification: true });
    const result = await plannerWithSkip.classify("Hello!");
    expect(result).toBe("complex");
  });

  it("should use custom rules", async () => {
    const customRules: ClassificationRule[] = [
      { pattern: /urgent/i, complexity: "complex", description: "urgent" }
    ];
    const plannerWithRules = new Planner({ model: "gpt-4o-mini", classificationRules: customRules });
    const result = await plannerWithRules.classify("This is urgent!");
    expect(result).toBe("complex");
  });
});

describe("Planner.createPlan", () => {
  const planner = new Planner({ model: "gpt-4o-mini" });

  it("should create a valid plan", async () => {
    const plan = await planner.createPlan("Build a web app");
    expect(plan.id).toMatch(/^plan_\d+$/);
    expect(plan.status).toBe("executing");
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.tasks[0].id).toMatch(/^task_\d+$/);
  });

  it("should validate task IDs with regex pattern", async () => {
    const plan = await planner.createPlan("Test");
    for (const task of plan.tasks) {
      expect(task.id).toMatch(/^task_[0-9]+$/);
    }
  });

  it("should validate skills are from allowed enum", async () => {
    const plan = await planner.createPlan("Test");
    const allowedSkills = ["search", "browser", "shell", "code", "file"];
    for (const task of plan.tasks) {
      for (const skill of task.skills) {
        expect(allowedSkills).toContain(skill);
      }
    }
  });

  it("should create fallback plan on error", async () => {
    // This test verifies the fallback behavior exists
    const plan = await planner.createPlan("");
    expect(plan.tasks.length).toBeGreaterThan(0);
  });
});

describe("Planner.validateAndParseJSON", () => {
  const planner = new Planner({ model: "gpt-4o-mini" });

  it("should reject invalid task ID pattern", async () => {
    const invalidJSON = JSON.stringify({
      tasks: [{
        id: "invalid_id",
        description: "Test",
        skills: ["code"],
        dependencies: [],
      }]
    });
    // Access private method through any for testing
    expect(() => (planner as any).validateAndParseJSON(invalidJSON)).toThrow("task id must match pattern");
  });

  it("should reject invalid skill enum", async () => {
    const invalidJSON = JSON.stringify({
      tasks: [{
        id: "task_001",
        description: "Test",
        skills: ["invalid_skill"],
        dependencies: [],
      }]
    });
    expect(() => (planner as any).validateAndParseJSON(invalidJSON)).toThrow("skills");
  });

  it("should reject empty description", async () => {
    const invalidJSON = JSON.stringify({
      tasks: [{
        id: "task_001",
        description: "",
        skills: ["code"],
        dependencies: [],
      }]
    });
    expect(() => (planner as any).validateAndParseJSON(invalidJSON)).toThrow("description must not be empty");
  });

  it("should reject missing tasks array", async () => {
    const invalidJSON = JSON.stringify({});
    expect(() => (planner as any).validateAndParseJSON(invalidJSON)).toThrow("JSON Schema validation failed");
  });
});
