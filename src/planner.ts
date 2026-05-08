import { z } from "zod";
import type { ClassificationRule, Plan, Task, Skill } from "./types.js";
import { PlanSchema, TaskSchema } from "./types.js";
import { validateDAG } from "./utils/dag.js";

// ───────────────────────────────────────────────────────────────────────────────
// Zod schema for LLM task decomposition response
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Zod schema for a single task in the LLM decomposition response.
 */
const DecomposedTaskSchema = z.object({
  id: z.string().min(1, "Task id must be non-empty"),
  description: z.string().min(1, "Task description must be non-empty"),
  skills: z.array(z.enum(["search", "browser", "shell", "code", "file"])),
  dependencies: z.array(z.string()),
});

/**
 * Zod schema for the LLM task decomposition JSON response.
 */
const DecompositionResponseSchema = z.object({
  tasks: z.array(DecomposedTaskSchema).min(1, "At least one task is required"),
});

// ───────────────────────────────────────────────────────────────────────────────
// Planner
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Configuration options for the Planner constructor.
 */
export interface PlannerConfig {
  /** LLM model identifier for classification and decomposition */
  model: string;

  /** Maximum number of tasks allowed in a generated plan */
  maxTasks?: number;

  /** L1 rule cache for fast classification */
  classificationRules?: ClassificationRule[];

  /** Whether to bypass complexity classification and always treat as complex */
  skipClassification?: boolean;
}

/**
 * LLM generate function signature for mocking in tests.
 */
export type GenerateFn = (prompt: string) => Promise<string>;

/**
 * The Planner is responsible for:
 * - Classifying user requests as "simple" or "complex" (L1→L2→L3)
 * - Decomposing complex requests into a DAG of tasks via LLM
 * - Serializing plans to Markdown for prompt injection
 * - Reading/writing plan state from session extensions
 */
export class Planner {
  private readonly maxTasks: number;
  private readonly classificationRules: ClassificationRule[];
  private readonly skipClassification: boolean;
  private readonly generate: GenerateFn;

