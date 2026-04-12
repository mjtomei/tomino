# Spec: Coverage configuration and CI thresholds (pr-edcf972)

## Requirements

1. **Install `@vitest/coverage-v8`** as a dev dependency so vitest can collect coverage via the v8 provider.

2. **Add `npm run test:coverage` script** to root `package.json` that runs vitest with coverage enabled (`vitest run --coverage`).

3. **Configure coverage in `packages/shared/vitest.config.ts`** with:
   - v8 provider
   - Per-directory threshold: `packages/shared/src/engine/` must have >= 90% branch coverage
   - Coverage should include source files under `src/`

4. **Configure coverage in `packages/server/vitest.config.ts`** with:
   - v8 provider
   - Sensible default thresholds (no specific per-directory requirement stated)

5. **Root `vitest.config.ts`** may need coverage settings if workspace-level coverage aggregation is desired. The workspace config uses `projects:` to delegate to per-package configs, so coverage settings belong in the per-package configs.

## Implicit Requirements

- The `@vitest/coverage-v8` package must be installed at root (workspace-level devDependency) since vitest is already a root devDependency.
- Per-package configs currently use `defineProject` from `vitest/config`. Coverage with thresholds requires `defineConfig` instead, since `defineProject` doesn't support top-level `coverage` configuration — coverage is a root-level config option, not a project-level one.
  - **Key issue**: In vitest workspace mode (root config with `projects:`), coverage must be configured at the root level, not in individual project configs. Per-package `defineProject` configs cannot set coverage options.
- The `client` package config is not listed in the task's Files section — it should be left unchanged unless needed.

## Ambiguities

1. **Where to configure coverage thresholds in workspace mode** — Vitest workspace mode runs coverage from the root. Individual project configs (`defineProject`) don't support coverage settings. Coverage thresholds and provider must be configured in the root `vitest.config.ts`.
   - **Resolution**: Configure coverage in root `vitest.config.ts` with the v8 provider and use `thresholds` with per-glob overrides targeting `packages/shared/src/engine/**`.

2. **What threshold to set for non-engine code** — The task specifies 90% branch coverage for `packages/shared/src/engine/` but doesn't mention other packages.
   - **Resolution**: Set modest global defaults (e.g., no global minimum or a low baseline) and use a per-glob override for the engine directory at 90% branch.

3. **Whether `test:coverage` should fail CI on threshold violations** — The task says "confirming thresholds are enforced" which implies failure on violation.
   - **Resolution**: Vitest coverage thresholds fail the process by default when not met. This is the desired behavior.

## Edge Cases

- **Empty coverage for some files**: If engine source files have no corresponding tests importing them, v8 may report 0% coverage. The `all: true` option should be set to include untested files in the report.
- **Snapshot/test files in engine dir**: The engine directory contains `__snapshots__/` and `*.test.ts` files. These should be excluded from coverage via `exclude` patterns.
