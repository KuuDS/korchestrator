# korchestrator — Configuration Reference

This document describes all configuration parameters for the `openclaw-plugin-plan-subagent` plugin.

## Requirement Traceability

This project uses JSDoc annotations to trace code back to OpenSpec requirements.

### Annotation Conventions

Use `@implements {FR-XXX-NNN}` in source files to mark that a function, class, or module implements a specific requirement:

```typescript
/**
 * Classifies user requests by complexity.
 * @implements {FR-PLAN-001}
 */
export async function classify(request: string): Promise<"simple" | "complex"> {
  // ...
}
```

Use `@satisfies {FR-XXX-NNN}` in test files to mark that a test verifies a requirement:

```typescript
/**
 * @satisfies {FR-BUILD-003a}
 */
it("should retry failed tasks", () => {
  // ...
});
```

You may include multiple annotations in a single JSDoc block:

```typescript
/**
 * @implements {FR-PLAN-001}
 * @implements {FR-PLAN-002}
 */
export class Planner { /* ... */ }
```

Cross-references to the PRD are optional and use `@see`:

```typescript
/**
 * @implements {FR-PLAN-001}
 * @see docs/openclaw-plan-task-build-prd.md#FR-PLAN-001
 */
```

### Running Locally

Validate traceability from the project root:

```bash
npm run validate:traceability
```

For JSON output (useful for CI or programmatic consumption):

```bash
npm run validate:traceability -- --format json
```

For verbose per-file scanning output:

```bash
npm run validate:traceability -- --verbose
```

To check only files modified since a specific date:

```bash
npm run validate:traceability -- --since 2024-01-01
```

### CI Integration

The traceability validator runs automatically in the CI pipeline via `.github/workflows/opencode.yml`. The CI step:

1. Runs `npm run validate:traceability -- --format json`
2. Uploads the JSON report as an artifact named `traceability-report`
3. Fails the build if any requirement is uncovered or any annotation is orphaned

Exit codes:
- `0` — all requirements covered, no orphaned annotations
- `1` — uncovered requirements, orphaned annotations, or malformed annotations found

## Configuration File

The plugin reads its configuration from `plugin.json` in the project root (or the path specified by `configPath` in the hook context).

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `plannerModel` | `string` | `"gpt-4o-mini"` | LLM model used for plan generation and complexity classification. |
| `replannerModel` | `string` | `"gpt-4o-mini"` | LLM model used for replanning decisions when tasks fail. |
| `maxConcurrency` | `integer` | `3` | Maximum number of subagent executions that can run concurrently. Must be ≥ 1. |
| `maxStepsPerAgent` | `integer` | `20` | Maximum steps a single subagent may take before forced termination. Must be ≥ 1. |
| `skipClassification` | `boolean` | `false` | When `true`, bypasses the L1 rule-based complexity classification and treats all requests as complex. |
| `classificationRules` | `ClassificationRule[]` | See below | Array of regex patterns for fast L1 classification. Each rule has `pattern` (regex string) and `result` (`"simple"` or `"complex"`). |
| `metricsOutput` | `"blackboard" \| "webhook" \| "otel" \| "none"` | `"blackboard"` | Destination for execution metrics. |
| `metricsWebhook` | `string` (optional) | `""` | Required when `metricsOutput` is `"webhook"`. URL to POST metrics to. |
| `metricsOtelEndpoint` | `string` (optional) | `""` | Required when `metricsOutput` is `"otel"`. OpenTelemetry collector endpoint. |
| `agentRoles` | `AgentRole[]` | See below | Custom agent role definitions. Each role has `agentId`, `name`, `skills`, and `model`. |

### Default Classification Rules

```json
[
  { "pattern": "^(hello|hi|hey|你好|您好)", "result": "simple" },
  { "pattern": "^(what|who|when|where|为什么|什么是)", "result": "simple" },
  { "pattern": "^(explain|解释|说明).{0,50}$", "result": "simple" }
]
```

### Default Agent Roles

```json
[
  { "agentId": "researcher", "name": "Researcher", "skills": ["search", "browser"], "model": "gpt-4o-mini" },
  { "agentId": "coder",      "name": "Coder",      "skills": ["shell", "code", "file"], "model": "gpt-4o" },
  { "agentId": "browser",    "name": "BrowserOperator", "skills": ["browser"], "model": "gpt-4o-mini" },
  { "agentId": "reviewer",   "name": "Reviewer",   "skills": ["file", "code"], "model": "gpt-4o-mini" }
]
```

## Hot Reload

The plugin watches `plugin.json` for changes and reloads configuration without restarting the gateway. Changes take effect immediately for:

- `plannerModel` / `replannerModel`
- `maxConcurrency`
- `agentRoles`
- `skipClassification`

When `classificationRules` change, the rule cache is cleared automatically.

Active plans are preserved across reloads.

## Validation

All configuration is validated using Zod schemas before being applied. If a new config fails validation, the plugin retains the previous valid config and logs detailed error messages.
