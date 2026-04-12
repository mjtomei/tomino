# Spec: Playwright E2E Setup and Dev Server Orchestration

## Requirements

### 1. Install Playwright with Chromium
- Install `@playwright/test` as a root devDependency
- Install Chromium browser via `npx playwright install chromium`
- Headless Chromium is the default test browser

### 2. Configure `playwright.config.ts` at repo root
- **webServer**: Start both:
  - **Vite dev server** (client): `npm run dev` in `packages/client`, port 5173 (Vite default), readiness URL `http://localhost:5173`
  - **Game server**: `npm run dev` in `packages/server` (runs `tsx watch src/index.ts`), port 3001 (from `packages/server/src/index.ts:8`), readiness URL `http://localhost:3001/health` (from `packages/server/src/index.ts:14`)
- **baseURL**: `http://localhost:5173` — the Vite dev server, which proxies `/api` to port 3001 (from `packages/client/vite.config.ts:7-9`)
- **testDir**: `e2e/`
- **Default browser**: Chromium, headless
- **Headed mode flag**: Allow `--headed` via CLI (Playwright supports this natively) or provide a headed project/config toggle

### 3. Add `npm run test:e2e` script to root `package.json`
- Script: `"test:e2e": "npx playwright test"` in root `package.json:8` scripts block

### 4. Create smoke test at `e2e/smoke.spec.ts`
- Load the app at baseURL (`/`)
- Verify page title is "Tetris" (from `packages/client/index.html:6`: `<title>Tetris</title>`)
- Verify no console errors during load
- Verify the app renders (root element populated — the first view is `PlayerNameInput` from `packages/client/src/App.tsx:25`)

## Implicit Requirements

1. **Both servers must be ready before tests run** — Playwright's `webServer` config supports `url` for readiness checks and `reuseExistingServer` for dev convenience
2. **Server startup order** — The game server should start first (or concurrently) since the Vite proxy depends on it for `/api` routes, though for the smoke test this isn't critical since we're just checking the UI renders
3. **`reuseExistingServer: true`** — Useful for local dev where servers may already be running; avoids port conflicts
4. **TypeScript compatibility** — The root `tsconfig.json` uses project references. Playwright config is loaded by Playwright directly (not tsc), so it works standalone
5. **`.gitignore` updates** — Playwright generates `test-results/`, `playwright-report/`, and `playwright/.cache/` directories that should be gitignored

## Ambiguities

1. **Headed mode flag** — The task mentions "a headed mode flag for local debugging." Playwright natively supports `--headed` CLI flag. **Resolution**: No custom config needed; document the `--headed` flag in the npm script. Optionally add a `test:e2e:headed` script for convenience.

2. **Console error assertion scope** — "No console errors" could mean zero `console.error` calls or no uncaught exceptions. **Resolution**: Listen for `console` events of type `error` and fail if any occur. Ignore `warning` level messages.

3. **Server timeout** — How long to wait for dev servers to start. **Resolution**: Use 30s timeout (Playwright default is 60s but 30s is reasonable for dev servers).

## Edge Cases

1. **Port conflicts** — If port 5173 or 3001 is already in use, server startup fails. Mitigated by `reuseExistingServer: !process.env.CI` (reuse locally, fail-fast in CI).
2. **WebSocket connection errors** — The app tries to connect via WebSocket on load (from `useLobby` hook). This may produce console errors if the server isn't ready yet. The smoke test should account for WebSocket connection retries not being treated as fatal console errors — or ensure the server is up before the page loads (which webServer config handles).
3. **Vite HMR WebSocket** — Vite's HMR uses its own WebSocket. This shouldn't interfere but is worth noting.
