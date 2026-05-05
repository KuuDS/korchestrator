/**
 * Task-Agent Matching Validation Rules Tests
 */

import { describe, it, expect } from "vitest";
import {
  validateAgentCapability,
  validateAgentLoad,
  validatePriorityAlignment,
  createAgentCapabilityMatcher,
  createAgentLoadBalancer,
  createPriorityAlignmentValidator,
} from "../../src/validation/rules/task-agent-rules.js";
import type { ValidationContext } from "../../src/validation/types.js";
import type { Task, AgentRole } from "../../src/types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ───────────────────────────────────────────────────────────────────────────────

function createTask(skills: string[], overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    description: "Test task",
    skills: skills as import("../../src/types.js").Skill[],
    dependencies: [],
    status: "pending",
    requiresApproval: false,
    ...overrides,
  };
}

function createAgent(skills: string[], overrides: Partial<AgentRole> = {}): AgentRole {
  return {
    agentId: "agent-1",
    name: "Test Agent",
    skills: skills as import("../../src/types.js").Skill[],
    model: "gpt-4",
    ...overrides,
  };
}

function createContext(task?: Task, agent?: AgentRole, blackboard?: Record<string, unknown>): ValidationContext {
  return {
    task,
    agent,
    blackboard,
    history: [],
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Agent Capability Matcher Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("validateAgentCapability", () => {
  it("should pass when agent has all required skills", () => {
    const task = createTask(["code", "file"]);
    const agent = createAgent(["code", "file", "search"]);
    const ctx = createContext(task, agent);

    const result = validateAgentCapability(ctx);
    expect(result.passed).toBe(true);
  });

  it("should fail when agent is missing required skills", () => {
    const task = createTask(["browser", "shell"]);
    const agent = createAgent(["code", "file"]);
    const ctx = createContext(task, agent);

    const result = validateAgentCapability(ctx);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("missing required skills");
    expect(result.metadata).toBeDefined();
    expect((result.metadata as Record<string, unknown>)?.missingSkills).toContain("browser");
  });

  it("should handle missing task", () => {
    const agent = createAgent(["code"]);
    const ctx = createContext(undefined, agent);

    const result = validateAgentCapability(ctx);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("No task-agent pair");
  });

  it("should handle missing agent", () => {
    const task = createTask(["code"]);
    const ctx = createContext(task, undefined);

    const result = validateAgentCapability(ctx);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("No task-agent pair");
  });
});

describe("createAgentCapabilityMatcher", () => {
  it("should create a valid ValidationRule", () => {
    const rule = createAgentCapabilityMatcher();
    expect(rule.id).toBe("agent-capability-match");
    expect(rule.strategy).toBe("block");
    expect(rule.priority).toBeGreaterThan(0);
  });

  it("should execute correctly through the rule", () => {
    const rule = createAgentCapabilityMatcher();
    const task = createTask(["code"]);
    const agent = createAgent(["code"]);
    const ctx = createContext(task, agent);

    const result = rule.execute(ctx);
    expect(result.passed).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Agent Load Balancer Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("validateAgentLoad", () => {
  it("should pass when agent is under capacity", () => {
    const task = createTask(["code"]);
    const agent = createAgent(["code"], {
      metadata: { concurrentTasks: 2, maxConcurrent: 5 },
    } as unknown as Partial<AgentRole>);
    const ctx = createContext(task, agent);

    const result = validateAgentLoad(ctx);
    expect(result.passed).toBe(true);
  });

  it("should fail when agent is at capacity", () => {
    const task = createTask(["code"]);
    const agent = createAgent(["code"], {
      metadata: { concurrentTasks: 5, maxConcurrent: 5 },
    } as unknown as Partial<AgentRole>);
    const ctx = createContext(task, agent);

    const result = validateAgentLoad(ctx);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("overloaded");
  });

  it("should pass when no metadata is present (default assumption)", () => {
    const task = createTask(["code"]);
    const agent = createAgent(["code"]);
    const ctx = createContext(task, agent);

    const result = validateAgentLoad(ctx);
    expect(result.passed).toBe(true);
  });

  it("should check blackboard for agent load tracking", () => {
    const task = createTask(["code"]);
    const agent = createAgent(["code"]);
    const ctx = createContext(task, agent, {
      [`agentLoad_${agent.agentId}`]: { overloaded: true },
    });

    const result = validateAgentLoad(ctx);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("overloaded");
  });
});

describe("createAgentLoadBalancer", () => {
  it("should create a valid ValidationRule", () => {
    const rule = createAgentLoadBalancer();
    expect(rule.id).toBe("agent-load-balancer");
    expect(rule.strategy).toBe("block");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Priority Alignment Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("validatePriorityAlignment", () => {
  it("should pass when P0 task goes to high-priority agent", () => {
    const task = createTask(["code"], {
      priority: "P0",
    } as unknown as Partial<Task>);
    const agent = createAgent(["code"], {
      metadata: { priority: 1 },
    } as unknown as Partial<AgentRole>);
    const ctx = createContext(task, agent);

    const result = validatePriorityAlignment(ctx);
    expect(result.passed).toBe(true);
  });

  it("should warn when P0 task goes to low-priority agent", () => {
    const task = createTask(["code"], {
      priority: "P0",
    } as unknown as Partial<Task>);
    const agent = createAgent(["code"], {
      metadata: { priority: 5 },
    } as unknown as Partial<AgentRole>);
    const ctx = createContext(task, agent);

    const result = validatePriorityAlignment(ctx);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("low priority");
    expect(result.severity).toBe("warning");
  });

  it("should pass for non-P0 tasks regardless of agent priority", () => {
    const task = createTask(["code"], {
      priority: "P2",
    } as unknown as Partial<Task>);
    const agent = createAgent(["code"], {
      metadata: { priority: 5 },
    } as unknown as Partial<AgentRole>);
    const ctx = createContext(task, agent);

    const result = validatePriorityAlignment(ctx);
    expect(result.passed).toBe(true);
  });

  it("should pass when no priority data is available", () => {
    const task = createTask(["code"]);
    const agent = createAgent(["code"]);
    const ctx = createContext(task, agent);

    const result = validatePriorityAlignment(ctx);
    expect(result.passed).toBe(true);
  });
});

describe("createPriorityAlignmentValidator", () => {
  it("should create a valid ValidationRule", () => {
    const rule = createPriorityAlignmentValidator();
    expect(rule.id).toBe("priority-alignment");
    expect(rule.strategy).toBe("warn");
  });
});
