# OpenSpec Migration Strategy Recommendation

**Date:** 2026-05-02  
**Status:** Recommendation for Team Review  
**Options Evaluated:** Incremental Migration vs. One-Pass Migration  

---

## 1. Executive Recommendation

**Adopt Incremental Migration with a 4-phase rollout.**

While one-pass migration offers a clean cutover, the project's greenfield state (no existing source files) and the PRD's size (1626 lines, 5 functional modules) make incremental adoption lower-risk and higher-value. Each phase delivers independently testable artifacts.

---

## 2. Option Comparison

| Criteria | Incremental (Recommended) | One-Pass |
|----------|---------------------------|----------|
| **Risk** | Low — each module validated before next | High — all-or-nothing validation |
| **Time to Value** | Immediate — first spec usable in ~1 hour | Delayed — requires full migration before use |
| **Parallel Work** | Supported — team can work on different modules | Blocked — single workstream |
| **Validation Feedback** | Early and frequent — catch issues per module | Late — issues discovered at end |
| **Rollback Complexity** | Low — revert single module | High — revert entire migration |
| **Total Effort** | ~2-3 days (with validation tooling) | ~1-2 days (without validation) |
| **Traceability Setup** | Built incrementally | Must design upfront |
| **Tooling Integration** | Added as needed per phase | Must plan all tooling upfront |

---

## 3. Recommended Migration Phases

### Phase 1: Foundation (Day 1)

**Goal:** Establish OpenSpec infrastructure and migrate the most stable module.

**Deliverables:**
- [ ] Initialize OpenSpec: `openspec init`
- [ ] Create `openspec/config.yaml` with project context and rules
- [ ] Migrate **Planner module** (FR-PLAN-001~004) → `openspec/specs/planner/spec.md`
- [ ] Create `src/types.ts` with TypeScript interfaces derived from spec
- [ ] Define code annotation convention (e.g., `// @openspec-requirement: FR-PLAN-001`)
- [ ] Verify: All FR-PLAN-* IDs exist in spec and have code references

**Validation:**
```bash
openspec validate                    # Pass
scripts/validate-traceability.ts     # All FR-PLAN-* linked
tsc --noEmit                         # Types compile
```

**Risk:** Low. Planner module has well-defined boundaries and clear data structures.

---

### Phase 2: Core Modules (Day 2)

**Goal:** Migrate Task Router and Build Execution modules.

**Deliverables:**
- [ ] Migrate **Task Router** (FR-TASK-001~004) → `openspec/specs/task/spec.md`
- [ ] Migrate **Build Execution** (FR-BUILD-001~005) → `openspec/specs/build/spec.md`
- [ ] Create `src/planner.ts`, `src/router.ts`, `src/replanner.ts` stub implementations
- [ ] Add JSDoc annotations linking methods to spec requirements
- [ ] Build `scripts/validate-traceability.ts` (automated FR-* coverage check)

**Validation:**
```bash
openspec validate                    # Pass
scripts/validate-traceability.ts     # All FR-PLAN/TASK/BUILD linked
vitest src/planner.test.ts           # Unit tests pass
vitest src/router.test.ts            # Unit tests pass
```

**Risk:** Medium. Build module has complex hook interactions; requires careful scenario mapping.

---

### Phase 3: Observability & Config (Day 3)

**Goal:** Migrate Monitor and Config modules; complete tooling integration.

**Deliverables:**
- [ ] Migrate **Monitor** (FR-MON-001~003) → `openspec/specs/monitor/spec.md`
- [ ] Migrate **Config** (FR-CONFIG-001~004) → `openspec/specs/config/spec.md`
- [ ] Create `src/blackboard.ts`, `src/index.ts` with hook registrations
- [ ] Implement `scripts/validate-types.ts` (spec types ↔ code types parity)
- [ ] Add OpenSpec validation to CI pipeline (`.github/workflows/opencode.yml`)

**Validation:**
```bash
openspec validate                    # Pass
scripts/validate-traceability.ts     # All FR-* linked
scripts/validate-types.ts            # Type parity confirmed
npm run test                         # All tests pass
npm run lint                         # No lint errors
npm run typecheck                    # TypeScript strict mode passes
```

**Risk:** Low. These modules are well-scoped with clear configuration boundaries.

---

### Phase 4: Integration & Archive (Day 4-5)

**Goal:** Full integration testing, documentation, and migration completion.

**Deliverables:**
- [ ] Create integration tests covering all spec scenarios
- [ ] Write `docs/openspec-usage-guide.md` for team onboarding
- [ ] Archive the migration as an OpenSpec change (meta-migration!)
- [ ] Mark original PRD as "archived — see openspec/specs/ for current specs"
- [ ] Set up pre-commit hook for spec validation

**Validation:**
```bash
npm run test:integration             # All 7 integration scenarios pass
openspec list                        # No active changes (clean state)
```

**Risk:** Low. Integration tests validate end-to-end behavior against specs.

---

## 4. Rollback Plan

| Scenario | Rollback Action |
|----------|----------------|
| Phase 1 failure | Delete `openspec/` directory; revert to PRD-only |
| Phase 2 failure | Remove task/ build specs; keep planner spec |
| Phase 3 failure | Remove monitor/ config specs; keep core modules |
| TypeScript type mismatch | Update spec OR update code; spec is source of truth |
| CI validation failure | Fix spec format or update validation script |

---

## 5. Tooling Integration Roadmap

| Phase | Tooling Addition | Purpose |
|-------|-----------------|---------|
| 1 | `openspec validate` | Spec format validation |
| 1 | `scripts/validate-traceability.ts` | FR-* → code coverage check |
| 2 | `scripts/validate-types.ts` | Spec types ↔ code types parity |
| 2 | VS Code snippets | Auto-generate Requirement/Scenario templates |
| 3 | CI integration | Block PRs with unlinked FR-* IDs |
| 3 | `openspec view` | Interactive spec dashboard |
| 4 | Pre-commit hooks | Validate specs before commit |
| 4 | Custom docs generator | Generate markdown docs from specs |

---

## 6. Success Criteria

- [ ] All 16 FR-* requirement IDs from PRD exist in `openspec/specs/**/*.md`
- [ ] Every FR-* ID has at least one code reference (JSDoc or comment)
- [ ] All scenarios are testable (unit or integration tests exist)
- [ ] `npm run typecheck` passes with TypeScript strict mode
- [ ] `scripts/validate-traceability.ts` reports 100% coverage
- [ ] Original PRD is marked archived with pointer to OpenSpec specs
- [ ] Team can create new changes using `opsx:propose` workflow

---

## 7. One-Pass Alternative (If Team Prefers)

If the team prefers a single migration event:

1. **Day 1:** One developer migrates all 5 modules in a feature branch
2. **Day 2:** Team review of all specs for accuracy and completeness
3. **Day 3:** Merge to main; update CI; archive PRD

**Trade-offs:**
- Faster calendar time (3 days vs. 5 days)
- Higher risk of errors going undetected
- No early validation feedback
- Requires dedicated focus from one team member

---

## 8. Conclusion

**Incremental migration is recommended** due to:
1. Lower risk per phase
2. Early validation feedback
3. Parallel team contribution possible
4. Easier rollback if issues arise
5. Builds team familiarity with OpenSpec gradually

The migration will result in:
- **Behavior specs:** `openspec/specs/` (source of truth for requirements)
- **Technical design:** `openspec/changes/*/design.md` (architecture decisions)
- **Implementation:** `src/` (code with traceability annotations)
- **Validation:** Custom scripts + CI integration (ensures spec-code alignment)
