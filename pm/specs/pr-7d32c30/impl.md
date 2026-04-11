# Implementation Spec: WebSocket Server Setup (pr-7d32c30)

## Requirements

1. **Express + WebSocket server entry point** — Replace the placeholder in `packages/server/src/index.ts` with a real Express HTTP server that upgrades connections to WebSocket via the `ws` library.

2. **WebSocket connection lifecycle** — Implement in `packages/server/src/ws-server.ts`:
   - Accept new WebSocket connections and assign each a unique ID
   - Track connected clients
   - Handle clean disconnections (client closes)
   - Handle unclean disconnections (network drop detected via heartbeat)

3. **Heartbeat / ping-pong** — Server sends periodic pings to each client. If a client fails to respond with a pong within a timeout window, the server considers the connection dead and cleans it up.

4. **Dev tooling** — Add a `dev` script to `packages/server/package.json` using `tsx` (preferred over ts-node for ESM compat) so the server can be run in development without a build step.

5. **Dependencies** — Add to `packages/server/package.json`:
   - `ws` (runtime)
   - `express` (runtime)
   - `@types/ws` (dev)
   - `@types/express` (dev)
   - `tsx` (dev, for dev script)

6. **Tests** — Add tests covering:
   - Connection lifecycle (connect, disconnect, heartbeat timeout)
   - Multiple simultaneous connections
   - Malformed message handling

## Implicit Requirements

- The server must work within the existing npm workspaces monorepo structure (`packages/server/`), not a new root-level `server/` directory.
- The existing `tsconfig.json` in `packages/server/` already has correct settings (nodenext, ES2020, composite) — no separate `tsconfig.server.json` needed.
- The server should use ESM (`"type": "module"` is already set in root and server package.json).
- The server should be stoppable (export a way to close the server cleanly) for testability.
- A root-level `dev:server` script should be added for convenience.
- Need a test framework — will use `vitest` to match the likely future client test setup and avoid adding a second test runner.

## Ambiguities (Resolved)

1. **`server/` directory vs `packages/server/`** — The task says "Add a `server/` directory at the project root" but the scaffolding PR already created `packages/server/` as a workspace package. **Resolution**: Use the existing `packages/server/` structure. The task description was written before scaffolding was done.

2. **`tsconfig.server.json`** — The task lists this file, but `packages/server/tsconfig.json` already exists with correct settings. **Resolution**: Use the existing tsconfig. No separate file needed.

3. **`server/index.ts` vs `packages/server/src/index.ts`** — **Resolution**: Map to actual paths: `packages/server/src/index.ts` and `packages/server/src/ws-server.ts`.

4. **Server port** — Not specified. **Resolution**: Default to 3001 (client Vite dev server uses 5173), configurable via `PORT` env var.

5. **Heartbeat interval/timeout** — Not specified. **Resolution**: 30s ping interval, 10s pong timeout — standard WebSocket defaults.

6. **Message format** — Task says "malformed message handling" but no protocol is defined yet. **Resolution**: For now, expect JSON messages. Log and ignore malformed (non-JSON) messages without crashing. The actual protocol will be defined in a later PR.

## Edge Cases

- **Rapid connect/disconnect** — Client connects and immediately disconnects before heartbeat starts. Must not leave dangling state.
- **Server shutdown during active connections** — Graceful shutdown should close all WebSocket connections and stop the heartbeat interval.
- **Multiple pong failures** — Only one missed pong should trigger disconnect (not accumulate).
- **Binary messages** — `ws` can receive binary frames. Should handle gracefully (ignore or log).

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/server/src/index.ts` | Rewrite — Express + WS server entry point |
| `packages/server/src/ws-server.ts` | Create — WebSocket server class |
| `packages/server/package.json` | Modify — add dependencies and dev script |
| `packages/server/src/__tests__/ws-server.test.ts` | Create — tests |
| `package.json` (root) | Modify — add `dev:server` script |
