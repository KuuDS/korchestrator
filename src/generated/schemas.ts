/**
 * Auto-generated Zod schemas from OpenSpec specifications
 *
 * DO NOT EDIT DIRECTLY - Update openspec/specs/... .md instead
 * Regenerate: npm run validate-types -- --generate
 */

import { z } from "zod";

export const AgentRoleSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  skills: z.array(z.enum(["search", "browser", "shell", "code", "file"])),
  model: z.string(),
});

export const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  skills: z.array(z.enum(["search", "browser", "shell", "code", "file"])),
  dependencies: z.array(z.string()),
  status: z.enum(["pending", "running", "done", "failed", "skipped"]),
  requiresApproval: z.boolean(),
  assignedAgent: z.string().optional(),
  result: z.string().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  _retryCount: z.number().optional(),
});

export const PlanSchema = z.object({
  id: z.string(),
  status: z.enum(["planning", "executing", "reviewing", "done"]),
  tasks: z.array(TaskSchema),
  taskRunMap: z.record(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export const ProgressSchema = z.object({
  total: z.number(),
  done: z.number(),
  failed: z.number(),
  pending: z.number(),
  running: z.number(),
});

export const ExecutionMetricsSchema = z.object({
  runId: z.string(),
  durationMs: z.number(),
  success: z.boolean(),
  timestamp: z.number(),
});
