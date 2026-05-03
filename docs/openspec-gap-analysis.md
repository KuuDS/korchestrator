# OpenSpec Gap Analysis

**Date:** 2026-05-02  
**PRD Reference:** `docs/openclaw-plan-task-build-prd.md` (1626 lines, 12 functional requirement sections)  
**OpenSpec Version:** @fission-ai/openspec (spec-driven schema)

---

## 1. Executive Summary

This document analyzes the gaps between the current PRD format and OpenSpec constructs. Overall, **~85% of PRD content maps cleanly to OpenSpec**, with the remaining 15% representing areas where OpenSpec's lightweight, behavior-first philosophy intentionally diverges from comprehensive technical specification.

| Category | PRD Lines | Expressible in OpenSpec? | Notes |
|----------|-----------|-------------------------|-------|
| Functional Requirements (FR-*) | ~400 | Yes | Maps to Requirements + Scenarios |
| Data Structures | ~100 | Partial | Schemas in spec; full TS types in code |
| Hook Mappings & Priorities | ~80 | Partial | Referenced in spec; detailed in design.md |
| Module Interfaces | ~200 | Partial | Public API in spec; implementation detail in code |
| Reference Implementation | ~850 | No | OpenSpec is behavior-spec only, no code |
| Test Strategy | ~200 | Partial | Test scenarios in spec; full strategy in design.md |
| Configuration Schema | ~50 | Yes | Maps to spec Configuration sections |
| Directory Structure | ~20 | No | Build artifact, not behavior spec |

---

## 2. Detailed Gap Analysis

### 2.1 Format Conversion Mapping

#### What Maps Well

| PRD Construct | OpenSpec Construct | Fidelity | Example |
|---------------|-------------------|----------|---------|
| FR-* requirement statements | `### Requirement:` heading | High | "The system SHALL classify..." |
| Happy path flows | `#### Scenario:` with GIVEN/WHEN/THEN | High | User request → classification → plan |
| Edge cases & failures | Additional Scenarios | High | LLM failure fallback, invalid JSON |
| Data structure definitions | Embedded TypeScript in spec | Medium | `interface Plan { ... }` |
| Configuration parameters | Configuration table in spec | High | `plannerModel`, `maxConcurrency` |
| Hook registrations | Hook reference table in spec | Medium | `before_agent_reply` (priority 80) |
| Error handling policies | Scenario assertions + spec notes | High | "Fallback to simple on failure" |

#### What Has Partial Mapping

| PRD Construct | OpenSpec Limitation | Workaround |
|---------------|-------------------|------------|
| Hook priority values | No native priority syntax | Add priority column to hook tables |
| Module method signatures | Too implementation-specific | Include in spec as "Data Structures" or move to design.md |
| Internal algorithm details (DAG validation, routing logic) | Outside OpenSpec scope | Document in `design.md` with reference to spec requirements |
| Zod validation schemas | TypeScript-specific | Include as embedded code blocks in spec or reference from code |
| Plugin.json schema | JSON-specific | Include as Configuration section with table |
| Test case matrices | Too verbose for spec | Reference key scenarios in spec; full matrices in design.md |

#### What Cannot Be Expressed

| PRD Construct | Why Not | Mitigation |
|---------------|---------|------------|
| Complete TypeScript implementation (~850 lines) | OpenSpec is spec-only, not code | Code lives in `src/`; spec references it |
| Build pipeline configuration | Not behavioral | Keep in `package.json`, CI configs |
| Import statements, internal utilities | Implementation detail | Code only |
| Test file structure | Organizational | Document in README or AGENTS.md |
| npm scripts, tsconfig settings | Tooling | Standard project files |
| Plugin SDK integration specifics | Framework-specific | Document in design.md |

### 2.2 Requirement Traceability

#### Bidirectional Links: PRD ↔ OpenSpec ↔ Code

**Current PRD traceability:**
- FR-PLAN-001 through FR-CONFIG-004 are explicitly numbered
- Each FR references specific hooks, data structures, and behaviors
- However, no explicit links to implementation files exist

**Proposed OpenSpec traceability model:**

```
OpenSpec Spec (openspec/specs/*/spec.md)
    │
    ├── Requirement: FR-PLAN-001
    │   ├── Scenario: Rule cache hit
    │   │   └── [Link: src/planner.ts:classify() L274-290]
    │   ├── Scenario: LLM classification
    │   │   └── [Link: src/planner.ts:classify() L274-290]
    │   └── Scenario: Classification failure fallback
    │       └── [Link: src/planner.ts:classify() L285-289]
    │
    └── Data Structure: Plan
        └── [Link: src/types.ts:interface Plan L252-259]
```

**Implementation via code annotations:**

```typescript
// src/planner.ts
// @openspec-requirement: FR-PLAN-001
// @openspec-scenario: L2-LLM-classification
async classify(request: string): Promise<"simple" | "complex"> {
  // ...
}
```

**Gap:** OpenSpec has no built-in requirement traceability feature. We must establish conventions:

1. **Spec-to-code links:** Use JSDoc tags or code comments referencing FR IDs
2. **Code-to-spec links:** Use `@openspec-requirement` annotations
3. **Validation tooling:** Custom script to verify all FR-* IDs have at least one code reference

### 2.3 Validation Capabilities

#### Can OpenSpec validate FR-* requirements have implementations?

**Direct answer: No, not automatically.**

OpenSpec validates:
- Spec format compliance (Requirements, Scenarios, Gherkin syntax)
- Schema structure (proposal → specs → design → tasks dependencies)
- Change delta consistency (ADDED/MODIFIED/REMOVED)

OpenSpec does **NOT** validate:
- Whether requirements are implemented in code
- Code coverage of scenarios
- Bidirectional traceability between specs and source

