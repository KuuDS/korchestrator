import type { Plan, Task, AgentRole, Skill } from "../../src/types.js";
import type { EvalDimension, MetricScore, Scenario, ScenarioResult } from "./types.js";

export const DIMENSION_WEIGHTS: Record<EvalDimension, number> = {
  planning: 30,
  routing: 20,
  parallelism: 15,
  dependencies: 10,
  replanning: 10,
  aggregation: 10,
  toolUsage: 5,
};

export const MAX_SCORE_PER_DIMENSION: Record<EvalDimension, number> = {
  planning: 100,
  routing: 100,
  parallelism: 100,
  dependencies: 100,
  replanning: 100,
  aggregation: 100,
  toolUsage: 100,
};

export function calculatePlanningScore(plan: Plan, scenario: Scenario): MetricScore {
  const details: string[] = [];
  const tasks = plan.tasks;

  // Task decomposition (0–10)
  let decompositionScore = 0;
  const taskCount = tasks.length;

  if (taskCount >= scenario.expectedMinTasks && taskCount <= scenario.expectedMaxTasks) {
    decompositionScore += 5;
    details.push(`Task count (${taskCount}) within expected range [${scenario.expectedMinTasks}, ${scenario.expectedMaxTasks}]`);
  } else {
    const offBy =
      taskCount < scenario.expectedMinTasks
        ? scenario.expectedMinTasks - taskCount
        : taskCount - scenario.expectedMaxTasks;
    decompositionScore += Math.max(0, 5 - offBy);
    details.push(`Task count (${taskCount}) outside expected range [${scenario.expectedMinTasks}, ${scenario.expectedMaxTasks}]`);
  }

  const badDescriptions = tasks.filter((t) => t.description.length === 0 || t.description.length < 5);
  if (badDescriptions.length === 0) {
    decompositionScore += 5;
    details.push("All task descriptions are meaningful");
  } else {
    decompositionScore += Math.max(0, 5 - badDescriptions.length);
    details.push(`${badDescriptions.length} tasks have empty or very short descriptions`);
  }

  decompositionScore = Math.min(10, decompositionScore);

  // Dependency correctness (0–10)
  const dagValidation = validateDAG(tasks);
  let dependencyScore = dagValidation.valid ? 10 : Math.max(0, 10 - dagValidation.errors.length * 2);
  if (dagValidation.valid) {
    details.push("DAG validation passed");
  } else {
    details.push(...dagValidation.errors);
  }

  // Task granularity (0–10)
  let granularityScore = 10;
  const tooShort = tasks.filter((t) => t.description.length > 0 && t.description.length < 10).length;
  const tooLong = tasks.filter((t) => t.description.length > 300).length;
  granularityScore -= tooShort * 2 + tooLong * 2;
  granularityScore = Math.max(0, granularityScore);
  if (tooShort > 0) details.push(`${tooShort} task descriptions are too short (< 10 chars)`);
  if (tooLong > 0) details.push(`${tooLong} task descriptions are too long (> 300 chars)`);
  if (tooShort === 0 && tooLong === 0) details.push("Task descriptions have reasonable granularity");

  const subtotal = decompositionScore + dependencyScore + granularityScore;
  const score = Math.round((subtotal / 30) * 100);

  return {
    dimension: "planning",
    score,
    maxScore: 100,
    details,
  };
}

