#!/usr/bin/env node
import { runEvaluation } from "../tests/evaluation/runner.js";
import {
  generateMarkdownReport,
  generateConsoleSummary,
  saveReport,
} from "../tests/evaluation/report-generator.js";
import { calculateDimensionAverages, getGrade } from "../tests/evaluation/metrics.js";
import { SCENARIOS } from "../tests/evaluation/scenarios.js";
import * as path from "node:path";
import type { Scenario, ScenarioResult } from "../tests/evaluation/types.js";

interface CliOptions {
  live: boolean;
  outputDir: string;
  scenarios: Scenario[];
  help: boolean;
}

const HELP_MESSAGE = `
Usage: tsx scripts/run-evaluation.ts [options]

Options:
  --live, -l          Use live LLM mode (requires API key)
  --output, -o DIR    Output directory for reports (default: eval-reports)
  --scenarios, -s IDS Comma-separated scenario IDs (default: all)
  --help, -h          Show this help message

Examples:
  tsx scripts/run-evaluation.ts
  tsx scripts/run-evaluation.ts --live --output ./reports
  tsx scripts/run-evaluation.ts --scenarios multi-source-research,competitive-analysis
`.trim();

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    live: false,
    outputDir: "eval-reports",
    scenarios: [...SCENARIOS],
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--live":
      case "-l":
        options.live = true;
        break;
      case "--output":
      case "-o": {
        const val = args[++i];
        if (val === undefined || val.startsWith("-")) {
          console.error(`Error: ${arg} requires a directory path.`);
          process.exit(2);
        }
        options.outputDir = val;
        break;
      }
      case "--scenarios":
      case "-s": {
        const val = args[++i];
        if (val === undefined || val.startsWith("-")) {
          console.error(`Error: ${arg} requires a comma-separated list of scenario IDs.`);
          process.exit(2);
        }
        const ids = val.split(",").map((id) => id.trim()).filter(Boolean);
        const selected: Scenario[] = [];
        for (const id of ids) {
          const scenario = SCENARIOS.find((s) => s.id === id);
          if (scenario === undefined) {
            console.error(`Error: Unknown scenario ID "${id}".`);
            console.error(`Available: ${SCENARIOS.map((s) => s.id).join(", ")}`);
            process.exit(2);
          }
          selected.push(scenario);
        }
        options.scenarios = selected;
        break;
      }
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`Error: Unknown option "${arg}".`);
          process.exit(2);
        }
        break;
    }
  }

  return options;
}

function printBanner(): void {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║     🤖 OpenClaw Plan-Subagent Orchestration Evaluation       ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log();
}

function printConfig(options: CliOptions): void {
  const mode = options.live ? "🔴 Live LLM" : "🔵 Mock";
  console.log("Configuration:");
  console.log(`  Mode           : ${mode}`);
  console.log(`  Scenarios      : ${options.scenarios.length}`);
  console.log(`  Output dir     : ${options.outputDir}`);
  console.log();
}

function calculateOverallScore(results: ScenarioResult[]): number {
  if (results.length === 0) return 0;
  const totalPercentage = results.reduce((sum, r) => {
    const pct = r.maxPossibleScore > 0 ? (r.totalScore / r.maxPossibleScore) * 100 : 0;
    return sum + pct;
  }, 0);
  return Math.round((totalPercentage / results.length) * 10) / 10;
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    console.log(HELP_MESSAGE);
    process.exit(0);
  }

  printBanner();
  printConfig(options);

  const results = await runEvaluation({
    scenarios: options.scenarios,
    live: options.live,
  });

  // Print console summary
  const summary = generateConsoleSummary(results);
  console.log();
  console.log(summary);

  // Generate and save markdown report
  const report = generateMarkdownReport(results);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFilePath = path.join(
    options.outputDir,
    `evaluation-report-${timestamp}.md`
  );
  const reportPath = await saveReport(report, reportFilePath);

  console.log();
  console.log(`📄 Report saved to: ${reportPath}`);

  // Print overall grade
  const overallScore = calculateOverallScore(results);
  const grade = getGrade(overallScore);
  console.log(`🏆 Overall Grade: ${grade.letter} (${grade.label}) — ${overallScore.toFixed(1)}%`);
  console.log();

  // Exit with appropriate code
  if (overallScore >= 70) {
    console.log("✅ Evaluation passed (score >= 70).");
    process.exit(0);
  } else {
    console.log("❌ Evaluation failed (score < 70).");
    process.exit(1);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`
💥 Evaluation runner failed:
${message}
`);
  process.exit(2);
});
