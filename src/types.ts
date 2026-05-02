// types.ts — 共享类型定义

export interface Task {
  id: string;
  description: string;
  skills: string[];
  dependencies: string[];
  status: "pending" | "running" | "done" | "failed" | "skipped";
  requiresApproval: boolean;
  assignedAgent?: string;
  result?: string;
  startedAt?: number;
  completedAt?: number;
  _retryCount?: number;
}

export interface Plan {
  id: string;
  status: "planning" | "executing" | "reviewing" | "done";
  tasks: Task[];
  taskRunMap: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRole {
  agentId: string;
  name: string;
  skills: string[];
  model: string;
}

export interface HealthCheck {
  needsReroute: boolean;
  failedTasks: Task[];
  reason?: string;
}

export interface RepairDecision {
  strategy: "retry" | "decompose" | "skip" | "escalate";
  newTasks?: Task[];
  reason: string;
}

export interface PluginConfig {
  plannerModel?: string;
  replannerModel?: string;
  maxConcurrency?: number;
  maxStepsPerAgent?: number;
  skipClassification?: boolean;
  classificationRules?: ClassificationRule[];
  agentRoles?: AgentRole[];
}

export interface ClassificationRule {
  pattern: RegExp;
  complexity: "simple" | "complex";
  description?: string;
}

export interface PlanState {
  id: string;
  status: "idle" | "planning" | "executing" | "reviewing" | "done";
  tasks: Task[];
  taskRunMap: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}