export function calculateRoutingScore(plan: Plan, _scenario: Scenario, agentPool: AgentRole[]): MetricScore {
  const details: string[] = [];
  const tasks = plan.tasks;

  if (tasks.length === 0) {
    return { dimension: "routing", score: 0, maxScore: 100, details: ["No tasks to route"] };
  }

  if (agentPool.length === 0) {
    return { dimension: "routing", score: 0, maxScore: 100, details: ["Agent pool is empty"] };
  }

  let reasonableAssignments = 0;

  for (const task of tasks) {
    const required = new Set(task.skills);
    let bestAgent = agentPool[0];
    let bestOverlap = 0;

    for (const agent of agentPool) {
      const overlap = Array.from(required).filter((s) => agent.skills.includes(s)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestAgent = agent;
      }
    }

    const assignedAgentId = task.assignedAgent;
    const assignedAgent = assignedAgentId !== undefined
      ? agentPool.find((a) => a.agentId === assignedAgentId)
      : undefined;

    const agentToEvaluate = assignedAgent ?? bestAgent;
    const actualOverlap = Array.from(required).filter((s) => agentToEvaluate.skills.includes(s)).length;

    if (actualOverlap > 0) {
      reasonableAssignments++;
    } else {
      details.push(`Task ${task.id} routed to agent with no matching skills`);
    }
  }

  const score = Math.round((reasonableAssignments / tasks.length) * 100);

  if (reasonableAssignments === tasks.length) {
    details.push("All tasks routed to agents with matching skills");
  }

  return {
    dimension: "routing",
    score,
    maxScore: 100,
    details,
  };
}

export function calculateParallelismScore(plan: Plan, maxConcurrency: number): MetricScore {
  const details: string[] = [];
  const tasks = plan.tasks;

  if (tasks.length === 0) {
    return { dimension: "parallelism", score: 0, maxScore: 100, details: ["No tasks in plan"] };
  }

  const parallelism = calculateTheoreticalParallelism(tasks);
  details.push(`Theoretical parallelism: ${parallelism}`);
  details.push(`Max concurrency limit: ${maxConcurrency}`);

  let score: number;

  if (parallelism > maxConcurrency) {
    const excess = parallelism - maxConcurrency;
    score = Math.max(0, 100 - excess * 20);
    details.push(`Parallelism exceeds concurrency limit by ${excess}`);
  } else {
    // Reward utilization without exceeding limits
    const utilization = maxConcurrency > 0 ? parallelism / maxConcurrency : 0;
    score = Math.round(60 + utilization * 40);
  }

  if (parallelism === 1 && tasks.length > 1) {
    score = Math.min(score, 50);
    details.push("Plan is fully sequential despite having multiple tasks");
  }

  score = Math.min(100, Math.max(0, score));

  return {
    dimension: "parallelism",
    score,
    maxScore: 100,
    details,
  };
}

export function calculateDependencyScore(plan: Plan): MetricScore {
  const details: string[] = [];
  const tasks = plan.tasks;
  let score = 0;

  const dagValidation = validateDAG(tasks);

  if (dagValidation.valid) {
    score += 40;
    details.push("No circular dependencies detected");
  } else {
    const cycleErrors = dagValidation.errors.filter(
      (e) => e.includes("cycle") || e.includes("self-dependency")
    );
    details.push(...cycleErrors);
  }

  // Check dangling dependencies
  const taskIds = new Set(tasks.map((t) => t.id));
  let danglingCount = 0;
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!taskIds.has(dep)) {
        danglingCount++;
      }
    }
  }

  if (danglingCount === 0) {
    score += 30;
    details.push("All dependencies reference existing tasks");
  } else {
    details.push(`${danglingCount} dangling dependency references found`);
  }

  // Verify topological sort
  try {
    const sorted = runTopologicalSort(tasks);
    if (sorted.length === tasks.length) {
      score += 30;
      details.push("Topological sort produces valid ordering");
    } else {
      details.push("Topological sort did not include all tasks");
    }
  } catch (_err) {
    details.push("Topological sort failed — cycle detected");
  }

  score = Math.min(100, Math.max(0, score));

  return {
    dimension: "dependencies",
    score,
    maxScore: 100,
    details,
  };
}

