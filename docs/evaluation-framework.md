# Orchestration Evaluation Framework

## 1. Purpose

This evaluation framework exists to **quantitatively measure the orchestration capabilities** of the Plan-Subagent plugin. Rather than relying on subjective impressions, it provides a structured, repeatable scoring system across seven key dimensions of orchestration quality.

The framework serves three primary goals:

- **Track improvement**: Measure whether code changes improve or regress orchestration quality.
- **Prevent regressions**: Catch quality drops before they reach production.
- **Provide diagnostic data**: Identify which dimensions need attention when scores are low.

The framework is designed for both **CI/CD integration** (fast, deterministic, mock-based) and **quality assessment** (slower, real LLM-based).

---

## 2. Evaluation Dimensions

The framework scores orchestration quality across **7 dimensions**, totaling a 100-point scale.

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Planning Quality** | 30% | Quality of task decomposition, correctness of dependencies, appropriate task granularity |
| **Routing Accuracy** | 20% | Correctness of skill-to-agent matching — are the right subagents assigned to the right tasks? |
| **Parallel Efficiency** | 15% | Effective use of concurrency — how well independent tasks are executed in parallel |
| **Dependency Handling** | 10% | Validity of the task DAG, correctness of topological ordering and execution sequence |
| **Replanning** | 10% | Detection of failures, selection of appropriate recovery strategies, successful adaptation |
| **Result Aggregation** | 10% | Completeness of final output, quality of synthesis from sub-results |
| **Tool Usage** | 5% | Effective utilization of search tools, diversity of skills employed across tasks |

### 2.1 Dimension Details

#### Planning Quality (30 points)

Scored based on:

| Criterion | Points |
|-----------|--------|
| Tasks are logically decomposed with clear boundaries | 0–10 |
| Dependencies correctly reflect data/control flow between tasks | 0–10 |
| Granularity is appropriate — neither too coarse nor too fine | 0–10 |

#### Routing Accuracy (20 points)

Scored based on:

| Criterion | Points |
|-----------|--------|
| Each task is assigned to a subagent with matching skills | 0–10 |
| Skill diversity is appropriate for the scenario | 0–10 |

#### Parallel Efficiency (15 points)

Scored based on:

| Criterion | Points |
|-----------|--------|
| Independent tasks are identified and executed concurrently | 0–8 |
| Parallel execution actually reduces wall-clock time | 0–7 |

#### Dependency Handling (10 points)

Scored based on:

| Criterion | Points |
|-----------|--------|
| Task DAG has no cycles and valid topological order | 0–5 |
| Execution respects dependency constraints (no premature execution) | 0–5 |

#### Replanning (10 points)

Scored based on:

| Criterion | Points |
|-----------|--------|
| Failures are detected promptly during execution | 0–5 |
| Recovery strategy is selected and successfully applied | 0–5 |

#### Result Aggregation (10 points)

Scored based on:

| Criterion | Points |
|-----------|--------|
| Final output includes all expected results from sub-tasks | 0–5 |
| Synthesis is coherent and useful (not just concatenation) | 0–5 |

#### Tool Usage (5 points)

Scored based on:

| Criterion | Points |
|-----------|--------|
| Search/research tools are used when appropriate | 0–3 |
| A diverse set of skills is exercised across the scenario | 0–2 |

---

## 3. Scoring Methodology

### 3.1 Weighted Average

Each dimension is scored on a **0–100** scale, then multiplied by its weight to produce a weighted score. The weighted scores are summed to produce the **final score** (0–100).

```
Final Score = Σ(dimension_score × dimension_weight)
```

Example:

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Planning Quality | 85 | 0.30 | 25.5 |
| Routing Accuracy | 90 | 0.20 | 18.0 |
| Parallel Efficiency | 70 | 0.15 | 10.5 |
| Dependency Handling | 95 | 0.10 | 9.5 |
| Replanning | 60 | 0.10 | 6.0 |
| Result Aggregation | 80 | 0.10 | 8.0 |
| Tool Usage | 75 | 0.05 | 3.75 |
| **Final Score** | | | **81.25** |

