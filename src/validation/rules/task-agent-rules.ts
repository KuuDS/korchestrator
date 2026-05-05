/**
 * Task-Agent Matching Validation Rules
 *
 * Validation rules for checking compatibility between tasks and assigned agents,
 * including capability matching, load balancing, and priority alignment.
 */

import type { ValidationResult, ValidationRule, ValidationContext } from "../types.js";
import type { Task, AgentRole, Skill } from "../../types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ───────────────────────────────────────────────────────────────────────────────

function createPass(ruleId: string, message?: string): ValidationResult {
  return {
    passed: true,
    ruleId,
    message
  };
}

function createFail(
  ruleId: string,
  severity: "error" | "warning" | "info",
  message: string,
  metadata?: Record<string, unknown>
): ValidationResult {
  return {
    passed: false,
    ruleId,
    severity,
    message,
    metadata
  };
}

// ─── Extended types for optional fields accessed at runtime ───

interface AgentWithMetadata extends AgentRole {
  metadata?: {
    concurrentTasks?: number;
    maxConcurrent?: number;
    priority?: number;
    [key: string]: unknown;
  };
}

interface TaskWithPriority extends Task {
  priority?: string;
}

// ───────────────────────────────────────────────────────────────────────────────
// 1. Agent Capability Matcher
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Validates that the assigned agent has all skills required by the task.
 *
 * Returns an error with missing skills if the agent cannot cover all requirements.
 */
export function validateAgentCapability(context: ValidationContext): ValidationResult {
  const ruleId = "agent-capability-match";
  const task = context.task;
  const agent = context.agent;

  if (!task || !agent) {
    return createPass(ruleId, "No task-agent pair to validate");
  }

  const requiredSkills: Skill[] = task.skills ?? [];
  const agentSkills: Skill[] = agent.skills ?? [];

  const missingSkills = requiredSkills.filter(
    (skill) => !agentSkills.includes(skill)
  );

  if (missingSkills.length === 0) {
    return createPass(
      ruleId,
      `Agent "${agent.name}" (${agent.agentId}) has all required skills for task ${task.id}`
    );
  }

  return createFail(
    ruleId,
    "error",
    `Agent "${agent.name}" (${agent.agentId}) is missing required skills for task ${task.id}: ${missingSkills.join(", ")}`,
    {
      code: "AGENT_CAPABILITY_MISMATCH",
      missingSkills,
      requiredSkills,
      agentSkills
    }
  );
}

/**
 * Factory function that returns a ValidationRule for agent capability matching.
 */
export function createAgentCapabilityMatcher(): ValidationRule {
  return {
    id: "agent-capability-match",
    name: "Agent Capability Matcher",
    description: "Checks if agent's skills cover all task's required skills",
    priority: 100,
    strategy: "block",
    execute: validateAgentCapability,
    enabled: true,
    timeoutMs: 5000
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// 2. Agent Load Balancer
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Validates that the assigned agent is not overloaded.
 *
 * Checks agent metadata for concurrentTasks count and blackboard load tracking.
 */
export function validateAgentLoad(context: ValidationContext): ValidationResult {
  const ruleId = "agent-load-balancer";
  const agent = context.agent as AgentWithMetadata | undefined;

  if (!agent) {
    return createPass(ruleId, "No agent to validate load for");
  }

  // Check agent metadata for concurrentTasks count
  const concurrentTasks = agent.metadata?.concurrentTasks;
  const maxConcurrent = agent.metadata?.maxConcurrent ?? 3;

  if (typeof concurrentTasks === "number" && concurrentTasks >= maxConcurrent) {
    return createFail(
      ruleId,
      "error",
      `Agent "${agent.name}" (${agent.agentId}) is overloaded (${concurrentTasks}/${maxConcurrent} concurrent tasks)`,
      {
        code: "AGENT_OVERLOADED",
        concurrentTasks,
        maxConcurrent
      }
    );
  }

  // Check blackboard for agent load tracking
  const blackboard = context.blackboard;
  if (blackboard && typeof blackboard === "object") {
    const agentLoadKey = `agentLoad_${agent.agentId}`;
    const agentLoad = blackboard[agentLoadKey] as Record<string, unknown> | undefined;

    if (agentLoad && agentLoad.overloaded === true) {
      return createFail(
        ruleId,
        "error",
        `Agent "${agent.name}" (${agent.agentId}) is marked as overloaded in blackboard`,
        {
          code: "AGENT_OVERLOADED",
          blackboardLoad: agentLoad
        }
      );
    }
  }

  return createPass(
    ruleId,
    `Agent "${agent.name}" (${agent.agentId}) is not overloaded`
  );
}

/**
 * Factory function that returns a ValidationRule for agent load balancing.
 */
export function createAgentLoadBalancer(): ValidationRule {
  return {
    id: "agent-load-balancer",
    name: "Agent Load Balancer",
    description: "Checks if agent has exceeded concurrent task capacity",
    priority: 90,
    strategy: "block",
    execute: validateAgentLoad,
    enabled: true,
    timeoutMs: 5000
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// 3. Priority Alignment Validator
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Validates that high-priority tasks are not assigned to low-priority agents.
 *
 * Task priority: P0 (highest), P1, P2...
 * Agent priority: 1 (highest), 2, 3...
 *
 * Warns when a P0 task is assigned to an agent with priority > 2.
 */
export function validatePriorityAlignment(context: ValidationContext): ValidationResult {
  const ruleId = "priority-alignment";
  const task = context.task as TaskWithPriority | undefined;
  const agent = context.agent as AgentWithMetadata | undefined;

  if (!task || !agent) {
    return createPass(ruleId, "No task-agent pair to validate priority for");
  }

  const taskPriority = task.priority;
  const agentPriority = agent.metadata?.priority;

  // If either priority is missing, skip alignment check
  if (taskPriority === undefined || agentPriority === undefined) {
    return createPass(
      ruleId,
      `Priority data missing for task ${task.id} or agent "${agent.name}" (${agent.agentId}); skipping alignment check`
    );
  }

  // If task is P0 (highest) and agent priority > 2 (low), emit warning
  if (taskPriority === "P0" && typeof agentPriority === "number" && agentPriority > 2) {
    return createFail(
      ruleId,
      "warning",
      `Task ${task.id} is P0 (highest priority) but agent "${agent.name}" (${agent.agentId}) has low priority (${agentPriority})`,
      {
        code: "PRIORITY_MISMATCH",
        taskPriority,
        agentPriority
      }
    );
  }

  return createPass(
    ruleId,
    `Task ${task.id} priority "${taskPriority}" aligns with agent "${agent.name}" (${agent.agentId}) priority ${agentPriority}`
  );
}

/**
 * Factory function that returns a ValidationRule for priority alignment.
 */
export function createPriorityAlignmentValidator(): ValidationRule {
  return {
    id: "priority-alignment",
    name: "Priority Alignment Validator",
    description: "Warns when high-priority tasks are assigned to low-priority agents",
    priority: 80,
    strategy: "warn",
    execute: validatePriorityAlignment,
    enabled: true,
    timeoutMs: 5000
  };
}
