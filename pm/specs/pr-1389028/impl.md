# pr-1389028 — Opponent board display

## Requirements (grounded)

1. **`packages/client/src/ui/OpponentBoardCanvas.ts` (new)** — pure canvas
   renderer (no React) that draws a simplified preview of an opponent board
   from a `GameStateSnapshot` (`@tetris/shared`). Exposes a `renderOpponentBoard(ctx, snapshot, cellSize)`
   function that:
   - Draws a background matching `BOARD_BG` from `./colors.js`.
   - Iterates rows `board[BUFFER_HEIGHT .. BUFFER_HEIGHT+VISIBLE_HEIGHT-1]`
     (using `BOARD_WIDTH`, `BOARD_VISIBLE_HEIGHT`, `BOARD_BUFFER_HEIGHT` from
     `@tetris/shared`) and fills each non-null cell with its piece color via
     `PIECE_COLORS[cell]`.
   - Also rasterizes `snapshot.activePiece` (if any) using the same
     color lookup — shape via `SRSRotation.getShape(type, rotation)`.
   - Uses flat fills (no bevel/highlight, no grid lines, no ghost) since
     the task says "simplified canvas renderer (no need for piece detail, just
     filled/empty cells)"; the active piece is included so motion is visible
     in real-time, which is essential for "render opponent boards … update
     in real-time".
   - Optionally dims the board if `snapshot.isGameOver` is true (50% alpha).

