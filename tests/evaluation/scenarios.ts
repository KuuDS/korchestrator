import type { Scenario } from "./types.js";

/**
 * Scenario 1: Multi-Source Information Aggregation
 * Search for information from multiple sources and synthesize a report.
 */
const scenarioMultiSourceResearch: Scenario = {
  id: "multi-source-research",
  name: "Multi-Source Information Aggregation",
  description:
    "Search for information from multiple sources and synthesize a report",
  userRequest:
    "Search for the top 3 most significant AI breakthroughs in 2024 from different sources (academic papers, industry news, and open source projects). Then compile a comparative summary report highlighting their impact, maturity, and adoption barriers.",
  expectedSkills: ["search", "code", "file"],
  expectedMinTasks: 4,
  expectedMaxTasks: 6,
  requiresSearch: true,
  expectedDependencies: [{ from: "search tasks", to: "synthesis task" }],
  complexity: "complex",
  category: "information",
};

/**
 * Scenario 2: Competitive Technology Analysis
 * Compare multiple competing technologies and provide recommendations.
 */
const scenarioCompetitiveAnalysis: Scenario = {
  id: "competitive-analysis",
  name: "Competitive Technology Analysis",
  description: "Compare multiple competing technologies and provide recommendations",
  userRequest:
    "Research and compare React Server Components, Next.js App Router, and Remix v2 for building a new e-commerce dashboard. Analyze performance, developer experience, ecosystem maturity, and deployment complexity. Provide a ranked recommendation with justification.",
  expectedSkills: ["search", "browser", "code", "file"],
  expectedMinTasks: 4,
  expectedMaxTasks: 7,
  requiresSearch: true,
  complexity: "complex",
  category: "analysis",
};

/**
 * Scenario 3: Codebase Diagnosis and Refactoring
 * Find issues in codebase and apply fixes.
 */
const scenarioCodebaseDiagnosis: Scenario = {
  id: "codebase-diagnosis",
  name: "Codebase Diagnosis and Refactoring",
  description: "Find issues in codebase and apply fixes",
  userRequest:
    "Search the codebase for all instances of deprecated API usage (any use of `.then()` chains where async/await would be cleaner, and any `var` declarations). Then create a refactoring plan and apply the changes systematically, ensuring no functionality is broken.",
  expectedSkills: ["search", "code", "file"],
  expectedMinTasks: 3,
  expectedMaxTasks: 5,
  requiresSearch: true,
  expectedDependencies: [{ from: "search", to: "refactor" }],
  complexity: "complex",
  category: "code",
};

/**
 * Scenario 4: Technology Stack Research
 * Research technology options and provide structured recommendation.
 */
const scenarioTechnologyResearch: Scenario = {
  id: "technology-research",
  name: "Technology Stack Research",
  description: "Research technology options and provide structured recommendation",
  userRequest:
    "I need to choose between PostgreSQL with TimescaleDB extension and ClickHouse for a time-series analytics platform handling 100K events/second. Research both options' scalability, query performance, operational complexity, and community support. Provide a decision matrix and final recommendation.",
  expectedSkills: ["search", "browser", "file"],
  expectedMinTasks: 3,
  expectedMaxTasks: 5,
  requiresSearch: true,
  complexity: "complex",
  category: "analysis",
};

/**
 * Scenario 5: Dynamic Failure Recovery
 * Test the system's ability to recover from partial failures.
 */
const scenarioDynamicRecovery: Scenario = {
  id: "dynamic-recovery",
  name: "Dynamic Failure Recovery",
  description: "Test the system's ability to recover from partial failures",
  userRequest:
    "Search for the latest stable version of three dependencies: Express.js, Zod, and Vitest. If any search fails, retry up to 2 times. If still failing, mark that dependency as 'skipped' and continue with the others. Generate a compatibility report for the successfully found versions.",
  expectedSkills: ["search", "code", "file"],
  expectedMinTasks: 4,
  expectedMaxTasks: 6,
  requiresSearch: true,
  complexity: "complex",
  category: "recovery",
};

/**
 * Scenario 6: Cross-Domain Synthesis
 * Complex multi-step task spanning research, coding, and documentation.
 */
const scenarioCrossDomainSynthesis: Scenario = {
  id: "cross-domain-synthesis",
  name: "Cross-Domain Synthesis",
  description:
    "Complex multi-step task spanning research, coding, and documentation",
  userRequest:
    "Research the latest TypeScript 5.5 features (特别是 type inference improvements 和 new utility types). Then create a demonstration project that showcases at least 3 of these features with practical examples. Finally, write a README.md explaining each feature and how the examples work.",
  expectedSkills: ["search", "browser", "code", "file"],
  expectedMinTasks: 5,
  expectedMaxTasks: 8,
  requiresSearch: true,
  expectedDependencies: [
    { from: "research", to: "code" },
    { from: "code", to: "document" },
  ],
  complexity: "complex",
  category: "synthesis",
};

/** All evaluation scenarios requiring search operations. */
export const SCENARIOS: Scenario[] = [
  scenarioMultiSourceResearch,
  scenarioCompetitiveAnalysis,
  scenarioCodebaseDiagnosis,
  scenarioTechnologyResearch,
  scenarioDynamicRecovery,
  scenarioCrossDomainSynthesis,
];

/**
 * Retrieve a scenario by its unique identifier.
 * @param id - The scenario id (kebab-case)
 * @returns The matching Scenario, or undefined if not found
 */
export function getScenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