### 3.2 Grading Scale

| Grade | Score Range | Interpretation |
|-------|-------------|----------------|
| **A** | 90–100 | Excellent orchestration — minimal room for improvement |
| **B** | 80–89 | Good orchestration — minor weaknesses, production-ready |
| **C** | 70–79 | Acceptable orchestration — functional but has notable gaps |
| **D** | 60–69 | Poor orchestration — significant issues, not recommended for production |
| **F** | <60 | Failed — orchestration breaks down; requires substantial rework |

---

## 4. Test Scenarios

The framework includes **6 complex scenarios** designed to stress different aspects of the orchestration pipeline.

### 4.1 Scenario: Multi-Source Information Aggregation

**What it tests:**

The ability to gather information from multiple independent sources and combine them into a unified, synthesized answer.

**Expected orchestration behavior:**

- Decomposes the request into 3–5 parallel information-gathering tasks (web search, documentation lookup, API reference)
- Each task targets a different source
- A final aggregation task depends on all gatherers completing
- Uses a `BrowserOperator` or `Researcher` subagent for web sources

**Key metrics evaluated:**

| Dimension | Focus |
|-----------|-------|
| Planning Quality | Correct decomposition into parallel gather + single aggregate |
| Parallel Efficiency | All gather tasks should run concurrently |
| Dependency Handling | Aggregate task must wait for all gatherers |
| Result Aggregation | Synthesis quality of combined information |

---

### 4.2 Scenario: Competitive Technology Analysis

**What it tests:**

Researching and comparing multiple competing technologies, producing a structured comparison with trade-off analysis.

**Expected orchestration behavior:**

- Creates parallel research tasks — one per technology
- Each task produces structured data (features, pros, cons, benchmarks)
- A comparison task synthesizes results into a ranked or tabular format
- May involve `Researcher` and `Reviewer` subagents

**Key metrics evaluated:**

| Dimension | Focus |
|-----------|-------|
| Routing Accuracy | Right subagents for research vs. synthesis |
| Planning Quality | Balanced decomposition across technologies |
| Tool Usage | Effective use of search and comparison tools |

---

### 4.3 Scenario: Codebase Diagnosis and Refactoring

**What it tests:**

Analyzing a codebase to identify issues, then planning and executing refactoring tasks with dependencies between analysis and fix application.

**Expected orchestration behavior:**

- Analysis tasks scan codebase for patterns, anti-patterns, or errors
- Refactoring tasks depend on analysis outputs
- Some refactorings may depend on others (e.g., rename before move)
- Uses `Coder` subagent with file-system and AST tools

**Key metrics evaluated:**

| Dimension | Focus |
|-----------|-------|
| Dependency Handling | Correct DAG for analysis → diagnosis → refactoring chain |
| Planning Quality | Granularity: separate tasks for scanning, diagnosing, fixing |
| Replanning | If a refactoring fails (e.g., merge conflict), recovery strategy |

---

### 4.4 Scenario: Technology Stack Research

**What it tests:**

Deep-dive research into a technology stack: front-end framework, back-end runtime, database, deployment platform, and monitoring tools.

**Expected orchestration behavior:**

- Decomposes by stack layer (frontend, backend, data, deploy, observability)
- Tasks are mostly independent and can run in parallel
- Final task produces a coherent recommendation document
- Involves `Researcher` and `BrowserOperator` subagents

**Key metrics evaluated:**

| Dimension | Focus |
|-----------|-------|
| Parallel Efficiency | Stack layers are independent and should parallelize |
| Planning Quality | Clear separation of concerns per layer |
| Tool Usage | Diverse tools across layers |

---

### 4.5 Scenario: Dynamic Failure Recovery

**What it tests:**