  /**
   * Creates a new Planner instance.
   *
   * @param config - Planner configuration
   * @param generate - Async function that calls the LLM (mockable for tests)
   */
  constructor(config: PlannerConfig, generate: GenerateFn) {
    this.maxTasks = config.maxTasks ?? 20;
    this.classificationRules = config.classificationRules ?? [];
    this.skipClassification = config.skipClassification ?? false;
    this.generate = generate;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Complexity Classification
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Match a user request against L1 regex classification rules.
   *
   * @param request - The raw user request text
   * @returns "simple" or "complex" if a rule matches, otherwise null
   */
  matchRule(request: string): "simple" | "complex" | null {
    for (const rule of this.classificationRules) {
      try {
        const regex = new RegExp(rule.pattern, "i");
        if (regex.test(request)) {
          return rule.result;
        }
      } catch {
        // Ignore invalid regex patterns and continue to next rule
        continue;
      }
    }
    return null;
  }

  /**
   * Classify a user request as "simple" or "complex" using a tiered strategy:
   * - L1: Check rule cache (matchRule)
   * - L2: If no match, call LLM
   * - L3: If LLM fails, return "simple" (fallback)
   *
   * If skipClassification is enabled, always returns "complex".
   *
   * @param request - The raw user request text
   * @returns The classification result
   */
  async classify(request: string): Promise<"simple" | "complex"> {
    if (this.skipClassification) {
      return "complex";
    }

    // L1: Rule cache
    const ruleResult = this.matchRule(request);
    if (ruleResult !== null) {
      return ruleResult;
    }

    // L2: LLM classification
    try {
      const prompt = this.buildClassificationPrompt(request);
      const response = await this.generate(prompt);
      const trimmed = response.trim().toLowerCase();
      if (trimmed === "simple" || trimmed === "complex") {
        return trimmed;
      }
      // L3: Fallback if LLM returns unexpected value
      return "simple";
    } catch {
      // L3: Fallback on LLM failure
      return "simple";
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Task Decomposition
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Decompose a user request into a Plan by calling the LLM.
   *
   * Validates the LLM JSON response with Zod, validates the DAG has no cycles,
   * auto-marks high-risk tasks (shell skill) as requiresApproval=true,
   * and enforces the maxTasks limit.
   *
   * On any failure, returns a single-task fallback plan.
   *
   * @param request - The raw user request text
   * @returns A valid Plan
   */
  async createPlan(request: string): Promise<Plan> {
    try {
      const prompt = this.buildDecompositionPrompt(request);
      const response = await this.generate(prompt);

      // Parse and validate JSON response
      const parsed = JSON.parse(response);
      const validated = DecompositionResponseSchema.parse(parsed);

      // Enforce maxTasks limit
      let tasks = validated.tasks;
      if (tasks.length > this.maxTasks) {
        tasks = tasks.slice(0, this.maxTasks);
      }

      // Convert to full Task objects
      const now = Date.now();
      const fullTasks: Task[] = tasks.map((t, index) => ({
        id: this.normalizeTaskId(t.id, index),
        description: t.description,
        skills: t.skills as Skill[],
        dependencies: t.dependencies,
        status: "pending",
        requiresApproval: t.skills.includes("shell"),
      }));

      // Validate DAG (no cycles)
      if (!validateDAG(fullTasks)) {
        throw new Error("Cycle detected in task dependencies");
      }

      // Validate each task with Zod TaskSchema
      for (const task of fullTasks) {
        TaskSchema.parse(task);
      }

      const plan: Plan = {
        id: `plan_${now}`,
        status: "planning",
        tasks: fullTasks,
        taskRunMap: {},
        createdAt: now,
        updatedAt: now,
      };

      // Validate full plan
      PlanSchema.parse(plan);

      return plan;
    } catch {
      // Fallback: single-task plan
      const now = Date.now();
      const fallbackTask: Task = {
        id: "task_001",
        description: request,
        skills: ["code"],
        dependencies: [],
        status: "pending",
        requiresApproval: false,
      };

      const fallbackPlan: Plan = {
        id: `plan_${now}`,
        status: "planning",
        tasks: [fallbackTask],
        taskRunMap: {},
        createdAt: now,
        updatedAt: now,
      };

      return fallbackPlan;
    }
  }

  /**
   * Normalize a task ID to the `task_NNN` format.
   *
   * @param id - The raw task ID from the LLM
   * @param index - The zero-based index of the task in the list
   * @returns The normalized task ID
   */
  private normalizeTaskId(id: string, index: number): string {
    if (/^task_\d{3}$/.test(id)) {
      return id;
    }
    return `task_${String(index + 1).padStart(3, "0")}`;
  }

  /**
   * Check if any task in the plan requires user approval.
   *
   * @param plan - The plan to check
   * @returns True if at least one task has requiresApproval set to true
   */
  hasTasksRequiringApproval(plan: Plan): boolean {
    return plan.tasks.some((task) => task.requiresApproval === true);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Plan Serialization
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Convert a Plan to Markdown format for prompt injection.
   *
   * @param plan - The plan to serialize
   * @returns Markdown string representation of the plan
   */
  toMarkdown(plan: Plan): string {
    const lines: string[] = [];
    lines.push(`# Plan: ${plan.id}`);
    lines.push("");
    lines.push(`**Status:** ${plan.status}`);
    lines.push(`**Tasks:** ${plan.tasks.length}`);
    lines.push("");

    for (const task of plan.tasks) {
      lines.push(`## ${task.id}`);
      lines.push(`- **Description:** ${task.description}`);
      lines.push(`- **Skills:** ${task.skills.join(", ")}`);
      lines.push(`- **Status:** ${task.status}`);
      lines.push(`- **Requires Approval:** ${task.requiresApproval ? "Yes" : "No"}`);
      if (task.dependencies.length > 0) {
        lines.push(`- **Dependencies:** ${task.dependencies.join(", ")}`);
      }
      if (task.assignedAgent !== undefined) {
        lines.push(`- **Assigned Agent:** ${task.assignedAgent}`);
      }
      if (task.result !== undefined) {
        lines.push(`- **Result:** ${task.result}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // State Persistence
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Read a Plan from session state.
   *
   * @param session - The session object (expected to have a `plan_state` property)
   * @returns The stored Plan or null if not found/invalid
   */
  readPlanState(session: unknown): Plan | null {
    if (session === null || session === undefined) {
      return null;
    }

    try {
      const s = session as Record<string, unknown>;
      // Check nested data.plan_state first (OpenClaw session convention)
      let planState: unknown = s.plan_state;
      if (
        planState === undefined &&
        typeof s.data === "object" &&
        s.data !== null
      ) {
        planState = (s.data as Record<string, unknown>).plan_state;
      }
      if (planState === undefined || planState === null) {
        return null;
      }
      const parsed = PlanSchema.parse(planState);
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Write a Plan to session state.
   *
   * @param session - The session object (expected to have a mutable data property)
   * @param plan - The Plan to store
   */
  writePlanState(session: unknown, plan: Plan): void {
    if (session === null || session === undefined) {
      return;
    }

    try {
      const s = session as Record<string, unknown>;
      if (typeof s.data === "object" && s.data !== null) {
        (s.data as Record<string, unknown>).plan_state = plan;
      } else {
        s.plan_state = plan;
      }
    } catch {
      // Silently fail if session is not mutable
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Prompt builders (private)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Build the classification prompt for the LLM.
   */
  private buildClassificationPrompt(request: string): string {
    return [
      "Classify the following user request as either 'simple' or 'complex'.",
      "A 'simple' request can be answered directly without research or multi-step execution.",
      "A 'complex' request requires research, multiple steps, or tool usage.",
      "",
      "Respond with exactly one word: simple or complex.",
      "",
      `User request: "${request}"`,
      "",
      "Classification:",
    ].join("\n");
  }

  /**
   * Build the decomposition prompt for the LLM.
   */
  private buildDecompositionPrompt(request: string): string {
    return [
      "Decompose the following user request into a JSON array of tasks.",
      "Each task must have: id, description, skills (array), dependencies (array of task ids).",
      "Valid skills: search, browser, shell, code, file.",
      "Tasks with 'shell' skill are considered high-risk and will require approval.",
      "Ensure the dependency graph is a DAG (no cycles).",
      "",
      "Respond ONLY with valid JSON in this exact shape:",
      '{"tasks":[{"id":"task_001","description":"...","skills":["code"],"dependencies":[]}]}',
      "",
      `User request: "${request}"`,
      "",
      "JSON:",
    ].join("\n");
  }
}
