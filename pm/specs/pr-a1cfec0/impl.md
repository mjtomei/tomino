# Implementation Spec: Project Scaffolding with Vite + React + TypeScript

## Requirements

1. **Vite + React + TypeScript project initialization** — Create a new Vite project configured for React with TypeScript. Files: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`.

2. **Dev tooling setup** — Configure ESLint and Prettier for consistent code quality. Files: `.eslintrc.cjs`, `.prettierrc`.

3. **Directory structure** — Create the following source directories to match the architecture described in `plans/01-core-tetris.md`:
   - `src/engine/` — Game logic (board, pieces, scoring, movement, randomizer, engine)
   - `src/ui/` — React components and canvas renderer
   - `src/input/` — Keyboard input handling
   - `src/audio/` — Sound effects
   Each directory gets a `.gitkeep` placeholder since no game logic is included yet.

4. **Minimal Hello World React app** — `src/main.tsx` renders `src/App.tsx` into the DOM. `App.tsx` displays a placeholder page confirming the toolchain works.

5. **Verification tests** — Vite builds successfully (`npm run build`), dev server starts (`npm run dev`), React renders a placeholder page.

## Implicit Requirements

1. **Node.js availability** — Node.js and npm must be available in the environment for `npm create vite` or manual setup.

2. **TypeScript strict mode** — The plan targets a production-quality game; `tsconfig.json` should enable strict mode for type safety across future PRs.

3. **React 18+ with JSX transform** — Use the automatic JSX runtime so `.tsx` files don't need explicit `import React`.

4. **Vite config for future needs** — The config should work as-is but be ready for future additions (e.g., path aliases for `src/engine`, test config).

5. **ESLint must support TypeScript + React** — Need `@typescript-eslint` parser/plugin and React-specific rules.

6. **Existing files must be preserved** — `notes.txt`, `plans/`, and `pm/` already exist in the repo and must not be removed.

## Ambiguities

1. **Vite version** — Resolved: Use latest Vite 5.x (current stable).

2. **ESLint flat config vs legacy** — The task specifies `.eslintrc.cjs` (legacy format). Resolved: Use legacy format as specified.

3. **CSS solution** — Not specified. Resolved: Plain CSS is sufficient for scaffolding. Future PRs (pr-e90433b) will add game-specific styles.

4. **Test framework** — Not specified for this PR (this PR's "tests" are build/dev-server verification, not unit tests). Resolved: Don't add a test framework yet; later PRs (pr-a367deb etc.) that need unit tests will add Vitest.

5. **Package manager** — Not specified. Resolved: Use npm (standard, no extra tooling needed).

## Edge Cases

1. **Port conflicts** — Dev server default port 5173 may be in use. Vite auto-increments ports, so this is handled by default.

2. **Existing `package.json`** — None exists yet, so no conflict.

3. **Git ignore** — Need a `.gitignore` for `node_modules/`, `dist/`, etc. to keep the repo clean.