export function calculateReplanningScore(plan: Plan, scenario: Scenario): MetricScore {
  const details: string[] = [];
  const tasks = plan.tasks;
  let score = 0;

  if (scenario.category === "recovery") {
    let hasRetry = false;
    let hasSkip = false;

    for (const task of tasks) {
      if (task._retryCount !== undefined && task._retryCount > 0) {
        hasRetry = true;
      }
      const desc = task.description.toLowerCase();
      if (desc.includes("retry") || desc.includes("fallback") || desc.includes("alternative")) {
        hasRetry = true;
      }
      if (desc.includes("skip") || desc.includes("bypass") || desc.includes("ignore")) {
        hasSkip = true;
      }
    }

    if (hasRetry) {
      score += 50;
      details.push("Plan includes retry or fallback logic");
    } else {
      details.push("No retry or fallback logic detected");
    }

    if (hasSkip) {
      score += 50;
      details.push("Plan includes skip logic");
    } else {
      details.push("No skip logic detected");
    }
  } else {
    // Non-recovery: robustness indicators
    const parallelism = calculateTheoreticalParallelism(tasks);
    if (parallelism >= 2) {
      score += 30;
      details.push("Plan has parallel execution paths for robustness");
    } else {
      details.push("Plan is fully sequential");
    }

    const diversity = getSkillDiversity(plan);
    if (diversity >= 2) {
      score += 30;
      details.push(`Plan uses ${diversity} different skills`);
    } else {
      details.push("Limited skill diversity");
    }

    let hasContingency = false;
    for (const task of tasks) {
      const desc = task.description.toLowerCase();
      if (desc.includes("backup") || desc.includes("verify") || desc.includes("validate") || desc.includes("check")) {
        hasContingency = true;
        break;
      }
    }

    if (hasContingency) {
      score += 40;
      details.push("Plan includes verification or backup steps");
    } else {
      details.push("No explicit verification or backup steps");
    }
  }

  score = Math.min(100, score);

  return {
    dimension: "replanning",
    score,
    maxScore: 100,
    details,
  };
}

export function calculateAggregationScore(plan: Plan, _scenario: Scenario): MetricScore {
  const details: string[] = [];
  const tasks = plan.tasks;
  let score = 0;

  const hasAgg = hasAggregationTask(plan);
  if (hasAgg) {
    score += 50;
    details.push("Plan includes a clear aggregation/synthesis task");
  } else {
    details.push("No clear aggregation/synthesis task found");
  }

  // Check if all search tasks feed into aggregation
  const searchTasks = tasks.filter((t) => t.skills.includes("search"));
  if (searchTasks.length > 0) {
    const aggTask = findAggregationTask(tasks);

    if (aggTask !== undefined) {
      const searchTaskIds = new Set(searchTasks.map((t) => t.id));
      const directDeps = new Set(aggTask.dependencies);

      // A search task "feeds into" aggregation if it is a direct dependency,
      // or if it is a dependency of something that feeds into aggregation.
      const feeding = searchTasks.filter((st) => {
        if (directDeps.has(st.id)) return true;
        // Check transitive one level
        return tasks.some(
          (t) => t.dependencies.includes(st.id) && directDeps.has(t.id)
        );
      });

      if (feeding.length === searchTasks.length) {
        score += 50;
        details.push("All search tasks feed into aggregation");
      } else {
        const ratio = feeding.length / searchTasks.length;
        score += Math.round(ratio * 50);
        details.push(`${searchTasks.length - feeding.length} search tasks do not feed into aggregation`);
      }
    } else {
      details.push("Could not identify aggregation task to verify linkage");
    }
  } else {
    // No search tasks; aggregation score depends solely on presence of aggregation task
    if (hasAgg) {
      score = 100;
    }
    details.push("No search tasks in plan");
  }

  score = Math.min(100, score);

  return {
    dimension: "aggregation",
    score,
    maxScore: 100,
    details,
  };
}

