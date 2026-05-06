/**
 * Hook Integration Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ValidationFramework,
  createPlanValidationHook,
  createTaskValidationHook,
} from "../../src/validation/hooks.js";
import type { Plan, Task, AgentRole } from "../../src/types.js";
import type { ValidationConfig } from "../../src/validation/types.js";

const defaultConfig: ValidationConfig = {
  defaultTimeoutMs: 5000,
  skipValidation: false,
  retention: {},
  disabledRules: [],
};

function createPlan(): Plan {
  return {
    id: "plan-1",
    status: "planning",
    tasks: [
      {
        id: "task-1",
        description: "A reasonably sized task description",
        skills: ["code"],
        dependencies: [],
        status: "pending",
        requiresApproval: false,
        metadata: { timeout: 60 },
      } as unknown as import("../../src/types.js").Task,
    ],
    taskRunMap: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {},
  };
}

function createTask(): Task {
  return {
    id: "task-1",
    description: "A test task",
    skills: ["code"],
    dependencies: [],
    status: "pending",
    requiresApproval: false,
    metadata: { timeout: 60 },
  } as unknown as import("../../src/types.js").Task;
}

function createAgent(): AgentRole {
  return {
    agentId: "agent-1",
    name: "Test Agent",
    skills: ["code"],
    model: "gpt-4",
  };
}

describe("ValidationFramework", () => {
  it("should initialize with default rules", () => {
    const framework = new ValidationFramework(defaultConfig);
    expect(framework.registry.size).toBeGreaterThan(0);
  });

  it("should skip validation when configured", async () => {
    const framework = new ValidationFramework({
      ...defaultConfig,
      skipValidation: true,
    });

    const plan = createPlan();
    const context = {
      plan,
      history: [],
    };

    const result = await framework.validatePlan(context);
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it("should validate a valid plan", async () => {
    const framework = new ValidationFramework(defaultConfig);
    const plan = createPlan();
    const context = {
      plan,
      history: [],
    };

    const result = await framework.validatePlan(context);
    expect(result.valid).toBe(true);
  });

  it("should validate task-agent matching", async () => {
    const framework = new ValidationFramework(defaultConfig);
    const task = createTask();
    const agent = createAgent();
    const context = {
      task,
      agent,
      history: [],
    };

    const result = await framework.validateTaskMatch(context);
    expect(result.valid).toBe(true);
  });

  it("should register custom rules", () => {
    const framework = new ValidationFramework(defaultConfig);
    const rule = {
      id: "custom-rule",
      name: "Custom Rule",
      description: "A custom test rule",
      priority: 100,
      strategy: "warn" as const,
      enabled: true,
      execute: () => ({ passed: true, ruleId: "custom-rule" }),
    };

    const handle = framework.registerRule(rule);
    expect(handle.ruleId).toBe("custom-rule");
    expect(framework.registry.hasRule("custom-rule")).toBe(true);
  });

  it("should unregister rules", () => {
    const framework = new ValidationFramework(defaultConfig);
    const rule = {
      id: "temp-rule",
      name: "Temp Rule",
      description: "Temporary rule",
      priority: 100,
      strategy: "warn" as const,
      enabled: true,
      execute: () => ({ passed: true, ruleId: "temp-rule" }),
    };

    const handle = framework.registerRule(rule);
    framework.unregisterRule(handle);
    expect(framework.registry.hasRule("temp-rule")).toBe(false);
  });

  it("should enable/disable rules", () => {
    const framework = new ValidationFramework(defaultConfig);
    framework.disableRule("plan-structure");
    expect(framework.registry.getRule("plan-structure")?.enabled).toBe(false);

    framework.enableRule("plan-structure");
    expect(framework.registry.getRule("plan-structure")?.enabled).toBe(true);
  });
});

describe("createPlanValidationHook", () => {
  it("should block invalid plans", async () => {
    const framework = new ValidationFramework(defaultConfig);
    const hook = createPlanValidationHook(framework);

    const plan = {
      id: "bad-plan",
      // Missing required fields
    } as unknown as Plan;

    const result = await hook({ plan });
    expect(result.block).toBe(true);
    expect(result.reason).toContain("Plan validation failed");
  });

  it("should allow valid plans", async () => {
    const framework = new ValidationFramework(defaultConfig);
    const hook = createPlanValidationHook(framework);

    const plan = createPlan();
    const result = await hook({ plan });
    expect(result.block).toBe(false);
  });

  it("should skip when no plan provided", async () => {
    const framework = new ValidationFramework(defaultConfig);
    const hook = createPlanValidationHook(framework);

    const result = await hook({});
    expect(result.block).toBe(false);
  });
});

describe("createTaskValidationHook", () => {
  it("should block incompatible task-agent pairs", async () => {
    const framework = new ValidationFramework(defaultConfig);
    const hook = createTaskValidationHook(framework);

    const task: Task = {
      ...createTask(),
      skills: ["browser", "shell"],
    };
    const agent = createAgent();

    const result = await hook({ task, agent });
    expect(result.block).toBe(true);
    expect(result.reason).toContain("Task-Agent validation failed");
  });

  it("should allow compatible task-agent pairs", async () => {
    const framework = new ValidationFramework(defaultConfig);
    const hook = createTaskValidationHook(framework);

    const task = createTask();
    const agent = createAgent();

    const result = await hook({ task, agent });
    expect(result.block).toBe(false);
  });

  it("should skip when task or agent missing", async () => {
    const framework = new ValidationFramework(defaultConfig);
    const hook = createTaskValidationHook(framework);

    const result = await hook({});
    expect(result.block).toBe(false);
  });
});
