# pr-6885981: Multiplayer emotes and opponent reactions

## Requirements (grounded)

### 1. Protocol extension (`packages/shared/src/protocol.ts`)
Add a new C2S message and a matching S2C broadcast:
- `C2S_SendEmote { type: "sendEmote"; roomId: RoomId; emote: EmoteKind }`
- `S2C_PlayerEmote { type: "playerEmote"; roomId: RoomId; playerId: PlayerId; emote: EmoteKind; timestamp: number }`
- `EmoteKind = "thumbsUp" | "fire" | "wave" | "gg"` (exported from protocol)
- Add to `ClientMessage` / `ServerMessage` unions and the `CLIENT_MESSAGE_TYPES` / `SERVER_MESSAGE_TYPES` readonly arrays (lines 109–121, 350–372). `messages.test.ts` validates round-trip — extend fixtures there.

### 2. Server handler (`packages/server/src/handlers/game-handlers.ts` + `ws-server.ts`)
There is no `room-handlers.ts` — the task spec's file path is stale; handlers live under `handlers/`. Add `handleSendEmote` into `game-handlers.ts` (emotes flow during an active game session). Validate:
- Session exists for `msg.roomId` and is in `playing` state
- Sender is a player in that session (`session.getPlayerIds().includes(playerId)`)
- Emote kind is in a small allowlist (rate-limit handled separately)
- Rate-limit: minimum 500 ms between emotes per player to prevent spam. Track per-session `lastEmoteAt` map.
- On valid: `ctx.broadcastToRoom(roomId, { type: "playerEmote", ... })` — broadcast to everyone, including the sender, so they see their own emote echoed consistently.

Wire a new `case "sendEmote":` into the `ws-server.ts` switch (line ~206) that calls `handleSendEmote` with player ID + error callback.

### 3. Client send + receive (`packages/client/src/net/lobby-client.ts`)
- Add `sendEmote(emote: EmoteKind)` action to `UseLobbyResult`. Implementation mirrors `requestRematch`: reads `stateRef.current.room` and calls `socket.send({ type: "sendEmote", ... })`.
- Add `socket.on("playerEmote", ...)` handler. Since emote display is transient (fades after ~2s), it's not kept in `LobbyState` — instead, the handler fires a callback via an event emitter exposed on the result. Simpler: store `recentEmotes: Record<PlayerId, { emote: EmoteKind; timestamp: number }>` in `LobbyState` and let consumers react by comparing timestamps. A single slot per player is enough (new emotes overwrite).

### 4. Opponent reaction detection (`packages/client/src/atmosphere/opponent-reactions.ts`)
New module exporting pure functions for detecting notable events from snapshot deltas:
```ts
export type OpponentReaction = "tetris" | "heavyGarbage" | "eliminated";
export interface ReactionEvent { playerId: PlayerId; reaction: OpponentReaction; at: number }
export function detectReactions(prev: GameStateSnapshot | null, next: GameStateSnapshot, playerId: PlayerId, now: number): ReactionEvent[]
```
Detection rules:
- `tetris`: `next.linesCleared - prev.linesCleared >= 4` (cumulative counter jump of 4+).
- `heavyGarbage`: the board's garbage-row count (rows containing `"G"` cells… actually garbage cells aren't tagged in `Cell` type — the engine stores them using a special marker? Need to verify.) Fallback: detect from `pendingGarbage` queue shrinking while total board fill increases. Simpler and robust: use `pendingGarbage` *incoming* — when the queue's total increases by >= 4 lines in one tick, pulse red (the opponent just got *hit* with heavy incoming). Alternative: the server already sends `garbageReceived` messages to each player about their own garbage; we can listen for opponents' `garbageReceived` too, but those are currently sent only to the receiving player. Simplest working detection without server changes: watch `pendingGarbage` delta (>= 4 lines queued in one snapshot diff) → red flash.
- `eliminated`: `prev.isGameOver === false && next.isGameOver === true`.

Also exports `playReactionEffect(system: ParticleSystem, reaction, center)` and `playEmoteEffect(system, emote, center)` — thin wrappers that emit a themed burst through the shared particle system.

### 5. Opponent board reactions rendering (`packages/client/src/ui/OpponentBoard.tsx`)
- Add optional props: `activeEmote: { emote: EmoteKind; timestamp: number } | null`, `reactionPulse: { reaction: OpponentReaction; at: number } | null`.
- Render a `ParticleCanvas` overlay layered absolutely on top of the board canvas (wrap in `position: relative`). Board owns its own `ParticleSystem` instance (via `useRef`).
- When `activeEmote.timestamp` changes, call `playEmoteEffect(system, emote, center)`.
- When `reactionPulse.at` changes, call `playReactionEffect`.
- Also render a CSS-driven border flash (bright ring for tetris, red flash for heavyGarbage, flourish on elimination) as the primary visual — particles augment it. Flash via toggling a class on the canvas wrapper with a `setTimeout` to remove after ~600ms.