The orchestrator's ability to detect subagent failures, diagnose root causes, and replan to recover without aborting the entire workflow.

**Expected orchestration behavior:**

- A task is injected with a simulated failure (e.g., tool timeout, invalid output)
- Orchestrator detects failure, analyzes cause, and selects retry / fallback / decomposition strategy
- Remaining tasks continue or are adjusted based on recovery outcome
- `Replanner` module is exercised

**Key metrics evaluated:**

| Dimension | Focus |
|-----------|-------|
| Replanning | Failure detection speed, recovery strategy quality |
| Dependency Handling | Adjusted DAG after recovery |
| Result Aggregation | Final output completeness despite partial failure |

---

### 4.6 Scenario: Cross-Domain Synthesis

**What it tests:**

Synthesizing results from tasks spanning multiple domains (e.g., legal analysis + technical feasibility + market research) into a single coherent deliverable.

**Expected orchestration behavior:**

- Domain-specific tasks run in parallel with different subagent specializations
- A synthesis task requires all domain outputs
- Final output bridges domain boundaries with unified narrative
- Uses `Researcher`, `Coder`, and `Reviewer` subagents

**Key metrics evaluated:**

| Dimension | Focus |
|-----------|-------|
| Routing Accuracy | Correct subagent per domain |
| Result Aggregation | Cross-domain synthesis quality |
| Planning Quality | Domain decomposition and dependency structure |

---

## 5. Running the Evaluation

### 5.1 Mock Mode (Fast, Deterministic)

Mock mode uses pre-recorded or synthetic task outputs. It is designed for **CI/CD** where speed and determinism matter more than absolute quality assessment.

```bash
# Via npm script (recommended)
npm run eval

# Or directly with tsx
tsx scripts/run-evaluation.ts
```

Mock mode completes in **under 30 seconds** and produces deterministic scores.

### 5.2 Live Mode (Real LLM)

Live mode invokes the actual LLM backend and subagents. It is slower but provides a **realistic quality assessment**.

```bash
# Run all scenarios with real LLM calls
tsx scripts/run-evaluation.ts --live
```

Live mode may take **2–10 minutes** depending on the LLM backend and scenario complexity.

### 5.3 Running a Subset

To evaluate only specific scenarios (useful for debugging or targeted regression testing):

```bash
# Run only specific scenario(s) by ID
tsx scripts/run-evaluation.ts --scenarios multi-source,competitive-analysis

# Can be combined with --live
tsx scripts/run-evaluation.ts --live --scenarios failure-recovery
```

### 5.4 Command-Line Options

| Flag | Description |
|------|-------------|
| `--live` | Use real LLM calls instead of mocks |
| `--scenarios <ids>` | Comma-separated list of scenario IDs to run |
| `--output <path>` | Write the JSON report to a specific file path |
| `--verbose` | Print detailed per-task execution logs |

---

## 6. Interpreting Results

### 6.1 What Each Score Means

| Score | Meaning |
|-------|---------|
| **90–100 (A)** | Orchestration is excellent. The planner decomposes well, routes correctly, and handles failures gracefully. Minor polish only. |
| **80–89 (B)** | Orchestration is good and production-viable. One or two dimensions may have room for improvement, but overall behavior is solid. |
| **70–79 (C)** | Orchestration works but has clear weaknesses. Some scenarios may produce suboptimal plans or miss opportunities for parallelism. |
| **60–69 (D)** | Orchestration has significant flaws. Plans may be poorly structured, routing may be inaccurate, or failures may cascade. |
| **<60 (F)** | Orchestration breaks down. The system cannot reliably complete complex multi-step workflows. Major rework required. |

### 6.2 When Is Orchestration "Good Enough"?

A score of **≥70 (C or above)** is considered the minimum threshold for production use. This ensures:

- Task decomposition is functional
- Routing produces correct assignments
- Dependencies are respected
- Failures are handled without total collapse

A score of **≥80 (B or above)** is recommended before tagging a release.

