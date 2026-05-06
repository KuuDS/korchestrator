import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  ScenarioResult,
  EvaluationReport,
  MetricScore,
  EvalDimension,
} from "./types.js";
import { getGrade, DIMENSION_WEIGHTS } from "./metrics.js";

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatTimestamp(date: Date): string {
  return date.toISOString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function makeProgressBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

function getStatusEmoji(passed: boolean): string {
  return passed ? "✅" : "❌";
}

function getWarningEmoji(score: number): string {
  if (score >= 80) return "✅";
  if (score >= 60) return "⚠️";
  return "❌";
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function generateMarkdownReport(results: ScenarioResult[]): string {
  const timestamp = formatTimestamp(new Date());
  const lines: string[] = [];

  lines.push("# 🤖 Orchestration Capability Evaluation Report");
  lines.push("");
  lines.push(`Generated: ${timestamp}`);
  lines.push("");

  lines.push(generateExecutiveSummary(results));
  lines.push("");

  lines.push(generateDimensionTable(results));
  lines.push("");

  lines.push("## 📋 Scenario Results");
  lines.push("");
  for (let i = 0; i < results.length; i++) {
    lines.push(generateScenarioSection(results[i], i + 1));
    lines.push("");
  }

  lines.push("## 💡 Recommendations");
  lines.push("");
  const recommendations = generateRecommendations(results);
  if (recommendations.length === 0) {
    lines.push("All dimensions scored well — no specific recommendations at this time. 🎉");
  } else {
    for (let i = 0; i < recommendations.length; i++) {
      lines.push(`${i + 1}. ${recommendations[i]}`);
    }
  }
  lines.push("");

  lines.push("## 📎 Appendix");
  lines.push("");
  lines.push("<details>");
  lines.push("<summary>Raw JSON data</summary>");
  lines.push("");
  lines.push("```json");
  const report: EvaluationReport = {
    timestamp,
    totalScenarios: results.length,
    passedScenarios: results.filter((r) => r.passed).length,
    overallScore: calculateOverallScore(results),
    maxPossibleScore: 100,
    dimensionAverages: calculateDimensionAverages(results),
    scenarioResults: results,
    summary: generateConsoleSummary(results),
  };
  lines.push(JSON.stringify(report, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("</details>");
  lines.push("");

  return lines.join("\n");
}

export function generateExecutiveSummary(results: ScenarioResult[]): string {
  const overallScore = calculateOverallScore(results);
  const grade = getGrade(overallScore);
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;
  const avgDuration =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.durationMs, 0) / results.length)
      : 0;

  const lines: string[] = [];
  lines.push("## 📊 Executive Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Overall Score | **${overallScore.toFixed(1)}%** / 100% |`);
  lines.push(`| Grade | **${grade.letter}** (${grade.label}) |`);
  lines.push(`| Scenarios Passed | **${passedCount}** / ${results.length} |`);
  lines.push(`| Scenarios Failed | **${failedCount}** / ${results.length} |`);
  lines.push(`| Avg Duration | ${formatDuration(avgDuration)} |`);
  lines.push("");

  // Grade distribution
  const distribution = calculateGradeDistribution(results);
  lines.push("### Grade Distribution");
  lines.push("");
  for (const [letter, count] of Object.entries(distribution)) {
    const pct = results.length > 0 ? Math.round((count / results.length) * 100) : 0;
    lines.push(`- **${letter}**: ${count} scenario${count === 1 ? "" : "s"} (${pct}%)`);
  }
  lines.push("");

  return lines.join("\n");
}

export function generateDimensionTable(results: ScenarioResult[]): string {
  const averages = calculateDimensionAverages(results);
  const dimensions = Object.keys(DIMENSION_WEIGHTS) as EvalDimension[];

  const lines: string[] = [];
  lines.push("## 🎯 Dimension Breakdown");
  lines.push("");
  lines.push("| Dimension | Weight | Avg Score | Grade | Status |");
  lines.push("|-----------|--------|-----------|-------|--------|");

  for (const dim of dimensions) {
    const avg = averages[dim];
    const weight = DIMENSION_WEIGHTS[dim];
    const grade = getGrade(avg);
    const emoji = getWarningEmoji(avg);
    lines.push(
      `| ${capitalize(dim)} | ${weight}% | ${avg.toFixed(1)} | ${grade.letter} (${grade.label}) | ${emoji} |`
    );
  }
  lines.push("");

  // Add a simple bar-chart view
  lines.push("### Visual Summary");
  lines.push("");
  for (const dim of dimensions) {
    const avg = averages[dim];
    const bar = makeProgressBar(avg);
    lines.push(`- **${capitalize(dim)}**: ${bar} ${avg.toFixed(1)}%`);
  }
  lines.push("");

  return lines.join("\n");
}

export function generateScenarioSection(
  result: ScenarioResult,
  index?: number
): string {
  const scenarioNum = index ?? 1;
  const percentage = calculateScenarioPercentage(result);
  const grade = getGrade(percentage);
  const lines: string[] = [];

  lines.push(
    `### Scenario ${scenarioNum}: ${result.scenario.name}`
  );
  lines.push("");
  lines.push(`**Score:** ${percentage.toFixed(1)}% / 100% (Grade: ${grade.letter})`);
  lines.push(
    `**Status:** ${getStatusEmoji(result.passed)} ${result.passed ? "PASSED" : "FAILED"}`
  );
  lines.push(`**Duration:** ${formatDuration(result.durationMs)}`);
  lines.push("");

  lines.push("#### Request");
  lines.push("> " + result.scenario.userRequest.replace(/\n/g, "\n> "));
  lines.push("");

  lines.push("#### Classification");
  lines.push(`- **Complexity:** ${result.classification ?? "N/A"}`);
  lines.push(`- **Category:** ${result.scenario.category}`);
  lines.push("");

  lines.push("#### Score Breakdown");
  lines.push("");
  lines.push("| Dimension | Score | Max | Weight | Weighted |");
  lines.push("|-----------|-------|-----|--------|----------|");
  for (const ms of result.metricScores) {
    const weight = DIMENSION_WEIGHTS[ms.dimension];
    const weighted = ((ms.score * weight) / 100).toFixed(1);
    lines.push(
      `| ${capitalize(ms.dimension)} | ${ms.score.toFixed(1)} | ${ms.maxScore} | ${weight}% | ${weighted} |`
    );
  }
  const totalPercentage = calculateScenarioPercentage(result);
  lines.push(
    `| **Total** | | | | **${totalPercentage.toFixed(1)}%** |`
  );
  lines.push("");

  lines.push("#### Plan Structure");
  lines.push("");
  if (result.planGenerated === null) {
    lines.push("⚠️ No plan was generated for this scenario.");
  } else {
    const tasks = result.planGenerated.tasks;
    lines.push(`- **Tasks:** ${tasks.length}`);
    lines.push("");
    lines.push("| # | Task ID | Description | Dependencies | Agent |");
    lines.push("|---|---------|-------------|--------------|-------|");
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const deps = t.dependencies.length > 0 ? t.dependencies.join(", ") : "—";
      const agent = t.assignedAgent ?? "—";
      lines.push(
        `| ${i + 1} | ${t.id} | ${t.description.substring(0, 60).replace(/\|/g, "\\|")}${t.description.length > 60 ? "..." : ""} | ${deps} | ${agent} |`
      );
    }
  }
  lines.push("");

  lines.push("#### Routing Decisions");
  lines.push("");
  if (result.routingDecisions.length === 0) {
    lines.push("_No routing decisions recorded._");
  } else {
    lines.push("| Task | Routed To | Expected | Match |");
    lines.push("|------|-----------|----------|-------|");
    for (const rd of result.routingDecisions) {
      const match = rd.agentId === rd.expectedAgentId ? "✅" : "❌";
      lines.push(`| ${rd.taskId} | ${rd.agentId} | ${rd.expectedAgentId} | ${match} |`);
    }
  }
  lines.push("");

  lines.push("#### Execution Trace");
  lines.push("");
  if (result.executionTrace.length === 0) {
    lines.push("_No execution trace recorded._");
  } else {
    for (const step of result.executionTrace) {
      const emoji = step.success ? "✅" : "❌";
      let detail = `**${step.step}.** ${emoji} \`${step.action}\``;
      if (step.taskId) detail += ` → task \`${step.taskId}\``;
      if (step.agentId) detail += ` → agent \`${step.agentId}\``;
      if (step.details) detail += ` — *${step.details}*`;
      lines.push(`- ${detail}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

export function generateRecommendations(results: ScenarioResult[]): string[] {
  if (results.length === 0) return [];

  const averages = calculateDimensionAverages(results);
  const dimensions = Object.keys(averages) as EvalDimension[];

  // Sort by score ascending (weakest first)
  const sorted = dimensions
    .map((d) => ({ dimension: d, score: averages[d] }))
    .sort((a, b) => a.score - b.score);

  const recommendations: string[] = [];

  for (const entry of sorted) {
    if (entry.score >= 80) continue; // Only recommend for dimensions below B

    const dim = entry.dimension;
    const score = entry.score;

    switch (dim) {
      case "planning":
        recommendations.push(
          `**Planning (${score.toFixed(1)}%)** — Improve task decomposition granularity and ensure descriptions are meaningful (10–300 chars). Validate DAG correctness.`
        );
        break;
      case "routing":
        recommendations.push(
          `**Routing (${score.toFixed(1)}%)** — Review agent-to-task skill matching. Consider expanding agent skill coverage or refining task requirements.`
        );
        break;
      case "parallelism":
        recommendations.push(
          `**Parallelism (${score.toFixed(1)}%)** — Identify independent tasks that can run concurrently. Reduce unnecessary sequential dependencies.`
        );
        break;
      case "dependencies":
        recommendations.push(
          `**Dependencies (${score.toFixed(1)}%)** — Eliminate circular dependencies and dangling references. Ensure every dependency resolves to an existing task.`
        );
        break;
      case "replanning":
        recommendations.push(
          `**Replanning (${score.toFixed(1)}%)** — Add retry, fallback, or skip logic for recovery scenarios. Include verification steps in non-recovery plans.`
        );
        break;
      case "aggregation":
        recommendations.push(
          `**Aggregation (${score.toFixed(1)}%)** — Ensure a clear aggregation/synthesis task exists and that upstream tasks feed into it.`
        );
        break;
      case "toolUsage":
        recommendations.push(
          `**Tool Usage (${score.toFixed(1)}%)** — Use required skills (e.g., search when specified) and increase skill diversity across tasks.`
        );
        break;
      default:
        // Exhaustive check
        const _exhaustive: never = dim;
        void _exhaustive;
    }
  }

  return recommendations;
}

export async function saveReport(
  report: string,
  outputPath?: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath =
    outputPath ?? path.join("eval-reports", `evaluation-report-${timestamp}.md`);

  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, report, "utf-8");

  return filePath;
}

export function generateConsoleSummary(results: ScenarioResult[]): string {
  if (results.length === 0) {
    return "No scenarios evaluated.";
  }

  const overallScore = calculateOverallScore(results);
  const grade = getGrade(overallScore);
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;
  const averages = calculateDimensionAverages(results);
  const dimensions = Object.keys(DIMENSION_WEIGHTS) as EvalDimension[];

  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("  ORCHESTRATION EVALUATION SUMMARY");
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`  Overall Score : ${overallScore.toFixed(1)}% / 100%`);
  lines.push(`  Grade         : ${grade.letter} (${grade.label})`);
  lines.push(`  Passed        : ${passedCount} / ${results.length}`);
  lines.push(`  Failed        : ${failedCount} / ${results.length}`);
  lines.push("");
  lines.push("  Dimension Averages:");
  for (const dim of dimensions) {
    const avg = averages[dim];
    const bar = makeProgressBar(avg, 15);
    lines.push(`    ${dim.padEnd(13)} ${bar} ${avg.toFixed(1)}%`);
  }
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────");
  lines.push("  Per-Scenario Results:");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const pct = calculateScenarioPercentage(r);
    const g = getGrade(pct);
    const status = r.passed ? "PASS" : "FAIL";
    lines.push(
      `    ${String(i + 1).padStart(2)}. ${r.scenario.name.padEnd(36)} ${status}  ${pct.toFixed(1).padStart(5)}%  ${g.letter}`
    );
  }
  lines.push("───────────────────────────────────────────────────────────");

  return lines.join("\n");
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function calculateScenarioPercentage(result: ScenarioResult): number {
  if (result.maxPossibleScore === 0) return 0;
  return Math.round((result.totalScore / result.maxPossibleScore) * 1000) / 10;
}

function calculateOverallScore(results: ScenarioResult[]): number {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, r) => sum + calculateScenarioPercentage(r), 0);
  return Math.round((total / results.length) * 10) / 10;
}

function calculateDimensionAverages(
  results: ScenarioResult[]
): Record<EvalDimension, number> {
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
    averages[dimension] =
      counts[dimension] > 0
        ? Math.round((sums[dimension] / counts[dimension]) * 10) / 10
        : 0;
  }

  return averages;
}

function calculateGradeDistribution(
  results: ScenarioResult[]
): Record<string, number> {
  const distribution: Record<string, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    F: 0,
  };

  for (const result of results) {
    const percentage = calculateScenarioPercentage(result);
    const grade = getGrade(percentage);
    const letter = grade.letter;
    if (letter in distribution) {
      distribution[letter]++;
    }
  }

  return distribution;
}
