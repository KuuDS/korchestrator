## 1. Setup

- [x] 1.1 Create `src/config.ts` module file
- [x] 1.2 Define Zod schema for full plugin configuration
- [x] 1.3 Define TypeScript types inferred from Zod schema
- [x] 1.4 Create `src/config-loader.ts` for file I/O and parsing
- [x] 1.5 Add `chokidar` or `fs.watch` dependency for file watching

## 2. Zod Schema Validation

- [x] 2.1 Define `plannerModel` validation (non-empty string)
- [x] 2.2 Define `replannerModel` validation (non-empty string)
- [x] 2.3 Define `maxConcurrency` validation (integer ≥ 1)
- [x] 2.4 Define `maxStepsPerAgent` validation (integer ≥ 1)
- [x] 2.5 Define `skipClassification` validation (boolean)
- [x] 2.6 Define `classificationRules` validation (array of pattern/result pairs)
- [x] 2.7 Define `metricsOutput` enum validation ("blackboard" | "webhook" | "otel" | "none")
- [x] 2.8 Define conditional validation for `metricsWebhook` (required when metricsOutput="webhook")
- [x] 2.9 Define conditional validation for `metricsOtelEndpoint` (required when metricsOutput="otel")
- [x] 2.10 Define `agentRoles` validation (array of valid AgentRole objects)
- [x] 2.11 Write unit tests for all validation rules (valid and invalid cases)

## 3. Lifecycle Hook Management

- [x] 3.1 Implement `gateway_start` handler (priority 90) to load and validate config
- [x] 3.2 Implement `gateway_stop` handler (priority 90) to save state and cleanup
- [x] 3.3 Implement config caching mechanism for runtime access
- [x] 3.4 Wire config module into plugin entry (`src/index.ts`)
- [x] 3.5 Write unit tests for lifecycle hook behavior

## 4. Change Detection

- [x] 4.1 Implement file watcher for `plugin.json`
- [x] 4.2 Add debounce logic (300ms) to avoid rapid reloads
- [x] 4.3 Implement `gateway_stop` → reload → `gateway_start` sequence on change
- [x] 4.4 Ensure active Plans are preserved during reload
- [x] 4.5 Write unit tests for change detection and reload sequence

## 5. Differentiated Reload

- [x] 5.1 Implement config diffing to identify changed parameters
- [x] 5.2 Implement immediate effect for `plannerModel` / `replannerModel` changes
- [x] 5.3 Implement immediate effect for `maxConcurrency` changes (no interruption)
- [x] 5.4 Implement immediate effect for `agentRoles` changes
- [x] 5.5 Implement rule cache clear on `classificationRules` change
- [x] 5.6 Implement immediate effect for `skipClassification` toggle
- [x] 5.7 Write unit tests for each reload strategy

## 6. Error Handling & Fallback

- [x] 6.1 Implement invalid config rejection with detailed error logging
- [x] 6.2 Implement fallback to previous valid config on validation failure
- [x] 6.3 Ensure plugin continues operation without interruption on bad config
- [x] 6.4 Write unit tests for invalid config rejection and fallback behavior

## 7. Integration & Quality

- [x] 7.1 Ensure all async operations have try/catch
- [x] 7.2 Verify no `any` types in production code
- [x] 7.3 Achieve >80% test coverage for config module
- [x] 7.4 Add JSDoc comments for all public methods
- [x] 7.5 Run TypeScript strict mode check
- [x] 7.6 Document all configuration parameters in README