### 6.3 How to Improve Weak Dimensions

| Weak Dimension | Likely Cause | Remediation |
|----------------|--------------|-------------|
| **Planning Quality** | Prompt engineering for decomposition; planner model too small | Improve planner prompt; consider larger model or few-shot examples |
| **Routing Accuracy** | Skill definitions are vague or overlap | Tighten skill definitions; add routing examples to prompt |
| **Parallel Efficiency** | Planner marks too many dependencies | Review dependency detection logic; distinguish data vs. control dependencies |
| **Dependency Handling** | DAG construction has bugs | Add DAG validation; test cycle detection |
| **Replanning** | Failure signals not propagated; recovery strategies too rigid | Improve error interception; add fallback strategy library |
| **Result Aggregation** | Synthesis prompt is too generic | Add structured synthesis prompt with output schema |
| **Tool Usage** | Subagents not instructed to use tools | Add explicit tool-use instructions to subagent prompts |

---

## 7. Report Format

### 7.1 Example Report Structure

```
╔════════════════════════════════════════════════════════════════╗
║         ORCHESTRATION EVALUATION REPORT                        ║
║         Generated: 2024-05-05T12:34:56Z                        ║
║         Mode: mock                                             ║
╚════════════════════════════════════════════════════════════════╝

┌────────────────────────────────────────────────────────────────┐
│ EXECUTIVE SUMMARY                                               │
├────────────────────────────────────────────────────────────────┤
│ Final Score: 81.25 / 100                                        │
│ Grade: B                                                        │
│ Scenarios Run: 6 / 6                                            │
│ Duration: 18.4s                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ DIMENSION BREAKDOWN                                             │
├──────────────────────┬───────┬────────┬────────────────────────┤
│ Dimension            │ Score │ Weight │ Weighted               │
├──────────────────────┼───────┼────────┼────────────────────────┤
│ Planning Quality     │  85.0 │  0.30  │ 25.50                  │
│ Routing Accuracy     │  90.0 │  0.20  │ 18.00                  │
│ Parallel Efficiency  │  70.0 │  0.15  │ 10.50                  │
│ Dependency Handling  │  95.0 │  0.10  │  9.50                  │
│ Replanning           │  60.0 │  0.10  │  6.00                  │
│ Result Aggregation   │  80.0 │  0.10  │  8.00                  │
│ Tool Usage           │  75.0 │  0.05  │  3.75                  │
├──────────────────────┼───────┼────────┼────────────────────────┤
│ TOTAL                │       │  1.00  │ 81.25                  │
└──────────────────────┴───────┴────────┴────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ SCENARIO DETAILS                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. Multi-Source Information Aggregation                         │
│    Score: 88.5   Grade: B   Duration: 2.1s                     │
│    Notes: Good parallelization; synthesis slightly verbose.     │
│                                                                 │
│ 2. Competitive Technology Analysis                              │
│    Score: 92.0   Grade: A   Duration: 2.8s                     │
│    Notes: Excellent routing and comparison structure.           │
│                                                                 │
│ 3. Codebase Diagnosis and Refactoring                           │
│    Score: 76.0   Grade: C   Duration: 3.4s                     │
│    Notes: Dependency chain correct, but replanning not tested.  │
│                                                                 │
│ 4. Technology Stack Research                                    │
│    Score: 85.0   Grade: B   Duration: 2.6s                     │
│    Notes: Strong parallelization across stack layers.           │
│                                                                 │
│ 5. Dynamic Failure Recovery                                     │
│    Score: 62.0   Grade: D   Duration: 4.2s                     │
│    Notes: Failure detected, but recovery strategy was suboptimal│
│                                                                 │
│ 6. Cross-Domain Synthesis                                       │
│    Score: 83.5   Grade: B   Duration: 3.3s                     │
│    Notes: Good cross-domain routing; synthesis could be deeper. │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ RECOMMENDATIONS                                                 │
├────────────────────────────────────────────────────────────────┤
│ 1. Improve Replanning: Current recovery strategies are too      │
│    conservative. Consider adding a "decompose and retry"        │
│    strategy for large failed tasks.                             │
│                                                                 │
│ 2. Improve Parallel Efficiency: Some scenarios still serialize │
│    independent tasks. Review dependency detection to ensure     │
│    data-only dependencies are not blocking execution.           │
│                                                                 │
│ 3. Improve Tool Usage: BrowserOperator underutilized in two    │
│    scenarios. Add tool-use reminders to subagent prompts.       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 7.2 Report Sections

#### Executive Summary

Provides the top-level score, grade, scenario count, and total runtime at a glance. This is the section CI systems should check for pass/fail.

#### Dimension Breakdown

A table showing each dimension's raw score, weight, and weighted contribution. This makes it easy to see which dimensions dragged the score down.

#### Scenario Details

Per-scenario scores, grades, durations, and qualitative notes. Useful for debugging: if the overall score is low, this section identifies which scenarios failed and why.

#### Recommendations

Actionable suggestions for improving the weakest dimensions. These are generated automatically based on score thresholds and scenario notes.

---

## 8. Integration with CI/CD

### 8.1 GitHub Actions Workflow

Add the following step to your GitHub Actions workflow:

```yaml
- name: Run Orchestration Evaluation
  run: npm run eval
