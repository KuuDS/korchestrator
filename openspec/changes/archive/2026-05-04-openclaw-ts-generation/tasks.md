## 1. Setup

- [x] 1.1 Create `src/codegen/` directory structure
- [x] 1.2 Create `scripts/validate-types.ts` entry point
- [x] 1.3 Add `zod` to devDependencies if not already present
- [x] 1.4 Add `npm run validate-types` script to package.json
- [x] 1.5 Create `src/generated/` directory for output files

## 2. Spec Parser

- [x] 2.1 Implement `parseSpecFile(filePath: string): SpecDefinition[]` — read markdown and extract interface blocks
- [x] 2.2 Implement `extractInterfaces(content: string): InterfaceDef[]` — parse TypeScript code blocks from specs
- [x] 2.3 Implement `extractScenarios(content: string): ScenarioDef[]` — parse scenario blocks for test case generation
- [x] 2.4 Add support for string literal union type detection
- [x] 2.5 Add support for optional property detection (`?:` syntax)
- [x] 2.6 Add support for array type detection (`[]` syntax)

## 3. TypeScript Transpiler

- [x] 3.1 Implement `transpileToTypeScript(interfaces: InterfaceDef[]): string` — generate `.ts` file content
- [x] 3.2 Generate `export interface` declarations with JSDoc comments
- [x] 3.3 Handle interface dependencies and emit in topological order
- [x] 3.4 Preserve string literal unions as TypeScript union types
- [x] 3.5 Write output to `src/generated/types.ts`
- [x] 3.6 Add auto-generated header comment to output files

## 4. Zod Schema Generator

- [x] 4.1 Implement `generateZodSchemas(interfaces: InterfaceDef[]): string` — generate Zod schema file content
- [x] 4.2 Map TypeScript primitive types to Zod validators (`string` → `z.string()`, `number` → `z.number()`)
- [x] 4.3 Map string literal unions to `z.enum()` or `z.literal()` unions
- [x] 4.4 Map optional properties to `z.optional()`
- [x] 4.5 Map array properties to `z.array()`
- [x] 4.6 Write output to `src/generated/schemas.ts`
- [x] 4.7 Export schemas with matching names to interfaces (e.g., `TaskSchema` for `Task` interface)

## 5. Type Parity Validator

- [x] 5.1 Implement `validateParity(specs: SpecDefinition[], generated: GeneratedFile[]): ValidationResult`
- [x] 5.2 Compare interface names between specs and generated files
- [x] 5.3 Compare property names and types for each interface
- [x] 5.4 Compare property optionality (required vs optional)
- [x] 5.5 Report errors with file paths and line numbers
- [x] 5.6 Exit with code 0 on success, non-zero on failure

## 6. CLI and Integration

- [x] 6.1 Implement CLI argument parsing (`--generate`, `--validate`, `--watch`)
- [x] 6.2 Implement `--generate` flag to regenerate all types
- [x] 6.3 Implement default mode (validate existing generated files)
- [x] 6.4 Implement `--watch` mode with file system watcher
- [ ] 6.5 Add `validate-types.ts` to CI pipeline
- [x] 6.6 Ensure generated files are included in TypeScript compilation

## 7. Testing

- [x] 7.1 Create `tests/codegen/parser.test.ts` — test spec markdown parsing
- [x] 7.2 Create `tests/codegen/transpiler.test.ts` — test TypeScript generation
- [x] 7.3 Create `tests/codegen/zod-generator.test.ts` — test Zod schema generation
- [x] 7.4 Create `tests/codegen/validator.test.ts` — test parity validation
- [x] 7.5 Add integration test: full pipeline from spec to generated types
- [x] 7.6 Ensure >80% test coverage for codegen module

## 8. Documentation

- [ ] 8.1 Document the code generation workflow in README.md
- [x] 8.2 Add JSDoc comments to all public codegen functions
- [ ] 8.3 Document the spec markdown format expected by the parser
- [ ] 8.4 Add troubleshooting guide for common parity validation errors