export function calculateToolUsageScore(plan: Plan, scenario: Scenario): MetricScore {
  const details: string[] = [];
  const tasks = plan.tasks;
  let score = 0;

  if (scenario.requiresSearch) {
    const hasSearch = tasks.some((t) => t.skills.includes("search"));
    if (hasSearch) {
      score += 50;
      details.push("Search skill is used as required");
    } else {
      details.push("Search skill missing despite scenario requiring search");
    }
  } else {
    score += 50;
    details.push("Scenario does not require search");
  }

  const diversity = getSkillDiversity(plan);
  const maxSkills = 5;
  const diversityScore = Math.round((diversity / maxSkills) * 50);
  score += diversityScore;
  details.push(`Skill diversity: ${diversity}/${maxSkills} unique skills used`);

  score = Math.min(100, score);

  return {
    dimension: "toolUsage",
    score,
    maxScore: 100,
    details,
  };
}

export function calculateScenarioTotal(scores: MetricScore[]): { total: number; max: number; percentage: number } {
  let total = 0;
  let max = 0;

  for (const score of scores) {
    const weight = DIMENSION_WEIGHTS[score.dimension];
    total += score.score * weight;
    max += score.maxScore * weight;
  }

  const percentage = max > 0 ? Math.round((total / max) * 100) : 0;

  return { total, max, percentage };
}

export function getGrade(percentage: number): { letter: string; label: string } {
  if (percentage >= 90) {
    return { letter: "A", label: "Excellent" };
  }
  if (percentage >= 80) {
    return { letter: "B", label: "Good" };
  }
  if (percentage >= 70) {
    return { letter: "C", label: "Acceptable" };
  }
  if (percentage >= 60) {
    return { letter: "D", label: "Needs Improvement" };
  }
  return { letter: "F", label: "Unacceptable" };
}