```

For a complete workflow that archives reports:

```yaml
name: Orchestration Evaluation

on:
  push:
    branches: [main]
  pull_request:

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Build plugin
        run: npm run build

      - name: Run evaluation
        run: npm run eval -- --output eval-report.json

      - name: Archive evaluation report
        uses: actions/upload-artifact@v4
        with:
          name: orchestration-eval-report
          path: eval-report.json
```

### 8.2 Exit Codes

The evaluation script uses the following exit codes:

| Exit Code | Meaning |
|-----------|---------|
| **0** | Pass — final score is ≥70 (C or above) |
| **1** | Fail — final score is <70 (D or F) |
| **2** | Error — evaluation could not complete (runtime exception, missing config, etc.) |

CI pipelines should treat exit code `1` as a test failure and exit code `2` as a build error.

### 8.3 Archiving Reports as Artifacts

The `--output` flag writes the full JSON report to disk, which can then be archived:

```bash
npm run eval -- --output reports/eval-$(date +%Y%m%d-%H%M%S).json
```

In GitHub Actions, use `actions/upload-artifact` to persist reports:

```yaml
- name: Archive evaluation report
  uses: actions/upload-artifact@v4
  with:
    name: eval-report-${{ github.run_id }}
    path: reports/eval-*.json
    retention-days: 30
```

For historical tracking, consider uploading reports to an external dashboard or S3 bucket:

```bash
aws s3 cp reports/eval-*.json s3://my-bucket/eval-reports/
```

### 8.4 Failing the Build on Score Regression

To fail the build if the score drops below a specific threshold (e.g., 75), add a check step:

```yaml
- name: Check score threshold
  run: |
    SCORE=$(jq '.finalScore' eval-report.json)
    if (( $(echo "$SCORE < 75" | bc -l) )); then
      echo "Score $SCORE is below threshold 75"
      exit 1
    fi
```

Or use the built-in exit code behavior (threshold is 70 by default).

---

## Appendix: Scenario ID Reference

| Scenario Name | ID |
|---------------|-----|
| Multi-Source Information Aggregation | `multi-source` |
| Competitive Technology Analysis | `competitive-analysis` |
| Codebase Diagnosis and Refactoring | `codebase-refactor` |
| Technology Stack Research | `stack-research` |
| Dynamic Failure Recovery | `failure-recovery` |
| Cross-Domain Synthesis | `cross-domain` |

---

*This document is maintained alongside the Plan-Subagent plugin. Update it when new scenarios are added or dimension weights are adjusted.*
