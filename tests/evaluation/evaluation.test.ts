import { describe, it, expect } from "vitest";
import { runEvaluation, runScenario } from "./runner.js";
import { generateMarkdownReport, saveReport } from "./report-generator.js";
import { SCENARIOS, getScenarioById } from "./scenarios.js";
import { getGrade, calculateDimensionAverages } from "./metrics.js";

describe("Orchestration Capability Evaluation", () => {
  // Individual scenario tests
  for (const scenario of SCENARIOS) {
    it(
      `evaluates scenario: ${scenario.name}`,
      async () => {
        const result = await runScenario(scenario);

        expect(result.planGenerated).not.toBeNull();
        expect(result.classification).toBe("complex");
        expect(result.totalScore).toBeGreaterThanOrEqual(0);
        expect(result.totalScore).toBeLessThanOrEqual(result.maxPossibleScore);
        expect(result.metricScores).toHaveLength(7);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);

        console.log(
          `Scenario "${scenario.name}" scored ${result.totalScore.toFixed(1)} / ${result.maxPossibleScore}`
        );
      },
      30000
    );
  }

  it(
    "produces an overall evaluation report meeting minimum thresholds",
    async () => {
      const results = await runEvaluation();
      const report = generateMarkdownReport(results);

      // Overall average score >= 60
      const overallAverage =
        results.length > 0
          ? results.reduce((sum, r) => sum + r.totalScore, 0) / results.length
          : 0;
      expect(overallAverage).toBeGreaterThanOrEqual(60);

      // At least 4 out of 6 scenarios pass
      const passedCount = results.filter((r) => r.passed).length;
      expect(passedCount).toBeGreaterThanOrEqual(4);

      // No dimension averages to 0
      const dimensionAverages = calculateDimensionAverages(results);
      for (const [dimension, average] of Object.entries(dimensionAverages)) {
        expect(average).toBeGreaterThan(0);
        if (average === 0) {
          console.error(`Dimension "${dimension}" averaged to 0`);
        }
      }

      // Save report
      const reportPath = await saveReport(
        report,
        "eval-reports/test-evaluation-report.md"
      );
      console.log(`Evaluation report saved to: ${reportPath}`);
    },
    30000
  );

  it("grading scale works correctly", () => {
    const aGrade = getGrade(95);
    expect(aGrade.letter).toBe("A");
    expect(aGrade.label).toBe("Excellent");

    const bGrade = getGrade(85);
    expect(bGrade.letter).toBe("B");
    expect(bGrade.label).toBe("Good");

    const cGrade = getGrade(75);
    expect(cGrade.letter).toBe("C");
    expect(cGrade.label).toBe("Acceptable");

    const dGrade = getGrade(65);
    expect(dGrade.letter).toBe("D");
    expect(dGrade.label).toBe("Needs Improvement");

    const fGrade = getGrade(55);
    expect(fGrade.letter).toBe("F");
    expect(fGrade.label).toBe("Unacceptable");
  });

  it("can retrieve scenarios by id", () => {
    const validScenario = getScenarioById("multi-source-research");
    expect(validScenario).toBeDefined();
    expect(validScenario?.id).toBe("multi-source-research");

    const invalidScenario = getScenarioById("non-existent-scenario");
    expect(invalidScenario).toBeUndefined();
  });
});
