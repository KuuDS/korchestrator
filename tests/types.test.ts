import { describe, it, expect } from "vitest";
import {
  TaskSchema,
  PlanSchema,
  AgentRoleSchema,
  RepairDecisionSchema,
  HealthCheckSchema,
  PluginConfigSchema,
  type Task,
  type Plan,
  type AgentRole,
  type RepairDecision,
  type HealthCheck,
  type PluginConfig
} from "../src/types";

// ═══════════════════════════════════════════════════════════════════════════════
// TaskSchema Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("TaskSchema", () => {
  const validTask = {
    id: "task_001",
    description: "Search for relevant documentation",
    skills: ["search", "browser"] as const,
    dependencies: [],
    status: "pending" as const,
    requiresApproval: false
  };

  it("validates a minimal valid task", () => {
    const result = TaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it("validates a task with all optional fields", () => {
    const fullTask = {
      ...validTask,
      assignedAgent: "researcher",
      result: "Found 3 documents",
      startedAt: 1700000000,
      completedAt: 1700000100,
      _retryCount: 0
    };
    const result = TaskSchema.safeParse(fullTask);
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    const result = TaskSchema.safeParse({ ...validTask, id: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = TaskSchema.safeParse({ ...validTask, description: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid skill values", () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      skills: ["search", "invalid_skill"]
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status values", () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      status: "unknown"
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { id, ...missingId } = validTask;
    const result = TaskSchema.safeParse(missingId);
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PlanSchema Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("PlanSchema", () => {
  const validPlan = {
    id: "plan_001",
    status: "planning" as const,
    tasks: [
      {
        id: "task_001",
        description: "Search docs",
        skills: ["search"] as const,
        dependencies: [],
        status: "pending" as const,
        requiresApproval: false
      }
    ],
    taskRunMap: {},
    createdAt: 1700000000,
    updatedAt: 1700000000
  };

  it("validates a minimal valid plan", () => {
    const result = PlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it("validates a plan with multiple tasks", () => {
    const planWithTasks = {
      ...validPlan,
      tasks: [
        {
          id: "task_001",
          description: "Search docs",
          skills: ["search"] as const,
          dependencies: [],
          status: "done" as const,
          requiresApproval: false
        },
        {
          id: "task_002",
          description: "Write code",
          skills: ["code"] as const,
          dependencies: ["task_001"],
          status: "running" as const,
          requiresApproval: true
        }
      ],
      taskRunMap: { run_001: "task_001" }
    };
    const result = PlanSchema.safeParse(planWithTasks);
    expect(result.success).toBe(true);
  });

  it("rejects empty plan id", () => {
    const result = PlanSchema.safeParse({ ...validPlan, id: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid plan status", () => {
    const result = PlanSchema.safeParse({
      ...validPlan,
      status: "invalid_status"
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tasks array", () => {
    const result = PlanSchema.safeParse({
      ...validPlan,
      tasks: [{ invalid: "task" }]
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AgentRoleSchema Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("AgentRoleSchema", () => {
  const validRole = {
    agentId: "researcher",
    name: "Researcher",
    skills: ["search", "browser"] as const,
    model: "gpt-4o-mini"
  };

  it("validates a valid agent role", () => {
    const result = AgentRoleSchema.safeParse(validRole);
    expect(result.success).toBe(true);
  });

  it("rejects missing agentId", () => {
    const { agentId, ...missingAgentId } = validRole;
    const result = AgentRoleSchema.safeParse(missingAgentId);
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const { name, ...missingName } = validRole;
    const result = AgentRoleSchema.safeParse(missingName);
    expect(result.success).toBe(false);
  });

  it("rejects missing model", () => {
    const { model, ...missingModel } = validRole;
    const result = AgentRoleSchema.safeParse(missingModel);
    expect(result.success).toBe(false);
  });

  it("rejects empty agentId", () => {
    const result = AgentRoleSchema.safeParse({ ...validRole, agentId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = AgentRoleSchema.safeParse({ ...validRole, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty model", () => {
    const result = AgentRoleSchema.safeParse({ ...validRole, model: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid skill values", () => {
    const result = AgentRoleSchema.safeParse({
      ...validRole,
      skills: ["invalid"]
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RepairDecisionSchema Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("RepairDecisionSchema", () => {
  it("validates retry strategy", () => {
    const result = RepairDecisionSchema.safeParse({
      strategy: "retry",
      reason: "Transient failure, will retry"
    });
    expect(result.success).toBe(true);
  });

  it("validates decompose strategy with newTasks", () => {
    const result = RepairDecisionSchema.safeParse({
      strategy: "decompose",
      newTasks: [
        {
          id: "task_sub_001",
          description: "Subtask 1",
          skills: ["search"] as const,
          dependencies: [],
          status: "pending" as const,
          requiresApproval: false
        }
      ],
      reason: "Task too complex, decomposing"
    });
    expect(result.success).toBe(true);
  });

  it("validates skip strategy", () => {
    const result = RepairDecisionSchema.safeParse({
      strategy: "skip",
      reason: "Non-critical task, skipping"
    });
    expect(result.success).toBe(true);
  });

  it("validates escalate strategy", () => {
    const result = RepairDecisionSchema.safeParse({
      strategy: "escalate",
      reason: "Critical failure, escalating to human"
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid strategy", () => {
    const result = RepairDecisionSchema.safeParse({
      strategy: "unknown",
      reason: "Invalid strategy"
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty reason", () => {
    const result = RepairDecisionSchema.safeParse({
      strategy: "retry",
      reason: ""
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing reason", () => {
    const result = RepairDecisionSchema.safeParse({
      strategy: "retry"
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HealthCheckSchema Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("HealthCheckSchema", () => {
  it("validates health check with failed tasks", () => {
    const result = HealthCheckSchema.safeParse({
      needsReroute: true,
      failedTasks: [
        {
          id: "task_001",
          description: "Failed task",
          skills: ["search"] as const,
          dependencies: [],
          status: "failed" as const,
          requiresApproval: false
        }
      ],
      reason: "Task failed due to timeout"
    });
    expect(result.success).toBe(true);
  });

  it("validates health check with empty failedTasks", () => {
    const result = HealthCheckSchema.safeParse({
      needsReroute: false,
      failedTasks: []
    });
    expect(result.success).toBe(true);
  });

  it("validates health check without optional reason", () => {
    const result = HealthCheckSchema.safeParse({
      needsReroute: false,
      failedTasks: []
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing needsReroute", () => {
    const result = HealthCheckSchema.safeParse({
      failedTasks: []
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing failedTasks", () => {
    const result = HealthCheckSchema.safeParse({
      needsReroute: false
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PluginConfigSchema Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("PluginConfigSchema", () => {
  const validConfig = {
    plannerModel: "gpt-4o-mini",
    replannerModel: "gpt-4o-mini",
    maxConcurrency: 3,
    maxStepsPerAgent: 20,
    skipClassification: false,
    classificationRules: [
      { pattern: "^(hello|hi|hey)", result: "simple" as const }
    ],
    metricsOutput: "blackboard" as const,
    agentRoles: [
      {
        agentId: "researcher",
        name: "Researcher",
        skills: ["search", "browser"] as const,
        model: "gpt-4o-mini"
      }
    ]
  };

  it("validates a valid config with blackboard metrics", () => {
    const result = PluginConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("validates config with webhook metrics and URL", () => {
    const config = {
      ...validConfig,
      metricsOutput: "webhook" as const,
      metricsWebhook: "https://example.com/webhook"
    };
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("validates config with otel metrics and endpoint", () => {
    const config = {
      ...validConfig,
      metricsOutput: "otel" as const,
      metricsOtelEndpoint: "https://otel.example.com"
    };
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects invalid maxConcurrency (zero)", () => {
    const result = PluginConfigSchema.safeParse({
      ...validConfig,
      maxConcurrency: 0
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid maxConcurrency (negative)", () => {
    const result = PluginConfigSchema.safeParse({
      ...validConfig,
      maxConcurrency: -1
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid maxStepsPerAgent", () => {
    const result = PluginConfigSchema.safeParse({
      ...validConfig,
      maxStepsPerAgent: 0
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing webhook URL when metricsOutput is webhook", () => {
    const config = {
      ...validConfig,
      metricsOutput: "webhook" as const
      // metricsWebhook is missing
    };
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects empty webhook URL when metricsOutput is webhook", () => {
    const config = {
      ...validConfig,
      metricsOutput: "webhook" as const,
      metricsWebhook: ""
    };
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects missing otel endpoint when metricsOutput is otel", () => {
    const config = {
      ...validConfig,
      metricsOutput: "otel" as const
      // metricsOtelEndpoint is missing
    };
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects empty otel endpoint when metricsOutput is otel", () => {
    const config = {
      ...validConfig,
      metricsOutput: "otel" as const,
      metricsOtelEndpoint: ""
    };
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { plannerModel, ...missingPlanner } = validConfig;
    const result = PluginConfigSchema.safeParse(missingPlanner);
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Type Compatibility Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Type compatibility", () => {
  it("TaskZod is assignable to Task interface", () => {
    const task = TaskSchema.parse({
      id: "task_001",
      description: "Test task",
      skills: ["search"],
      dependencies: [],
      status: "pending",
      requiresApproval: false
    });
    // Type-level check: if this compiles, the types are compatible
    const _interfaceCheck: Task = task;
    expect(_interfaceCheck.id).toBe("task_001");
  });

  it("PlanZod is assignable to Plan interface", () => {
    const plan = PlanSchema.parse({
      id: "plan_001",
      status: "planning",
      tasks: [
        {
          id: "task_001",
          description: "Test task",
          skills: ["search"],
          dependencies: [],
          status: "pending",
          requiresApproval: false
        }
      ],
      taskRunMap: {},
      createdAt: 1700000000,
      updatedAt: 1700000000
    });
    const _interfaceCheck: Plan = plan;
    expect(_interfaceCheck.id).toBe("plan_001");
  });

  it("AgentRoleZod is assignable to AgentRole interface", () => {
    const role = AgentRoleSchema.parse({
      agentId: "researcher",
      name: "Researcher",
      skills: ["search"],
      model: "gpt-4o-mini"
    });
    const _interfaceCheck: AgentRole = role;
    expect(_interfaceCheck.agentId).toBe("researcher");
  });

  it("RepairDecisionZod is assignable to RepairDecision interface", () => {
    const decision = RepairDecisionSchema.parse({
      strategy: "retry",
      reason: "Will retry"
    });
    const _interfaceCheck: RepairDecision = decision;
    expect(_interfaceCheck.strategy).toBe("retry");
  });

  it("HealthCheckZod is assignable to HealthCheck interface", () => {
    const health = HealthCheckSchema.parse({
      needsReroute: false,
      failedTasks: []
    });
    const _interfaceCheck: HealthCheck = health;
    expect(_interfaceCheck.needsReroute).toBe(false);
  });

  it("PluginConfigZod is assignable to PluginConfig interface", () => {
    const config = PluginConfigSchema.parse({
      plannerModel: "gpt-4o-mini",
      replannerModel: "gpt-4o-mini",
      maxConcurrency: 3,
      maxStepsPerAgent: 20,
      skipClassification: false,
      classificationRules: [{ pattern: "^hello", result: "simple" }],
      metricsOutput: "blackboard",
      agentRoles: [
        {
          agentId: "researcher",
          name: "Researcher",
          skills: ["search"],
          model: "gpt-4o-mini"
        }
      ]
    });
    const _interfaceCheck: PluginConfig = config;
    expect(_interfaceCheck.plannerModel).toBe("gpt-4o-mini");
  });
});
