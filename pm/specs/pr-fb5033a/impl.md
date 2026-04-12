# Implementation Spec: Post-game results integration with ratings

## Requirements

### R1: Display each player's old rating, new rating, and delta

**Grounded in:** `GameResults.tsx` (the existing results screen), `S2C_RatingUpdate` message in `protocol.ts:318-323`.

The server already broadcasts `S2C_RatingUpdate` with `Record<PlayerId, RatingChange>` where `RatingChange = { username, before, after }`. The client (`lobby-client.ts`) does **not** yet handle this message. We need to:

1. Add `ratingChanges` to `GameEndData` in `lobby-client.ts:33-38`.
2. Add a `socket.on("ratingUpdate", ...)` handler in `lobby-client.ts` to merge rating changes into state.
3. Pass `ratingChanges` to `GameResults` component as a new prop.
4. Display a new "Rating" column in the results table showing `before → after (+delta)` per player.
5. Color the delta: green for positive, red for negative.

### R2: Show a brief "New rating" animation

**Grounded in:** Existing animation pattern in `Countdown.tsx` / `Countdown.css` (CSS keyframe `countdown-pulse`).

After the results table renders, animate each player's new rating with a brief entrance animation:
- Use a CSS keyframe animation (e.g., `rating-reveal`) that fades in and scales up slightly.
- Stagger animation per row using `animation-delay`.
- Animation duration ~0.6s, ease-out.

### R3: Include a link to the full stats screen

**Grounded in:** `StatsScreen.tsx`, currently navigated via `setShowStats(true)` in `App.tsx:71`.

Add a "View Full Stats" button/link in the results screen that navigates to the stats screen. This requires:
1. A new `onViewStats` callback prop on `GameResults`.
2. Wire it in `App.tsx` results case to `setShowStats(true)`.

### R4: When handicap was active, show what the modifiers were for transparency

**Grounded in:** `HandicapModifiers` type in `handicap-types.ts`, `gameSession.handicapModifiers` stored on `GameSessionData` in `lobby-client.ts`, `computeIndicatorData()` in `handicap-indicator.ts`.

When the game used handicap modifiers (intensity !== "off"):
1. Display a "Handicap Active" section below the results table.
2. Show per-player-pair garbage multipliers from the modifier matrix.
3. Summarize as: for each player, show incoming garbage multiplier (protection level).

The modifier matrix is already available on `lobby.state.gameSession.handicapModifiers` and persists through the results view.

## Implicit Requirements

### IR1: Resolve merge conflicts
Three files have unresolved merge conflicts from merging the rematch and rating-update branches:
- `packages/shared/src/protocol.ts` — ServerMessage union and SERVER_MESSAGE_TYPES array need both `S2C_RematchUpdate` and `S2C_RatingUpdate`
- `packages/server/src/handlers/game-handlers.ts` — imports need both `clearRematchVotes` and `handlePostGame`; both the rematch-clearing logic and the `isRanked` logic need to coexist
- `packages/server/src/game-session.ts` — imports need both `createSkillBiasStrategy` and `MetricsCollector`

### IR2: Rating data arrives asynchronously
The `ratingUpdate` message arrives **after** `gameEnd` (the server processes ratings asynchronously in `game-handlers.ts:125-148`). The results screen must render immediately with game stats, then update to show ratings when the `ratingUpdate` arrives. This means rating display should handle the "not yet received" state gracefully.

### IR3: Type exports
`RatingChange` is defined in `protocol.ts` but must be re-exported from the shared package index so the client can import it.

### IR4: GameSession data persistence through results view
The `gameSession` field (containing `handicapModifiers`) is currently cleared when transitioning back to waiting room (`lobby-client.ts:241-250`) but is preserved during the results view. This is correct and no change is needed.

## Ambiguities

### A1: Rating animation trigger timing
**Ambiguity:** Should the animation play on initial render or only when rating data arrives?

**Resolution:** Animate when rating data arrives (since it comes async after gameEnd). The rating column initially shows "..." or a loading state, then animates in the actual values when `ratingUpdate` is received.

### A2: Handicap modifier display format
**Ambiguity:** How detailed should the handicap transparency section be? Full matrix, or per-player summary?

**Resolution:** Per-player summary. For each player, show their incoming garbage multiplier (strongest protection level from any opponent). This matches the in-game `HandicapIndicator` display and keeps the results screen uncluttered. Only show when at least one modifier differs from 1.0x.

### A3: "View Full Stats" navigation behavior
**Ambiguity:** Should viewing stats leave the results screen (requiring navigation back) or open in a new view?

**Resolution:** Navigate to the stats screen (same as the menu's "View Stats" button). The user can navigate back from there to the lobby. This keeps the UX simple and reuses existing StatsScreen infrastructure.

### A4: Delta display for unrated games
**Ambiguity:** What to show when no rating update arrives (e.g., handicap was off, so the game wasn't rated)?

**Resolution:** The rating column is simply not shown. Based on `game-handlers.ts:125`, `isRanked` is true when handicap is enabled. When no `ratingUpdate` message arrives, the GameResults component omits the rating section entirely.

## Edge Cases

### E1: Player disconnects before ratingUpdate arrives
If a player disconnects and the lobby state resets (view → "menu"), any pending ratingUpdate is ignored since the handler checks `prev.room?.id === msg.roomId`. No special handling needed.

### E2: Solo / 1-player game
`handlePostGame` skips when `playerIds.length < 2`. No ratingUpdate is broadcast. The results screen correctly omits the rating section.

### E3: 3+ player games with pairwise rating changes
In 3+ player games, the winner's rating change is cumulative (winner vs each loser). The `RatingChange.before` reflects the pre-game rating and `after` reflects the final accumulated rating. Each loser's change is independent. The delta display works correctly for all players.

### E4: New player with no prior rating
New players start at 1500 (per `rating-config.ts`). The `defaultProfile()` function in `post-game-handler.ts` handles this. The results screen shows their starting rating as 1500.

### E5: Handicap display when all multipliers are 1.0x
When handicap is technically enabled but all modifiers are 1.0x (e.g., all players have identical ratings), the handicap section should be hidden since there's nothing meaningful to display.

## Files to Modify

### Merge conflict resolution
- `packages/shared/src/protocol.ts` — Resolve to include both message types
- `packages/server/src/handlers/game-handlers.ts` — Resolve to include both imports and logic
- `packages/server/src/game-session.ts` — Resolve to include both imports

### Client changes
- `packages/shared/src/protocol.ts` — Ensure `RatingChange` is exported
- `packages/shared/src/index.ts` — Re-export `RatingChange` type
- `packages/client/src/net/lobby-client.ts` — Add `ratingChanges` to `GameEndData`, add `ratingUpdate` handler
- `packages/client/src/ui/GameResults.tsx` — Add rating column, handicap section, stats link, animation
- `packages/client/src/ui/GameResults.css` — Styles for rating display, animation, handicap section
- `packages/client/src/App.tsx` — Pass `ratingChanges`, `handicapModifiers`, `handicapMode`, `onViewStats` to GameResults

### Tests
- `packages/client/src/__tests__/GameResults.test.tsx` — Update tests for new props, add rating display tests
