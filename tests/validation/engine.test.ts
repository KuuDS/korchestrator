/**
 * Validation Framework Tests
 *
 * Comprehensive test suite for the validation rules engine.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RuleRegistry,
  RuleExecutor,
  ValidationContextBuilder,
  DuplicateRuleIdError,
  RuleNotFoundError,
} from "../../src/validation/engine.js";
import type {
  ValidationRule,
  ValidationContext,
  ValidationResult,
  ValidationConfig,
} from "../../src/validation/types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ───────────────────────────────────────────────────────────────────────────────

function createMockRule(
  id: string,
  priority: number,
  strategy: ValidationRule["strategy"],
  execute: (ctx: ValidationContext) => ValidationResult
): ValidationRule {
  return {
    id,
    name: `Test Rule ${id}`,
    description: `Test rule ${id}`,
    priority,
    strategy,
    enabled: true,
    execute,
  };
}

function createPassingRule(id: string, priority: number, strategy: ValidationRule["strategy"] = "warn"): ValidationRule {
  return createMockRule(id, priority, strategy, () => ({
    passed: true,
    ruleId: id,
    message: `${id} passed`,
  }));
}

function createFailingRule(
  id: string,
  priority: number,
  strategy: ValidationRule["strategy"] = "warn",
  severity: "error" | "warning" = "error"
): ValidationRule {
  return createMockRule(id, priority, strategy, () => ({
    passed: false,
    ruleId: id,
    message: `${id} failed`,
    severity,
  }));
}

const defaultConfig: ValidationConfig = {
  defaultTimeoutMs: 5000,
  skipValidation: false,
  retention: {},
  disabledRules: [],
};

// ───────────────────────────────────────────────────────────────────────────────
// RuleRegistry Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("RuleRegistry", () => {
  let registry: RuleRegistry;

  beforeEach(() => {
    registry = new RuleRegistry();
  });

  it("should register a rule and return a handle", () => {
    const rule = createPassingRule("test-1", 100);
    const handle = registry.register(rule);
    expect(handle.ruleId).toBe("test-1");
    expect(registry.size).toBe(1);
  });

  it("should throw DuplicateRuleIdError for duplicate IDs", () => {
    const rule = createPassingRule("test-1", 100);
    registry.register(rule);
    expect(() => registry.register(rule)).toThrow(DuplicateRuleIdError);
  });

  it("should unregister a rule by handle", () => {
    const rule = createPassingRule("test-1", 100);
    const handle = registry.register(rule);
    registry.unregister(handle);
    expect(registry.size).toBe(0);
  });

  it("should throw RuleNotFoundError when unregistering non-existent rule", () => {
    expect(() => registry.unregister({ ruleId: "non-existent" })).toThrow(
      RuleNotFoundError
    );
  });

  it("should retrieve a rule by ID", () => {
    const rule = createPassingRule("test-1", 100);
    registry.register(rule);
    const retrieved = registry.getRule("test-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("test-1");
  });

  it("should return undefined for non-existent rule", () => {
    expect(registry.getRule("non-existent")).toBeUndefined();
  });

  it("should return rules sorted by priority (highest first)", () => {
    registry.register(createPassingRule("low", 10));
    registry.register(createPassingRule("high", 200));
    registry.register(createPassingRule("mid", 100));

    const rules = registry.getAllRules();
    expect(rules.map((r) => r.id)).toEqual(["high", "mid", "low"]);
  });

  it("should filter enabled rules", () => {
    const enabled = createPassingRule("enabled", 100);
    const disabled = createPassingRule("disabled", 100);
    disabled.enabled = false;

    registry.register(enabled);
    registry.register(disabled);

    const enabledRules = registry.getEnabledRules();
    expect(enabledRules).toHaveLength(1);
    expect(enabledRules[0].id).toBe("enabled");
  });

  it("should check if a rule exists", () => {
    registry.register(createPassingRule("exists", 100));
    expect(registry.hasRule("exists")).toBe(true);
    expect(registry.hasRule("missing")).toBe(false);
  });

  it("should clear all rules", () => {
    registry.register(createPassingRule("test-1", 100));
    registry.register(createPassingRule("test-2", 100));
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// RuleExecutor Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("RuleExecutor", () => {
  let registry: RuleRegistry;
  let executor: RuleExecutor;

  beforeEach(() => {
    registry = new RuleRegistry();
    executor = new RuleExecutor(registry, defaultConfig);
  });

  it("should execute all passing rules and return valid report", async () => {
    registry.register(createPassingRule("rule-1", 100));
    registry.register(createPassingRule("rule-2", 50));

    const context: ValidationContext = { history: [] };
    const report = await executor.execute(context);

    expect(report.valid).toBe(true);
    expect(report.results).toHaveLength(2);
    expect(report.results.every((r) => r.passed)).toBe(true);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should stop on block strategy failure", async () => {
    registry.register(createFailingRule("block-rule", 100, "block"));
    registry.register(createPassingRule("later-rule", 50));

    const context: ValidationContext = { history: [] };
    const report = await executor.execute(context);

    expect(report.valid).toBe(false);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].ruleId).toBe("block-rule");
  });

  it("should continue on warn strategy failure", async () => {
    registry.register(createFailingRule("warn-rule", 100, "warn"));
    registry.register(createPassingRule("later-rule", 50));

    const context: ValidationContext = { history: [] };
    const report = await executor.execute(context);

    expect(report.valid).toBe(false);
    expect(report.results).toHaveLength(2);
  });

  it("should apply auto-fix and continue execution", async () => {
    registry.register(
      createMockRule("auto-fix-rule", 100, "autoFix", () => ({
        passed: false,
        ruleId: "auto-fix-rule",
        message: "Fix needed",
        severity: "error",
        fix: {
          type: "setDefault",
          description: "Set default timeout",
          payload: { timeout: 60 },
        },
      }))
    );
    registry.register(createPassingRule("later-rule", 50));

    const task = { id: "task-1", metadata: {} };
    const context: ValidationContext = { task: task as import("../../src/types.js").Task, history: [] };
    const report = await executor.execute(context);

    expect(report.valid).toBe(false);
    expect(report.results).toHaveLength(2);
    expect(report.results[0].ruleId).toBe("auto-fix-rule");
    expect(report.results[0].metadata).toMatchObject({
      fixApplied: true,
      fixType: "setDefault",
    });
    expect((task.metadata as Record<string, unknown>).timeout).toBe(60);
  });

  it("should execute rules in priority order", async () => {
    const order: string[] = [];

    registry.register(
      createMockRule("first", 200, "warn", () => {
        order.push("first");
        return { passed: true, ruleId: "first" };
      })
    );
    registry.register(
      createMockRule("second", 100, "warn", () => {
        order.push("second");
        return { passed: true, ruleId: "second" };
      })
    );
    registry.register(
      createMockRule("third", 50, "warn", () => {
        order.push("third");
        return { passed: true, ruleId: "third" };
      })
    );

    const context: ValidationContext = { history: [] };
    await executor.execute(context);

    expect(order).toEqual(["first", "second", "third"]);
  });

  it("should skip disabled rules", async () => {
    registry.register(createPassingRule("enabled", 100));
    const disabled = createPassingRule("disabled", 50);
    disabled.enabled = false;
    registry.register(disabled);

    const context: ValidationContext = { history: [] };
    const report = await executor.execute(context);

    expect(report.results).toHaveLength(1);
    expect(report.results[0].ruleId).toBe("enabled");
  });

  it("should skip rules in disabledRules config", async () => {
    registry.register(createPassingRule("disabled-by-config", 100));
    registry.register(createPassingRule("enabled", 50));

    const configWithDisabled: ValidationConfig = {
      ...defaultConfig,
      disabledRules: ["disabled-by-config"],
    };
    const customExecutor = new RuleExecutor(registry, configWithDisabled);

    const context: ValidationContext = { history: [] };
    const report = await customExecutor.execute(context);

    expect(report.results).toHaveLength(1);
    expect(report.results[0].ruleId).toBe("enabled");
  });

  it("should handle async rule execution", async () => {
    registry.register(
      createMockRule("async-rule", 100, "warn", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { passed: true, ruleId: "async-rule" };
      })
    );

    const context: ValidationContext = { history: [] };
    const report = await executor.execute(context);

    expect(report.valid).toBe(true);
    expect(report.results[0].ruleId).toBe("async-rule");
  });

  it("should handle rule execution errors gracefully", async () => {
    registry.register(
      createMockRule("error-rule", 100, "warn", () => {
        throw new Error("Rule error");
      })
    );

    const context: ValidationContext = { history: [] };
    const report = await executor.execute(context);

    expect(report.valid).toBe(false);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].message).toContain("Unexpected error");
  });

  it("should execute a specific rule by ID", async () => {
    registry.register(createPassingRule("target", 100));

    const context: ValidationContext = { history: [] };
    const result = await executor.executeRule("target", context);

    expect(result.passed).toBe(true);
    expect(result.ruleId).toBe("target");
  });

  it("should throw RuleNotFoundError for non-existent rule execution", async () => {
    const context: ValidationContext = { history: [] };
    await expect(executor.executeRule("non-existent", context)).rejects.toThrow(
      RuleNotFoundError
    );
  });

  it("should handle timeout on slow rules", async () => {
    registry.register(
      createMockRule("slow-rule", 100, "warn", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { passed: true, ruleId: "slow-rule" };
      })
    );

    const configWithShortTimeout: ValidationConfig = {
      ...defaultConfig,
      defaultTimeoutMs: 50,
    };
    const customExecutor = new RuleExecutor(registry, configWithShortTimeout);

    const context: ValidationContext = { history: [] };
    const report = await customExecutor.execute(context);

    expect(report.valid).toBe(false);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].message).toContain("timeout");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// ValidationContextBuilder Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("ValidationContextBuilder", () => {
  it("should build context with all fields", () => {
    const plan = { id: "plan-1" } as unknown as import("../../src/types.js").Plan;
    const task = { id: "task-1" } as unknown as import("../../src/types.js").Task;
    const agent = {
      agentId: "agent-1",
      name: "Test",
      skills: ["code"],
      model: "gpt-4",
    } as import("../../src/types.js").AgentRole;

    const context = new ValidationContextBuilder()
      .withPlan(plan)
      .withTask(task)
      .withAgent(agent)
      .withSession({ id: "session-1" })
      .withBlackboard({ key: "value" })
      .withHistory([])
      .build();

    expect(context.plan).toBe(plan);
    expect(context.task).toBe(task);
    expect(context.agent).toBe(agent);
    expect(context.session).toEqual({ id: "session-1" });
    expect(context.blackboard).toEqual({ key: "value" });
    expect(context.history).toEqual([]);
  });

  it("should create plan context via static method", () => {
    const plan = { id: "plan-1" } as unknown as import("../../src/types.js").Plan;

    const context = ValidationContextBuilder.forPlan(plan, {}, {}, []);

    expect(context.plan).toBe(plan);
    expect(context.session).toEqual({});
    expect(context.blackboard).toEqual({});
    expect(context.history).toEqual([]);
  });

  it("should create task context via static method", () => {
    const plan = { id: "plan-1" } as unknown as import("../../src/types.js").Plan;
    const task = { id: "task-1" } as unknown as import("../../src/types.js").Task;
    const agent = {
      agentId: "agent-1",
      name: "Test",
      skills: ["code"],
      model: "gpt-4",
    } as import("../../src/types.js").AgentRole;

    const context = ValidationContextBuilder.forTask(task, agent, plan, {}, {}, []);

    expect(context.task).toBe(task);
    expect(context.agent).toBe(agent);
    expect(context.plan).toBe(plan);
  });
});