### 6. Emote picker UI (`packages/client/src/ui/EmotePicker.tsx`)
- New component rendered inside `GameMultiplayer.tsx` near the local board (alongside the `TargetingSelector`). Four square buttons with abstract glyphs (SVG paths or unicode-free drawn shapes — per task: "abstract glyphs or particle bursts, not text").
- Keyboard shortcuts: digits `1`–`4` (not the WASD/arrows used for gameplay). Check for conflicts in existing input handling — game inputs use keydown via game client's input handler; must add a listener that only fires when game is active and key is not already consumed.
- Clicking or pressing the shortcut calls `sendEmote(kind)` from the lobby hook.
- Throttle client-side: 500ms cooldown (match server). Disable buttons visually during cooldown.

### 7. `GameMultiplayer.tsx` wiring
- Accept `recentEmotes` and a `sendEmote` callback from `useLobby`.
- Compute reaction events by tracking previous opponent snapshots in a ref; on each `opponentSnapshots` change, diff against the ref and feed new events into per-opponent pulse state.
- Render `<EmotePicker onEmote={sendEmote} />` near the local board.
- Pass `activeEmote` and `reactionPulse` down to each `OpponentBoard`.

**Note on self-emotes**: the sender also needs to see their emote animation somewhere. For the receiver's perspective the emote appears on the sender's opponent-board. From the sender's own perspective there is no "self opponent board". Simplest: skip rendering self emotes visually — the sender already knows they sent it from the button press. Task says "rendered over the sender's opponent board from the receiver's perspective", which confirms this scope.

### 8. Tests

**Unit — shared protocol** (`packages/shared/src/__tests__/messages.test.ts`)
- Add `sendEmote` to `validC2SMessages`
- Add `playerEmote` to `validS2CMessages`
- Existing round-trip / guard tests automatically cover the new types.

**Unit — reaction detection** (`packages/client/src/atmosphere/__tests__/opponent-reactions.test.ts`)
- Tetris clear (linesCleared 2 → 6 produces one `tetris`)
- Single/double clears do not trigger tetris
- Heavy garbage (pending sum 0 → 5 triggers `heavyGarbage`)
- Light garbage (pending 0 → 2 doesn't trigger)
- Elimination (`isGameOver` false → true produces `eliminated`)
- No reactions on identical snapshots
- `null` prev returns empty array

**Unit — server handler** (`packages/server/src/__tests__/emotes.test.ts`)
- Valid emote from in-session player broadcasts to room
- Invalid kind → error
- No session → error
- Rate-limit: second emote within 500ms is dropped (no broadcast)
- Non-player in session → error

**E2E** (`e2e/emotes-reactions.spec.ts`)
- Two-player game: Alice clicks first emote button, Bob's page sees `[data-testid="opponent-emote-active"]` on Alice's opponent board.
- Optionally: Alice triggers a tetris clear via staged inputs, Bob sees a tetris-flash class applied to Alice's opponent board. (This may be flaky — mark as best-effort or skip if it relies on deterministic piece generation.)

## Implicit Requirements
- New types must be added to both the interface unions AND the `*_MESSAGE_TYPES` readonly arrays — existing `messages.test.ts` asserts no duplicates and disjoint sets, so the arrays must stay in sync.
- Emote overlay must not block pointer events on the opponent board (otherwise targeting clicks break). `ParticleCanvas` already sets `pointerEvents: "none"`.
- Particle system per opponent board is local; no shared global RAF. Memory: small bursts (20–40 particles) with ~1s lifetime — well under the 2000 cap.
- Reaction pulses must not fire on the initial snapshot (when prev is null) — otherwise `gameStarted` would trigger `eliminated` spuriously if isGameOver defaults to false (it won't), but we should guard regardless.
- Reconnect / rejoin: the `recentEmotes` map is ephemeral and can be safely cleared on gameStarted / gameRejoined — already handled by the existing state-reset blocks.

## Ambiguities (resolved)
- **"new message type"**: use `sendEmote` / `playerEmote`. Resolved.
- **Emote duration**: 2 seconds visible, then fade out. (Matches typical chat emote UX without being intrusive.)
- **Rate limit**: 500ms per player. Server enforces; client pre-throttles.
- **Abstract glyphs**: render as simple SVG paths (thumb shape, flame shape, wave curve, two-curve "GG" mark) — no text characters.
- **Reaction detection for heavy garbage**: use `pendingGarbage` delta ≥ 4. The receiver-board UX is focused on "opponent just got slammed" not "opponent just cleared their queue", so queued > 4 is the right signal.
- **Keybinds**: digits 1–4. Game doesn't consume number keys currently (verified by the input-action list in `game-handlers.ts` — `VALID_ACTIONS` contains no digit mappings).

## Edge Cases
- Emote while game is over for the sender (spectator): sender's own session is still `playing` state on the server (only that player is `isGameOver`). Should we allow emotes from eliminated players? Task says "social expressiveness"; eliminated-but-spectating players benefit most. Allow — handler only rejects if `session.state !== "playing"` (the whole session ended), not per-player gameover.
- Two players emote at the same tick: independent per-player slots in `recentEmotes`, no collision.
- Spam: 500ms cooldown prevents flood; malicious client still bounded because server enforces.
- Opponent disconnects mid-emote: emote just stops drawing when their board is removed from `opponentSnapshots`.
- Tetris + elimination in the same snapshot diff: both reactions fire; pulses overlap visually — OK, they're different colors.
