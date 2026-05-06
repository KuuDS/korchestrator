import { Planner } from "../../src/planner.js";
import { TaskRouter } from "../../src/router.js";
import { Replanner } from "../../src/replanner.js";
import type { Plan, AgentRole, Task, Skill } from "../../src/types.js";
import { DEFAULT_AGENT_ROLES } from "../../src/types.js";
import type {
  Scenario,
  ScenarioResult,
  MetricScore,
  ExecutionStep,
} from "./types.js";
import { SCENARIOS } from "./scenarios.js";
import {
  calculatePlanningScore,
  calculateRoutingScore,
  calculateParallelismScore,
  calculateDependencyScore,
  calculateReplanningScore,
  calculateAggregationScore,
  calculateToolUsageScore,
  calculateScenarioTotal,
  calculateDimensionAverages,
  DIMENSION_WEIGHTS,
} from "./metrics.js";

// ───────────────────────────────────────────────────────────────────────────────
// Mock plan generators — one per scenario
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Generate a realistic Plan for the multi-source-research scenario.
 * Searches multiple sources and synthesizes a report.
 */
export function generateResearchPlan(): Plan {
  const now = Date.now();
  const tasks: Task[] = [
    {
      id: "task_001",
      description: "Search academic papers for top AI breakthroughs in 2024",
      skills: ["search"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_002",
      description: "Search industry news for AI breakthroughs in 2024",
      skills: ["search", "browser"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_003",
      description: "Search open source projects for notable AI releases in 2024",
      skills: ["search", "code"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_004",
      description: "Compile comparative summary report with impact and maturity analysis",
      skills: ["file", "code"],
      dependencies: ["task_001", "task_002", "task_003"],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_005",
      description: "Review and validate the final report for completeness",
      skills: ["file", "code"],
      dependencies: ["task_004"],
      status: "pending",
      requiresApproval: false,
    },
  ];

  return {
    id: `plan_${now}`,
    status: "planning",
    tasks,
    taskRunMap: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate a realistic Plan for the competitive-analysis scenario.
 * Compares React Server Components, Next.js App Router, and Remix v2.
 */
export function generateAnalysisPlan(): Plan {
  const now = Date.now();
  const tasks: Task[] = [
    {
      id: "task_001",
      description: "Research React Server Components performance and developer experience",
      skills: ["search", "browser"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_002",
      description: "Research Next.js App Router ecosystem maturity and deployment complexity",
      skills: ["search", "browser"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_003",
      description: "Research Remix v2 performance benchmarks and adoption metrics",
      skills: ["search", "browser", "code"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_004",
      description: "Analyze and compare deployment complexity across all three frameworks",
      skills: ["code", "file"],
      dependencies: ["task_001", "task_002", "task_003"],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_005",
      description: "Synthesize ranked recommendation with justification and decision matrix",
      skills: ["file", "code"],
      dependencies: ["task_004"],
      status: "pending",
      requiresApproval: false,
    },
  ];

  return {
    id: `plan_${now}`,
    status: "planning",
    tasks,
    taskRunMap: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate a realistic Plan for the codebase-diagnosis scenario.
 * Finds deprecated API usage and applies refactoring.
 */
export function generateCodePlan(): Plan {
  const now = Date.now();
  const tasks: Task[] = [
    {
      id: "task_001",
      description: "Search codebase for all .then() chain usages that should use async/await",
      skills: ["search", "code"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_002",
      description: "Search codebase for all var declarations that should use const/let",
      skills: ["search", "code"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_003",
      description: "Create refactoring plan with prioritized changes and safety checks",
      skills: ["file", "code"],
      dependencies: ["task_001", "task_002"],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_004",
      description: "Apply async/await refactoring to identified .then() chains",
      skills: ["code", "file"],
      dependencies: ["task_003"],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_005",
      description: "Apply const/let refactoring to identified var declarations",
      skills: ["code", "file"],
      dependencies: ["task_003"],
      status: "pending",
      requiresApproval: false,
    },
  ];

  return {
    id: `plan_${now}`,
    status: "planning",
    tasks,
    taskRunMap: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate a realistic Plan for the technology-research scenario.
 * Compares PostgreSQL with TimescaleDB vs ClickHouse.
 */
export function generateTechResearchPlan(): Plan {
  const now = Date.now();
  const tasks: Task[] = [
    {
      id: "task_001",
      description: "Research PostgreSQL with TimescaleDB scalability and query performance",
      skills: ["search", "browser"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_002",
      description: "Research ClickHouse scalability and query performance for time-series data",
      skills: ["search", "browser"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_003",
      description: "Compare operational complexity and community support for both options",
      skills: ["search", "file"],
      dependencies: ["task_001", "task_002"],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_004",
      description: "Build decision matrix and provide final recommendation",
      skills: ["file", "code"],
      dependencies: ["task_003"],
      status: "pending",
      requiresApproval: false,
    },
  ];

  return {
    id: `plan_${now}`,
    status: "planning",
    tasks,
    taskRunMap: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate a realistic Plan for the dynamic-recovery scenario.
 * Includes retry and skip logic for handling search failures.
 */
export function generateRecoveryPlan(): Plan {
  const now = Date.now();
  const tasks: Task[] = [
    {
      id: "task_001",
      description: "Search for the latest stable version of Express.js with retry fallback",
      skills: ["search"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
      _retryCount: 1,
    },
    {
      id: "task_002",
      description: "Search for the latest stable version of Zod with retry fallback",
      skills: ["search"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
      _retryCount: 1,
    },
    {
      id: "task_003",
      description: "Search for the latest stable version of Vitest with retry fallback",
      skills: ["search"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
      _retryCount: 1,
    },
    {
      id: "task_004",
      description: "If any search fails after retries, mark dependency as skipped and continue",
      skills: ["code", "file"],
      dependencies: ["task_001", "task_002", "task_003"],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_005",
      description: "Generate compatibility report for successfully found versions",
      skills: ["file", "code"],
      dependencies: ["task_004"],
      status: "pending",
      requiresApproval: false,
    },
  ];

  return {
    id: `plan_${now}`,
    status: "planning",
    tasks,
    taskRunMap: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate a realistic Plan for the cross-domain-synthesis scenario.
 * Research TypeScript 5.5 features, create demo project, write README.
 */
export function generateSynthesisPlan(): Plan {
  const now = Date.now();
  const tasks: Task[] = [
    {
      id: "task_001",
      description: "Research latest TypeScript 5.5 type inference improvements",
      skills: ["search", "browser"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_002",
      description: "Research latest TypeScript 5.5 new utility types",
      skills: ["search", "browser"],
      dependencies: [],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_003",
      description: "Create demonstration project showcasing at least 3 TypeScript 5.5 features",
      skills: ["code", "file"],
      dependencies: ["task_001", "task_002"],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_004",
      description: "Write practical examples for each showcased feature",
      skills: ["code", "file"],
      dependencies: ["task_003"],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_005",
      description: "Write README.md explaining each feature and how examples work",
      skills: ["file", "code"],
      dependencies: ["task_004"],
      status: "pending",
      requiresApproval: false,
    },
    {
      id: "task_006",
      description: "Verify and validate all examples compile and run correctly",
      skills: ["code", "shell"],
      dependencies: ["task_004"],
      status: "pending",
      requiresApproval: true,
    },
  ];

  return {
    id: `plan_${now}`,
    status: "planning",
    tasks,
    taskRunMap: {},
    createdAt: now,
    updatedAt: now,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Mock plan dispatch
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Create a realistic mock Plan for a given scenario.
 * Dispatches to the appropriate plan generator based on scenario id.
 */
export function createMockPlan(scenario: Scenario): Plan {
  switch (scenario.id) {
    case "multi-source-research":
      return generateResearchPlan();
    case "competitive-analysis":
      return generateAnalysisPlan();
    case "codebase-diagnosis":
      return generateCodePlan();
    case "technology-research":
      return generateTechResearchPlan();
    case "dynamic-recovery":
      return generateRecoveryPlan();
    case "cross-domain-synthesis":
      return generateSynthesisPlan();
    default:
      // Fallback generic plan
      return generateGenericPlan(scenario);
  }
}

/**
 * Generate a generic fallback plan for any scenario.
 */
function generateGenericPlan(scenario: Scenario): Plan {
  const now = Date.now();
  const taskCount = Math.max(
    scenario.expectedMinTasks,
    Math.min(4, scenario.expectedMaxTasks)
  );

  const tasks: Task[] = [];
  const skills: Skill[] = ["search", "code", "file"];

  for (let i = 0; i < taskCount; i++) {
    const taskId = `task_${String(i + 1).padStart(3, "0")}`;
    const taskSkills: Skill[] = i === taskCount - 1
      ? ["file", "code"]
      : [skills[i % skills.length]];

    tasks.push({
      id: taskId,
      description: i === taskCount - 1
        ? `Synthesize and compile final results for: ${scenario.name}`
        : `Step ${i + 1}: Execute ${scenario.expectedSkills[i % scenario.expectedSkills.length]} operation`,
      skills: taskSkills,
      dependencies: i === 0 ? [] : [tasks[i - 1].id],
      status: "pending",
      requiresApproval: false,
    });
  }

  return {
    id: `plan_${now}`,
    status: "planning",
    tasks,
    taskRunMap: {},
    createdAt: now,
    updatedAt: now,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Mock planner factory
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock Planner that returns predefined plans for a scenario.
 * Useful for fast, deterministic CI evaluation without API calls.
 */
export function createMockPlanner(scenario: Scenario): Planner {
  const mockPlan = createMockPlan(scenario);

  const mockGenerate = async (prompt: string): Promise<string> => {
    // Classification prompt
    if (prompt.includes("Classify the following user request")) {
      return scenario.complexity;
    }

    // Decomposition prompt
    if (prompt.includes("Decompose the following user request")) {
      const response = {
        tasks: mockPlan.tasks.map((t) => ({
          id: t.id,
          description: t.description,
          skills: t.skills,
          dependencies: t.dependencies,
        })),
      };
      return JSON.stringify(response);
    }

    return "complex";
  };

  return new Planner(
    {
      model: "mock-model",
      maxTasks: 20,
      classificationRules: [],
      skipClassification: false,
    },
    mockGenerate
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Live planner factory
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Create a real Planner that makes actual LLM calls.
 * Requires OPENAI_API_KEY or similar to be set in the environment.
 */
function createLivePlanner(): Planner {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (apiKey.length === 0) {
    throw new Error("OPENAI_API_KEY environment variable is required for live mode");
  }

  const liveGenerate = async (prompt: string): Promise<string> => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content;
  };

  return new Planner(
    {
      model: "gpt-4o-mini",
      maxTasks: 20,
      classificationRules: [],
      skipClassification: false,
    },
    liveGenerate
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Scenario runner
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Run a single scenario through the orchestrator and collect metrics.
 *
 * @param scenario - The scenario to evaluate
 * @param options - Evaluation options (live mode vs mock mode)
 * @returns Complete scenario result with scores and trace
 */
export async function runScenario(
  scenario: Scenario,
  options?: { live?: boolean }
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const executionTrace: ExecutionStep[] = [];
  let stepCounter = 0;

  let planGenerated: Plan | null = null;
  let classification: "simple" | "complex" | null = null;
  const routingDecisions: Array<{
    taskId: string;
    agentId: string;
    expectedAgentId: string;
  }> = [];

  try {
    // ── Step 1: Create planner and classify ──────────────────────────────────
    const planner = options?.live ? createLivePlanner() : createMockPlanner(scenario);

    let classifySuccess = false;
    let classifyDetails = "";
    try {
      classification = await planner.classify(scenario.userRequest);
      classifySuccess = true;
      classifyDetails = `Classified as ${classification}`;
    } catch (err) {
      classifySuccess = false;
      classifyDetails = err instanceof Error ? err.message : String(err);
    }

    stepCounter++;
    executionTrace.push({
      step: stepCounter,
      action: "classify",
      success: classifySuccess,
      details: classifyDetails,
    });

    // ── Step 2: Create plan ──────────────────────────────────────────────────
    let planSuccess = false;
    let planDetails = "";
    try {
      planGenerated = await planner.createPlan(scenario.userRequest);
      planSuccess = true;
      planDetails = `Generated plan with ${planGenerated.tasks.length} tasks`;
    } catch (err) {
      planSuccess = false;
      planDetails = err instanceof Error ? err.message : String(err);
    }

    stepCounter++;
    executionTrace.push({
      step: stepCounter,
      action: "plan",
      success: planSuccess,
      details: planDetails,
    });

    // If planning failed, return early with zero scores
    if (planGenerated === null || !planSuccess) {
      const durationMs = Date.now() - startTime;
      const zeroScores: MetricScore[] = [
        { dimension: "planning", score: 0, maxScore: 100, details: ["Planning failed"] },
        { dimension: "routing", score: 0, maxScore: 100, details: ["Planning failed — no tasks to route"] },
        { dimension: "parallelism", score: 0, maxScore: 100, details: ["Planning failed — no tasks to analyze"] },
        { dimension: "dependencies", score: 0, maxScore: 100, details: ["Planning failed — no tasks to validate"] },
        { dimension: "replanning", score: 0, maxScore: 100, details: ["Planning failed"] },
        { dimension: "aggregation", score: 0, maxScore: 100, details: ["Planning failed — no tasks to aggregate"] },
        { dimension: "toolUsage", score: 0, maxScore: 100, details: ["Planning failed — no tasks to evaluate"] },
      ];
      const { total, max, percentage } = calculateScenarioTotal(zeroScores);

      return {
        scenario,
        planGenerated: null,
        classification,
        routingDecisions,
        metricScores: zeroScores,
        totalScore: total,
        maxPossibleScore: max,
        executionTrace,
        durationMs,
        passed: percentage >= 60,
      };
    }

    // ── Step 3: Route tasks ──────────────────────────────────────────────────
    const router = new TaskRouter({
      maxConcurrency: 3,
      agentPool: DEFAULT_AGENT_ROLES,
    });

    for (const task of planGenerated.tasks) {
      const agent = router.routeBySkill(task);
      task.assignedAgent = agent.agentId;

      // Determine expected agent based on skill overlap heuristic
      const required = new Set(task.skills);
      let expectedAgentId = DEFAULT_AGENT_ROLES[0].agentId;
      let bestOverlap = 0;
      for (const role of DEFAULT_AGENT_ROLES) {
        const overlap = Array.from(required).filter((s) => role.skills.includes(s)).length;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          expectedAgentId = role.agentId;
        }
      }

      routingDecisions.push({
        taskId: task.id,
        agentId: agent.agentId,
        expectedAgentId,
      });

      stepCounter++;
      executionTrace.push({
        step: stepCounter,
        action: "route",
        taskId: task.id,
        agentId: agent.agentId,
        success: true,
        details: `Routed to ${agent.name} (${agent.agentId})`,
      });
    }

    // ── Step 4: Calculate dimension scores ───────────────────────────────────
    const planningScore = calculatePlanningScore(planGenerated, scenario);
    const routingScore = calculateRoutingScore(planGenerated, scenario, DEFAULT_AGENT_ROLES);
    const parallelismScore = calculateParallelismScore(planGenerated, 3);
    const dependencyScore = calculateDependencyScore(planGenerated);
    const replanningScore = calculateReplanningScore(planGenerated, scenario);
    const aggregationScore = calculateAggregationScore(planGenerated, scenario);
    const toolUsageScore = calculateToolUsageScore(planGenerated, scenario);

    const metricScores: MetricScore[] = [
      planningScore,
      routingScore,
      parallelismScore,
      dependencyScore,
      replanningScore,
      aggregationScore,
      toolUsageScore,
    ];

    // ── Step 5: Compute total ────────────────────────────────────────────────
    const { total, max, percentage } = calculateScenarioTotal(metricScores);

    // ── Step 6: Determine pass/fail ──────────────────────────────────────────
    const passed = percentage >= 60;
    const durationMs = Date.now() - startTime;

    return {
      scenario,
      planGenerated,
      classification,
      routingDecisions,
      metricScores,
      totalScore: total,
      maxPossibleScore: max,
      executionTrace,
      durationMs,
      passed,
    };
  } catch (err) {
    // Catch-all for unexpected errors during scenario execution
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    stepCounter++;
    executionTrace.push({
      step: stepCounter,
      action: "execute",
      success: false,
      details: `Unexpected error: ${errorMessage}`,
    });

    const zeroScores: MetricScore[] = [
      { dimension: "planning", score: 0, maxScore: 100, details: [errorMessage] },
      { dimension: "routing", score: 0, maxScore: 100, details: [errorMessage] },
      { dimension: "parallelism", score: 0, maxScore: 100, details: [errorMessage] },
      { dimension: "dependencies", score: 0, maxScore: 100, details: [errorMessage] },
      { dimension: "replanning", score: 0, maxScore: 100, details: [errorMessage] },
      { dimension: "aggregation", score: 0, maxScore: 100, details: [errorMessage] },
      { dimension: "toolUsage", score: 0, maxScore: 100, details: [errorMessage] },
    ];
    const { total, max } = calculateScenarioTotal(zeroScores);

    return {
      scenario,
      planGenerated: null,
      classification: null,
      routingDecisions,
      metricScores: zeroScores,
      totalScore: total,
      maxPossibleScore: max,
      executionTrace,
      durationMs,
      passed: false,
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Full evaluation runner
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Run the full evaluation suite across all (or a subset of) scenarios.
 *
 * @param options - Optional scenario subset and live mode flag
 * @returns Array of scenario results
 */
export async function runEvaluation(
  options?: { scenarios?: Scenario[]; live?: boolean }
): Promise<ScenarioResult[]> {
  const scenarios = options?.scenarios ?? SCENARIOS;
  const live = options?.live ?? false;

  console.log(`Starting evaluation (${live ? "live" : "mock"} mode) with ${scenarios.length} scenarios...`);
  console.log("");

  const results: ScenarioResult[] = [];

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const progress = `[${i + 1}/${scenarios.length}]`;
    console.log(`${progress} Running scenario: ${scenario.name} (${scenario.id})`);

    try {
      const result = await runScenario(scenario, { live });
      results.push(result);

      const grade = result.passed ? "PASS" : "FAIL";
      const percentage = result.maxPossibleScore > 0
        ? Math.round((result.totalScore / result.maxPossibleScore) * 100)
        : 0;
      console.log(`  → ${grade} — ${percentage}% (${result.durationMs}ms)`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`  → ERROR: ${errorMessage}`);

      // Push a synthetic failure result so the evaluation continues
      const zeroScores: MetricScore[] = [
        { dimension: "planning", score: 0, maxScore: 100, details: [errorMessage] },
        { dimension: "routing", score: 0, maxScore: 100, details: [errorMessage] },
        { dimension: "parallelism", score: 0, maxScore: 100, details: [errorMessage] },
        { dimension: "dependencies", score: 0, maxScore: 100, details: [errorMessage] },
        { dimension: "replanning", score: 0, maxScore: 100, details: [errorMessage] },
        { dimension: "aggregation", score: 0, maxScore: 100, details: [errorMessage] },
        { dimension: "toolUsage", score: 0, maxScore: 100, details: [errorMessage] },
      ];
      const { total, max } = calculateScenarioTotal(zeroScores);

      results.push({
        scenario,
        planGenerated: null,
        classification: null,
        routingDecisions: [],
        metricScores: zeroScores,
        totalScore: total,
        maxPossibleScore: max,
        executionTrace: [
          {
            step: 1,
            action: "execute",
            success: false,
            details: errorMessage,
          },
        ],
        durationMs: 0,
        passed: false,
      });
    }
  }

  console.log("");
  console.log("Evaluation complete!");
  console.log(`  Scenarios run: ${results.length}`);
  console.log(`  Passed: ${results.filter((r) => r.passed).length}`);
  console.log(`  Failed: ${results.filter((r) => !r.passed).length}`);

  const averages = calculateDimensionAverages(results);
  console.log("  Dimension averages:");
  for (const dimension of Object.keys(DIMENSION_WEIGHTS) as Array<keyof typeof DIMENSION_WEIGHTS>) {
    console.log(`    ${dimension}: ${averages[dimension]}%`);
  }

  return results;
}

// ───────────────────────────────────────────────────────────────────────────────
// Re-export dimension weights for convenience
// ───────────────────────────────────────────────────────────────────────────────
export { DIMENSION_WEIGHTS };