**Required additions for validation:**

| Validation Need | Solution | Effort |
|-----------------|----------|--------|
| All FR-* IDs exist in at least one spec | Custom linter script | Low |
| All FR-* IDs have code implementations | Static analysis + annotation scanning | Medium |
| Scenario coverage matches test coverage | Test runner integration | Medium |
| Data structures in spec match code types | TypeScript compiler API + comparison | High |
| Hook registrations match spec declarations | AST parsing + annotation check | High |

**Recommended validation toolchain:**

```
openspec validate                  # Validates spec format (built-in)
scripts/validate-traceability.ts   # Custom: FR-* coverage check
scripts/validate-types.ts          # Custom: Spec type ↔ code type parity
tsc --noEmit + eslint              # TypeScript validation
vitest --coverage                  # Test coverage validation
```

### 2.4 Tooling Gap

| PRD Need | OpenSpec Provides | Gap | Recommended Solution |
|----------|-------------------|-----|---------------------|
| Spec editing | Markdown, any editor | None | Use existing editors |
| Spec validation | `openspec validate` | Partial | Custom traceability scripts |
| TypeScript generation | None | Full gap | Write `scripts/spec-to-types.ts` |
| Test generation from specs | None | Full gap | Write `scripts/spec-to-tests.ts` |
| Documentation generation | None | Full gap | Use Docusaurus/MDX on openspec/specs |
| IDE integration | None | Full gap | VS Code extension for spec snippets |
| Change proposal workflow | `opsx:propose` | None | Built-in |
| Requirements traceability matrix | None | Full gap | Custom dashboard or markdown table |

---

## 3. Specific Gaps by Module

### 3.1 Planner Module (FR-PLAN-*)

| Gap | Severity | Description | Mitigation |
|-----|----------|-------------|------------|
| L1 rule cache implementation | Low | Regex matching logic is code-only | Spec covers behavior; code covers implementation |
| LLM prompt templates | Low | Prompt engineering detail | Move to `design.md` or code comments |
| JSON Schema validation (Zod) | Low | TypeScript-specific validation | Include Zod schemas as embedded code in spec |
| DAG validation algorithm | Low | Graph algorithm implementation | Spec states "SHALL validate as DAG"; code implements algorithm |
| Markdown serialization format | Low | `toMarkdown()` output format | Include example output in spec scenario |

### 3.2 Task Router Module (FR-TASK-*)

| Gap | Severity | Description | Mitigation |
|-----|----------|-------------|------------|
| Skill matching algorithm | Low | Exact → intersection → fallback logic | Spec describes behavior; code implements algorithm |
| Concurrency counting mechanism | Low | Active run tracking | Spec describes blocking behavior |
| Agent role default definitions | Low | Static role configuration | Include in spec Configuration section |

### 3.3 Build Module (FR-BUILD-*)

| Gap | Severity | Description | Mitigation |
|-----|----------|-------------|------------|
| Tool call interception mechanics | Low | OpenClaw SDK-specific hook behavior | Spec references hook by name; SDK docs cover mechanics |
| Blackboard file I/O | Low | File system operations | Spec covers "SHALL write to WORKSPACE/"; code covers `fs/promises` |
| Replanner LLM prompts | Low | Prompt engineering for repair decisions | Move to `design.md` |
| Approval callback mechanism | Low | OpenClaw `onResolution` API | Spec describes behavior; SDK docs cover API |

### 3.4 Monitor Module (FR-MON-*)

| Gap | Severity | Description | Mitigation |
|-----|----------|-------------|------------|
| Progress calculation | Low | `getProgress()` implementation | Spec describes what progress includes |
| Metrics serialization formats | Low | Blackboard vs webhook vs OTel | Include in spec Configuration section |

### 3.5 Config Module (FR-CONFIG-*)

| Gap | Severity | Description | Mitigation |
|-----|----------|-------------|------------|
| Hot-reload file watching | Low | File system watcher implementation | Spec describes behavior; code covers `fs.watch` or similar |
| Zod schema definition | Low | Validation schema code | Include in spec as embedded TypeScript |
| Gateway lifecycle integration | Low | OpenClaw-specific hook behavior | Spec references hooks; SDK docs cover behavior |

---

## 4. Summary of Non-Expressible Content

The following PRD content **cannot** be directly expressed in OpenSpec and must remain in complementary documents:

1. **Complete reference implementation** (Lines 441-1416)
   - All TypeScript source code
   - Import statements and module structure
   - Internal helper functions and utilities

2. **Build/tooling configuration**
   - `package.json` dependencies and scripts
   - `tsconfig.json` compiler options
   - `plugin.json` metadata (can be referenced, not replaced)

3. **Test implementation**
   - Test file contents
   - Mock implementations
   - Assertion details

4. **Project structure**
   - Directory layout
   - File naming conventions
   - Build output configuration

5. **OpenClaw SDK integration details**
   - Exact hook signatures
   - Event object structures
   - SDK-specific APIs (e.g., `event.context.sessions.pluginPatch`)

---

## 5. Recommendations

1. **Adopt OpenSpec for behavioral specs** — All FR-* requirements, scenarios, and acceptance criteria should live in `openspec/specs/`

2. **Maintain `design.md` for technical details** — Hook priorities, algorithm explanations, prompt templates, and SDK integration patterns belong in design artifacts

3. **Keep reference implementation in `src/`** — Code should reference specs via annotations, not duplicate them

4. **Build custom validation scripts** — Fill OpenSpec's traceability gap with project-specific tooling

5. **Use README/AGENTS.md for project meta** — Directory structure, build instructions, and conventions stay in traditional docs
