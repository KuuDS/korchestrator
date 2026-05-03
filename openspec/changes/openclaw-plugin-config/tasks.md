## 1. Setup

- [ ] 1.1 Create `src/config.ts` module file
- [ ] 1.2 Define Zod schema for full plugin configuration
- [ ] 1.3 Define TypeScript types inferred from Zod schema
- [ ] 1.4 Create `src/config-loader.ts` for file I/O and parsing
- [ ] 1.5 Add `chokidar` or `fs.watch` dependency for file watching

## 2. Zod Schema Validation

- [ ] 2.1 Define `plannerModel` validation (non-empty string)
- [ ] 2.2 Define `replannerModel` validation (non-empty string)
- [ ] 2.3 Define `maxConcurrency` validation (integer ≥ 1)
- [ ] 2.4 Define `maxStepsPerAgent` validation (integer ≥ 1)
- [ ] 2.5 Define `skipClassification` validation (boolean)
- [ ] 2.6 Define `classificationRules` validation (array of pattern/result pairs)
- [ ] 2.7 Define `metricsOutput` enum validation ("blackboard" | "webhook" | "otel" | "none")
- [ ] 2.8 Define conditional validation for `metricsWebhook` (required when metricsOutput="webhook")
- [ ] 2.9 Define conditional validation for `metricsOtelEndpoint` (required when metricsOutput="otel")
- [ ] 2.10 Define `agentRoles` validation (array of valid AgentRole objects)
- [ ] 2.11 Write unit tests for all validation rules (valid and invalid cases)

## 3. Lifecycle Hook Management

- [ ] 3.1 Implement `gateway_start` handler (priority 90) to load and validate config
- [ ] 3.2 Implement `gateway_stop` handler (priority 90) to save state and cleanup
- [ ] 3.3 Implement config caching mechanism for runtime access
- [ ] 3.4 Wire config module into plugin entry (`src/index.ts`)
- [ ] 3.5 Write unit tests for lifecycle hook behavior

## 4. Change Detection

- [ ] 4.1 Implement file watcher for `plugin.json`
- [ ] 4.2 Add debounce logic (300ms) to avoid rapid reloads
- [ ] 4.3 Implement `gateway_stop` → reload → `gateway_start` sequence on change
- [ ] 4.4 Ensure active Plans are preserved during reload
- [ ] 4.5 Write unit tests for change detection and reload sequence

## 5. Differentiated Reload

- [ ] 5.1 Implement config diffing to identify changed parameters
- [ ] 5.2 Implement immediate effect for `plannerModel` / `replannerModel` changes
- [ ] 5.3 Implement immediate effect for `maxConcurrency` changes (no interruption)
- [ ] 5.4 Implement immediate effect for `agentRoles` changes
- [ ] 5.5 Implement rule cache clear on `classificationRules` change
- [ ] 5.6 Implement immediate effect for `skipClassification` toggle
- [ ] 5.7 Write unit tests for each reload strategy

## 6. Error Handling & Fallback

- [ ] 6.1 Implement invalid config rejection with detailed error logging
- [ ] 6.2 Implement fallback to previous valid config on validation failure
- [ ] 6.3 Ensure plugin continues operation without interruption on bad config
- [ ] 6.4 Write unit tests for invalid config rejection and fallback behavior

## 7. Integration & Quality

- [ ] 7.1 Ensure all async operations have try/catch
- [ ] 7.2 Verify no `any` types in production code
- [ ] 7.3 Achieve >80% test coverage for config module
- [ ] 7.4 Add JSDoc comments for all public methods
- [ ] 7.5 Run TypeScript strict mode check
- [ ] 7.6 Document all configuration parameters in README