2. **`packages/client/src/ui/OpponentBoard.tsx` (new)** — React component
   `OpponentBoard` that owns an `HTMLCanvasElement`, schedules a redraw via
   `requestAnimationFrame` on each `snapshot` / `cellSize` change, and shows
   the opponent's player name above the board. Props:
   ```ts
   interface OpponentBoardProps {
     playerName: string;
     snapshot: GameStateSnapshot | null;
     cellSize: number;   // derived from player count (see #4)
     isGameOver?: boolean;
   }
   ```
   When `snapshot` is null (haven't received the first state yet), renders an
   empty board at the correct dimensions with just the background.

3. **`packages/client/src/ui/GameMultiplayer.tsx` (new)** — layout wrapper
   used in place of `GameShell` when the lobby view is `"playing"`. Renders:
   - The local player's main board (reuses existing `GameShell` unchanged —
     this PR does not wire up `GameClient` prediction; that's out of scope
     per the prior PR's boundary).
   - A column of `OpponentBoard` components, one per remote player in the
     room (all players in `room.players` except the local `currentPlayerId`).
   - Positioned alongside the main board via a flex row container.
   Props:
   ```ts
   interface GameMultiplayerProps {
     room: RoomState;
     currentPlayerId: PlayerId;
     seed: number;
     opponentSnapshots: Record<PlayerId, GameStateSnapshot>;
   }
   ```

4. **Scaling logic** — `OpponentBoard` cell size is derived from the number
   of opponents so boards remain readable:
   - 1 opponent → `cellSize = 15`
   - 2 opponents → `cellSize = 12`
   - 3 opponents → `cellSize = 10`
   - ≥4 opponents → `cellSize = 8`
   Computed as a pure helper `opponentCellSize(opponentCount)` exported from
   `OpponentBoard.tsx` so it is unit-testable independently of React.

5. **State plumbing (`lobby-client.ts`)** — add
   `opponentStates: Record<PlayerId, GameStateSnapshot>` to `LobbyState`.
   In the socket `useEffect`, add a subscription to `"gameStateSnapshot"`
   that, when `msg.playerId !== currentPlayerId` (remote player), merges the
   new snapshot into `opponentStates` by playerId. On `"gameStarted"`, seed
   `opponentStates` from `msg.initialStates` (excluding local player). On
   game end / leave room, clear it.

6. **`App.tsx`** — in the `"playing"` case, swap `GameShell` for
   `GameMultiplayer`, wiring `room`, `currentPlayerId`, `seed`, and
   `opponentSnapshots` from `lobby.state`.

7. **Tests** (`packages/client/src/__tests__/`):
   - `OpponentBoard.test.tsx` — component rendering with a mock snapshot:
     creates a canvas, verifies `fillRect` is called for occupied cells and
     for the active piece shape; verifies null snapshot renders only the
     background.
   - `OpponentBoard.scaling.test.ts` — `opponentCellSize` returns the
     expected cell sizes for 1 / 2 / 3 / 4+ opponents (and 0).
   - `lobby-client.test.ts` — extend existing tests: on
     `gameStateSnapshot` for a non-local player, `state.opponentStates`
     gains the snapshot; local-player snapshots are *not* added to
     `opponentStates`; `gameStarted` seeds `opponentStates` from
     `initialStates` minus the local player.

## Implicit Requirements

- **Canvas mocking in tests** — existing `BoardCanvas.test.tsx` already
  mocks `HTMLCanvasElement.prototype.getContext` globally. `OpponentBoard`
  tests can reuse the same pattern (import from shared helper or inline).
- **PlayerId / local player identification** — computed in `App.tsx` via
  `makePlayerInfo(lobby.playerName).id` (same pattern as existing
  handicap-indicator wiring). `GameMultiplayer` receives it as a prop —
  it does not recompute.
- **requestAnimationFrame lifecycle** — `OpponentBoard` must cancel any
  pending RAF on unmount (mirroring `BoardCanvas.tsx`'s pattern at
  `BoardCanvas.tsx:425–428`) to avoid drawing into a detached canvas.
- **Empty board (`isGameOver`)** — when an opponent tops out the server
  sends a final snapshot with `isGameOver: true`; we render a dimmed board
  so the user can see who's out. The existing `S2C_GameOver` message is
  separate and unchanged.
- **Room player order vs. stable opponent order** — iterate
  `room.players.filter(p => p.id !== currentPlayerId)` so opponent order
  matches the waiting-room order and doesn't reshuffle on state updates.

## Ambiguities (resolved)

- **Where to subscribe to opponent snapshots** — options: (a) inside
  `GameMultiplayer`, (b) inside `lobby-client`'s socket effect. Chose (b)
  because `lobby-client` already owns the socket and all existing
  subscriptions live there; exposing the socket externally would duplicate
  ownership and add teardown races.
- **Delta support** — the protocol currently only defines
  `"gameStateSnapshot"` (`protocol.ts:138`) carrying a full
  `GameStateSnapshot`. There is no `"gameStateDelta"` message type. This
  PR subscribes only to full snapshots; delta support can be added later
  without touching the UI.
- **Local main-board wiring** — the merged pr-1e00262 created `GameClient`
  but did not wire it into `GameShell` / `App.tsx`; multiplayer play still
  uses the solo local engine with the shared seed. That integration is
  explicitly out of scope for this PR (which is "opponent board display");
  reusing `GameShell` unchanged preserves the existing behavior.
- **Simplified renderer drawing the active piece** — the task says
  "no need for piece detail, just filled/empty cells", but a board with no
  active piece would look frozen between locks. We interpret "no piece
  detail" as "no bevel/highlight/ghost", not "skip the active piece".
  Drawing the active piece at full color matches what a human observer
  expects ("I can see what my opponent is doing").

## Edge Cases

- **Snapshot arrives before `gameStarted`** — should not happen per
  server ordering, but defensively the subscription no-ops if
  `state.view !== "playing"` or `state.room` is null.
- **Opponent leaves mid-game** — `playerLeft` handler should also drop
  that player from `opponentStates` to avoid stale boards.
- **Local player's own `gameStateSnapshot`** — filtered out by the
  `msg.playerId !== currentPlayerId` guard; local player's board still
  comes from `GameShell`'s local engine.
- **Resize / retina** — not handled in this PR (matches current
  `BoardCanvas` which also uses CSS pixel dimensions). Mention in PR
  description if it matters.
- **Many opponents (≥4)** — 4-player rooms are the current cap
  (`createRoom` sends `maxPlayers: 4` in `lobby-client.ts:268`), so in
  practice opponent count is 1–3. The `≥4` branch of `opponentCellSize`
  exists for future room-size changes but is not exercised today.
