# Implementation Spec: E2E Test Helpers for Multiplayer Flows

## Requirements

### R1: `createPlayerContext(browser, name)` — `e2e/helpers/player.ts`
Create a new Playwright `BrowserContext` + `Page`, navigate to `baseURL` (`/`), and complete the player name input flow:
- Fill `#player-name` with `name`
- Submit the form (click the "Continue" button)
- Wait until the lobby menu is visible (text "Welcome, {name}" present)
- Return `{ context, page }` for the caller to use

This abstracts the name-input → menu transition that every multiplayer test needs.

### R2: `createRoom(page)` — `e2e/helpers/lobby.ts`
From the lobby menu view:
- Click "Create Room" button
- Wait for the "Waiting Room" heading to appear
- Extract and return the room code from the `<code>` element inside the room-info section

### R3: `joinRoom(page, roomId)` — `e2e/helpers/lobby.ts`
From the lobby menu view:
- Click "Join Room" button
- Wait for the join dialog (`[role="dialog"]`)
- Fill `#room-code` with `roomId`
- Click the "Join" submit button
- Wait for the "Waiting Room" heading to appear

### R4: `sendKeyboardInput(page, action)` — `e2e/helpers/input.ts`
Map game action names to keyboard keys and press them. Actions to support:
- `moveLeft` → ArrowLeft
- `moveRight` → ArrowRight
- `softDrop` → ArrowDown
- `hardDrop` → Space
- `rotateClockwise` → ArrowUp
- `rotateCounterClockwise` → z
- `hold` → c

This mapping should be easy to extend. The function calls `page.keyboard.press(key)`.

### R5: `waitForGameState(page, predicate)` — `e2e/helpers/game-state.ts`
Poll the page DOM for a condition. Accept a predicate function (or a simpler approach: a CSS selector / text check) and poll until it returns true or a timeout expires. Use `page.waitForFunction` or `expect(...).toPass()` pattern with polling.

Specific use cases to support:
- Game started (countdown complete / game view visible)
- Game over screen visible

### R6: Barrel export — `e2e/helpers/index.ts`
Re-export all helpers from a single entry point.

### R7: Integration test — `e2e/multiplayer-lobby.spec.ts`
A 2-player lobby flow test:
1. Player 1: `createPlayerContext(browser, "Alice")` → `createRoom(page1)` → get roomId
2. Player 2: `createPlayerContext(browser, "Bob")` → `joinRoom(page2, roomId)`
3. Assert both players see each other in the waiting room player list
4. Verify the room code is displayed correctly on both pages

## Implicit Requirements

- **Multiple browser contexts**: Each player needs an isolated browser context (separate localStorage, separate WebSocket connection, separate session player ID). Playwright's `browser.newContext()` handles this.
- **WebSocket connection timing**: After navigating and entering a name, the client auto-connects to `ws://localhost:3001`. Helpers must wait for `connectionState === "connected"` before lobby actions (buttons are disabled until connected). This means waiting for "Create Room" / "Join Room" buttons to be enabled.
- **Player name persistence**: `localStorage` stores the player name. Since each context is isolated, this doesn't cause cross-contamination, but we should clear it or use fresh contexts.
- **Base URL**: Playwright config sets `baseURL: http://localhost:5173`. `page.goto("/")` is sufficient.
- **Server state**: The server's room store is in-memory. Tests share a single server instance. Room codes are random, so no collision concern between parallel tests in practice, but the `fullyParallel: true` config means tests could interleave. Each test should create its own room.

## Ambiguities

1. **`waitForGameState` predicate API** — The task says "polls the page for a DOM condition" with a predicate. Resolution: Use Playwright's `page.waitForFunction()` for arbitrary JS predicates, but also provide convenience wrappers like `waitForSelector(page, selector)` that are simpler. The primary `waitForGameState` will accept a selector string and optional timeout, using `page.waitForSelector()` internally. This is simpler and more Playwright-idiomatic than passing JS functions.

2. **`sendKeyboardInput` action type** — The task doesn't specify the exact action names. Resolution: Use the action names from the game engine's input system. Since the game input handling isn't fully implemented yet, use standard Tetris control names as listed in R4.

3. **Waiting for connection** — Buttons in the lobby are disabled until WebSocket connects. Resolution: `createRoom` and `joinRoom` will wait for the button to be enabled (not disabled) before clicking, which implicitly waits for connection.

## Edge Cases

1. **Slow WebSocket connection**: The server might not be ready immediately. The Playwright config already has `webServer` with health checks, so the server should be up. But the WebSocket handshake adds latency. Waiting for the button to be enabled handles this.

2. **Room code extraction**: The room code is in a `<code>` element. If multiple `<code>` elements exist on the page, we need a specific selector. The WaitingRoom component has a single `<code>` inside the room-info section. Use `code` selector — it's unambiguous in the waiting room view.

3. **Player list assertions**: The waiting room lists players as `<li>` items with `<span>` for name text. To check if a player name is visible, we can use `page.getByText(name)` within the player list or check `li` contents. The player list `<ul>` has no ID/role, so we'll use text matching.

4. **Test isolation**: Each test creates fresh browser contexts, but they share the server. If a test fails and leaves a room, the server retains it in memory. This is fine — rooms are identified by random codes and won't interfere.