export function calculateDimensionAverages(results: ScenarioResult[]): Record<EvalDimension, number> {
  const sums: Record<EvalDimension, number> = {
    planning: 0,
    routing: 0,
    parallelism: 0,
    dependencies: 0,
    replanning: 0,
    aggregation: 0,
    toolUsage: 0,
  };

  const counts: Record<EvalDimension, number> = {
    planning: 0,
    routing: 0,
    parallelism: 0,
    dependencies: 0,
    replanning: 0,
    aggregation: 0,
    toolUsage: 0,
  };

  for (const result of results) {
    for (const score of result.metricScores) {
      sums[score.dimension] += score.score;
      counts[score.dimension]++;
    }
  }

  const averages: Record<EvalDimension, number> = {
    planning: 0,
    routing: 0,
    parallelism: 0,
    dependencies: 0,
    replanning: 0,
    aggregation: 0,
    toolUsage: 0,
  };

  for (const dimension of Object.keys(sums) as EvalDimension[]) {
    averages[dimension] = counts[dimension] > 0 ? Math.round(sums[dimension] / counts[dimension]) : 0;
  }

  return averages;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════════════

export function validateDAG(tasks: Task[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const taskIds = new Set(tasks.map((t) => t.id));

  // Check for dangling dependencies
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!taskIds.has(dep)) {
        errors.push(`Task ${task.id} depends on non-existent task ${dep}`);
      }
    }
  }

  // Check for self-loops
  for (const task of tasks) {
    if (task.dependencies.includes(task.id)) {
      errors.push(`Task ${task.id} has a self-dependency`);
    }
  }

  // Check for cycles using Kahn's algorithm
  if (tasks.length > 0) {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of tasks) {
      inDegree.set(task.id, 0);
      adjacency.set(task.id, []);
    }

    for (const task of tasks) {
      for (const dep of task.dependencies) {
        if (taskIds.has(dep) && dep !== task.id) {
          const neighbors = adjacency.get(dep) ?? [];
          neighbors.push(task.id);
          adjacency.set(dep, neighbors);
          const current = inDegree.get(task.id) ?? 0;
          inDegree.set(task.id, current + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    let processed = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) continue;
      processed++;

      const neighbors = adjacency.get(current) ?? [];
      for (const neighbor of neighbors) {
        const degree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, degree);
        if (degree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (processed !== tasks.length) {
      errors.push("Cycle detected in task dependencies");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function calculateTheoreticalParallelism(tasks: Task[]): number {
  if (tasks.length === 0) return 0;

  const taskIds = new Set(tasks.map((t) => t.id));

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const levels = new Map<string, number>();

  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
    levels.set(task.id, 0);
  }

  for (const task of tasks) {
    const validDeps = task.dependencies.filter((d) => taskIds.has(d) && d !== task.id);
    for (const dep of validDeps) {
      const neighbors = adjacency.get(dep) ?? [];
      neighbors.push(task.id);
      adjacency.set(dep, neighbors);
      const current = inDegree.get(task.id) ?? 0;
      inDegree.set(task.id, current + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
      levels.set(id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    const currentLevel = levels.get(current) ?? 0;

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const newLevel = Math.max(levels.get(neighbor) ?? 0, currentLevel + 1);
      levels.set(neighbor, newLevel);

      const degree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, degree);
      if (degree === 0) {
        queue.push(neighbor);
      }
    }
  }

  const levelCounts = new Map<number, number>();
  for (const level of levels.values()) {
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  }

  let maxParallelism = 0;
  for (const count of levelCounts.values()) {
    if (count > maxParallelism) {
      maxParallelism = count;
    }
  }

  return maxParallelism;
}

export function hasAggregationTask(plan: Plan): boolean {
  const aggregationKeywords = [
    "aggregate",
    "synthes",
    "combine",
    "summar",
    "final",
    "merge",
    "report",
    "consolidat",
    "integrat",
    "compile",
    "review",
  ];

  for (const task of plan.tasks) {
    const desc = task.description.toLowerCase();
    for (const keyword of aggregationKeywords) {
      if (desc.includes(keyword)) {
        return true;
      }
    }
  }

  // Fallback: task with many dependents
  const dependentCount = new Map<string, number>();
  for (const task of plan.tasks) {
    dependentCount.set(task.id, 0);
  }
  for (const task of plan.tasks) {
    for (const dep of task.dependencies) {
      const count = dependentCount.get(dep) ?? 0;
      dependentCount.set(dep, count + 1);
    }
  }

  for (const [taskId, count] of dependentCount) {
    if (count >= 2 && count >= plan.tasks.length / 3) {
      return true;
    }
  }

  return false;
}

export function getSkillDiversity(plan: Plan): number {
  const uniqueSkills = new Set<Skill>();
  for (const task of plan.tasks) {
    for (const skill of task.skills) {
      uniqueSkills.add(skill);
    }
  }
  return uniqueSkills.size;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════════

function runTopologicalSort(tasks: Task[]): string[] {
  if (tasks.length === 0) return [];

  const taskIds = new Set(tasks.map((t) => t.id));

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (taskIds.has(dep) && dep !== task.id) {
        const neighbors = adjacency.get(dep) ?? [];
        neighbors.push(task.id);
        adjacency.set(dep, neighbors);
        const current = inDegree.get(task.id) ?? 0;
        inDegree.set(task.id, current + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    result.push(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const degree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, degree);
      if (degree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return result;
}

function findAggregationTask(tasks: Task[]): Task | undefined {
  const aggregationKeywords = [
    "aggregate",
    "synthes",
    "combine",
    "summar",
    "final",
    "merge",
    "report",
    "consolidat",
    "integrat",
    "compile",
    "review",
  ];

  for (const task of tasks) {
    const desc = task.description.toLowerCase();
    if (aggregationKeywords.some((k) => desc.includes(k))) {
      return task;
    }
  }

  // Fallback: task with most dependents
  const dependentCount = new Map<string, number>();
  for (const task of tasks) {
    dependentCount.set(task.id, 0);
  }
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      const count = dependentCount.get(dep) ?? 0;
      dependentCount.set(dep, count + 1);
    }
  }

  let maxDependents = 0;
  let bestTask: Task | undefined;
  for (const [taskId, count] of dependentCount) {
    if (count > maxDependents) {
      maxDependents = count;
      bestTask = tasks.find((t) => t.id === taskId);
    }
  }

  return bestTask;
}
