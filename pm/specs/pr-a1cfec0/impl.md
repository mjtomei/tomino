# Implementation Spec: Project Scaffolding with Vite + React + TypeScript

## Requirements

1. **Monorepo with npm workspaces** — Three packages under `packages/`: `client` (Vite + React app), `server` (Node.js WebSocket server), and `shared` (shared TypeScript types and game logic). Root `package.json` configures workspaces.

2. **Vite + React + TypeScript client** — `packages/client/` contains the Vite project configured for React with TypeScript. Files: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`.

3. **TypeScript project references** — Root `tsconfig.json` uses project references to build all three packages. Client and server reference shared. `composite: true` enabled in all packages.

4. **Dev tooling setup** — Configure ESLint and Prettier at the root for consistent code quality. Files: `.eslintrc.cjs`, `.prettierrc`.

5. **Directory structure** — Client source directories matching `plans/01-core-tetris.md`:
   - `packages/client/src/engine/` — Game logic (board, pieces, scoring, movement, randomizer, engine)
   - `packages/client/src/ui/` — React components and canvas renderer
   - `packages/client/src/input/` — Keyboard input handling
   - `packages/client/src/audio/` — Sound effects
   Each directory gets a `.gitkeep` placeholder since no game logic is included yet.

6. **Minimal Hello World React app** — `packages/client/src/main.tsx` renders `packages/client/src/App.tsx` into the DOM. `App.tsx` displays a placeholder page confirming the toolchain works.

7. **Server package placeholder** — `packages/server/` with `package.json`, `tsconfig.json`, and `src/index.ts` placeholder. Ready for Plan 2 (multiplayer WebSocket server).

8. **Shared package placeholder** — `packages/shared/` with `package.json`, `tsconfig.json`, and `src/index.ts` placeholder. Exports entry point for shared types (network protocol, skill ratings).

9. **Verification tests** — `tsc -b` builds all packages, Vite builds client successfully (`npm run build`), dev server starts (`npm run dev`), React renders a placeholder page.

## Implicit Requirements

1. **Node.js availability** — Node.js and npm must be available in the environment.

2. **TypeScript strict mode** — All `tsconfig.json` files enable strict mode for type safety across future PRs.

3. **React 18+ with JSX transform** — Use the automatic JSX runtime so `.tsx` files don't need explicit `import React`.

4. **ESLint must support TypeScript + React** — Need `@typescript-eslint` parser/plugin and React-specific rules.

5. **Existing files must be preserved** — `notes.txt`, `plans/`, and `pm/` already exist in the repo and must not be removed.

## Ambiguities

1. **Vite version** — Resolved: Use Vite 5.x (current stable).

2. **ESLint flat config vs legacy** — Resolved: Use legacy `.eslintrc.cjs` format as specified in original task.

3. **CSS solution** — Resolved: Plain CSS is sufficient for scaffolding. Future PRs will add game-specific styles.

4. **Test framework** — Resolved: Don't add a test framework yet; later PRs that need unit tests will add Vitest.

5. **Package manager** — Resolved: Use npm with native workspaces.

6. **Monorepo structure** — Resolved per PR notes: npm workspaces with `packages/client`, `packages/server`, `packages/shared`. TypeScript project references between them.

## Edge Cases

1. **Port conflicts** — Dev server default port 5173 may be in use. Vite auto-increments ports, so this is handled by default.

2. **Git ignore** — `.gitignore` covers `node_modules/`, `dist/`, `*.tsbuildinfo`, etc. across all packages.

3. **Workspace dependency resolution** — `@tetris/shared` referenced as `"*"` in client and server dependencies, resolved via npm workspaces symlinks.
