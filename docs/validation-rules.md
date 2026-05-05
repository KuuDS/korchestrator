# Validation Rules Framework

The Validation Rules Framework provides automated quality checks for Plan generation and Task-Agent routing in the korchestrator plugin.

## Overview

The framework integrates with OpenClaw's hook system to validate:

- **Plan Structure**: Ensures plans have required fields and valid dependency graphs
- **Task Granularity**: Checks task descriptions for reasonable size and complexity
- **Circular Dependencies**: Detects cycles in task dependency graphs
- **Agent Capability Matching**: Verifies agents have required skills for assigned tasks
- **Load Balancing**: Prevents overloading agents with too many concurrent tasks
- **Priority Alignment**: Warns when high-priority tasks go to low-priority agents

## Architecture

```
ValidationFramework
├── RuleRegistry      # Manages rule registration/unregistration
├── RuleExecutor      # Executes rules with timeout protection
├── ValidationHistoryRecorder   # Records validation results
├── ValidationStatsCollector    # Aggregates statistics
└── ValidationHistoryCleaner    # Cleans up old records
```

## Hook Integration

The framework registers two validation hooks:

- **`before_agent_reply` (priority 75)**: Validates plan structure before execution
- **`subagent_delivery_target` (priority 65)**: Validates task-agent compatibility before routing

## Default Rules

| Rule ID | Name | Strategy | Priority | Description |
|---------|------|----------|----------|-------------|
| `plan-structure` | Plan Structure Validator | block | 100 | Validates required plan fields |
| `no-circular-dep` | Circular Dependency Validator | block | 90 | Detects dependency cycles |
| `task-granularity` | Task Granularity Validator | warn | 50 | Checks task description size |
| `timeout-constraint` | Timeout Constraint Validator | warn | 40 | Validates timeout configuration |
| `agent-capability-match` | Agent Capability Matcher | block | 100 | Checks skill coverage |
| `agent-load-balancer` | Agent Load Balancer | block | 90 | Checks agent concurrency |
| `priority-alignment` | Priority Alignment Validator | warn | 80 | Warns on priority mismatches |

## API

### Registering Custom Rules

```typescript
import { registerValidationRule } from "openclaw-plugin-plan-subagent";

const handle = registerValidationRule({
  id: "my-custom-rule",
  name: "My Custom Rule",
  description: "Validates custom business logic",
  priority: 100,
  strategy: "warn",
  enabled: true,
  execute: (context) => {
    // Validation logic
    return { passed: true, ruleId: "my-custom-rule" };
  }
});
```

### Validating Plans

```typescript
import { validatePlan } from "openclaw-plugin-plan-subagent";

const result = await validatePlan(session, plan);
if (!result.valid) {
  console.log("Validation failures:", result.results);
}
```

### Validating Task-Agent Matches

```typescript
import { validateTaskMatch } from "openclaw-plugin-plan-subagent";

const result = await validateTaskMatch(session, task, agent, plan);
if (!result.valid) {
  console.log("Match failures:", result.results);
}
```

### Configuration

The framework can be configured via the `ValidationConfig`:

```typescript
{
  defaultTimeoutMs: 5000,    // Default rule execution timeout
  skipValidation: false,     // Emergency switch to disable all validation
  retention: {
    maxAge: "7d",           // Maximum age of history records
    maxRecords: 1000        // Maximum number of records to keep
  },
  disabledRules: []         // IDs of rules to disable
}
```

## Persistence

Validation results are automatically persisted to the session's `validation_state` extension. This enables:

- Cross-turn validation history
- Statistical analysis of rule effectiveness
- Debugging and auditing

### Accessing Statistics

```typescript
const framework = getValidationFramework();
const stats = framework.getStats(sessionId);
console.log(`Validation success rate: ${stats.passed / stats.total * 100}%`);
```

## Testing

Run validation tests:

```bash
npx vitest run tests/validation
```

All 156 validation tests should pass.
