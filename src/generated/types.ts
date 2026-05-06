/**
 * Auto-generated TypeScript interfaces from OpenSpec specifications
 *
 * DO NOT EDIT DIRECTLY - Update openspec/specs/... .md instead
 * Regenerate: npm run validate-types -- --generate
 */

export interface AgentRole {
  agentId: string;
  name: string;
  skills: ("search" | "browser" | "shell" | "code" | "file")[];
  model: string;
}

export interface Task {
  id: string;
  description: string;
  skills: ("search" | "browser" | "shell" | "code" | "file")[];
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
  metadata?: Record<string, unknown>;
}

export interface Progress {
  total: number;
  done: number;
  failed: number;
  pending: number;
  running: number;
}

export interface ExecutionMetrics {
  runId: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}
