# Implementation Spec: Testing Infrastructure — Vitest Setup

## Requirements

### R1: Install Vitest and testing dependencies across the monorepo
- Add `vitest` as a root devDependency (shared by all packages via hoisting)
- Add `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` as devDependencies in `packages/client` for React component testing
- Add a root-level `test` script and per-package `test` scripts

### R2: Per-package Vitest configurations
- **`packages/shared/vitest.config.ts`** — Node environment, TypeScript, no DOM. Suitable for pure logic unit tests (rotation, scoring, board state).
- **`packages/server/vitest.config.ts`** — Node environment, TypeScript. Suitable for WebSocket handler and room management tests.
- **`packages/client/vitest.config.ts`** — jsdom environment, React plugin (reuse existing `@vitejs/plugin-react`), setup file for `@testing-library/jest-dom` matchers. Suitable for React Testing Library component tests.

### R3: Root-level Vitest workspace configuration
- Create `vitest.workspace.ts` at the repo root referencing all three packages, enabling `vitest` from the root to run all tests across the monorepo.

### R4: Example/pattern tests for each package
Since all packages are currently placeholders, create minimal example tests that establish the testing patterns for future PRs:
- **Shared:** A sample unit test file demonstrating the pattern for testing pure game logic (e.g., `packages/shared/src/__tests__/example.test.ts`).
- **Server:** A sample test file demonstrating the pattern for server-side testing (e.g., `packages/server/src/__tests__/example.test.ts`).
- **Client:** A sample component test using React Testing Library (e.g., `packages/client/src/__tests__/App.test.tsx`).

### R5: Root-level test script
- Add `"test": "vitest run"` to root `package.json` scripts to run all tests across the workspace.
- Add `"test:watch": "vitest"` for development watch mode.

## Implicit Requirements

### IR1: TypeScript configuration compatibility
- Vitest configs must be compatible with the existing `tsconfig.json` settings (ES2020 target, strict mode, composite projects). The `vitest.config.ts` files need to work with the module resolution strategy of each package (nodenext for shared/server, bundler for client).

### IR2: Vite plugin reuse for client
- The client package already uses `@vitejs/plugin-react` in `vite.config.ts`. The `vitest.config.ts` should reuse this plugin to ensure consistent JSX transformation between dev/build and test environments.

### IR3: No interference with existing build/lint scripts
- Adding Vitest must not break existing `build`, `dev`, `lint`, or `preview` scripts. The test configuration should be separate from the build configuration.

### IR4: Package workspace hoisting
- Since this is an npm workspaces monorepo, `vitest` installed at the root will be available to all packages. Per-package devDependencies should only include package-specific testing libraries (e.g., RTL only in client).

## Ambiguities

### A1: Test file location convention
**Resolution:** Use `src/__tests__/` directories within each package. This is the most common Vitest convention and keeps tests co-located with source code. The Vitest configs will use the default test file matching (`**/*.test.ts`, `**/*.test.tsx`).

### A2: Coverage configuration
**Resolution:** Do not configure coverage tooling in this PR. Coverage is a follow-up concern once there is actual game logic to measure. Keep this PR focused on the testing framework itself.

### A3: Depth of example tests
**Resolution:** Keep example tests minimal but meaningful — they should demonstrate the testing pattern (imports, setup, assertions) without testing placeholder code extensively. The App component test can verify the placeholder renders. Shared/server tests can demonstrate basic assertion patterns with inline logic since there's no real game logic yet.

### A4: CI integration
**Resolution:** Out of scope for this PR. The root `test` script is sufficient for CI to call; pipeline configuration is separate work.

## Edge Cases

### E1: Vitest and TypeScript project references
TypeScript composite projects with project references can conflict with Vitest's file resolution. The `vitest.config.ts` files should not rely on `tsconfig.json`'s `references` field — Vitest handles its own file resolution.

### E2: ES module compatibility
All packages use `"type": "module"`. Vitest natively supports ESM, but test setup files and configs must use ESM syntax (import/export, not require).

### E3: React Testing Library cleanup
The client test setup should configure automatic cleanup after each test via the setup file importing `@testing-library/jest-dom`, which is standard RTL practice with Vitest.
