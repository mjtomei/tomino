# Plan 3: Adaptive Balancing

## Scope

Layer an adaptive handicap system on top of Plan 2's multiplayer Tetris so that
players of different skill levels have competitive, fun matches. This is the
differentiating feature — inspired by family game nights where skill gaps make
standard competitive play lopsided.

The system tracks per-player performance, computes skill ratings, and dynamically
adjusts garbage sending/receiving so that any two players converge toward roughly
even win rates over time.

## Goals

1. **Skill tracking** — Collect per-player metrics (APM, PPS, lines/game, win
   rate, T-spin rate) and derive a composite skill rating. Persist across sessions.
2. **Adaptive garbage** — Help weaker players by reducing the garbage they
   receive. Default philosophy: **boost the underdog, never punish skill**.
   Stronger players always send at full power. Tuning knobs (garbage multiplier,
   delay modifier, messiness) are configurable per-lobby, but defaults only
   apply reductions to the weaker player's incoming garbage.
3. **Transparency** — Show players their ratings and the active handicap so the
   system feels fair, not mysterious.
4. **Configurability** — Lobby host can adjust handicap intensity (off / light /
   standard / heavy) or disable it entirely for "real" matches.
5. **Convergence** — Over ~10-20 games between the same two players, win rates
   should approach 50/50. System must adapt as players improve.

## Key Design Decisions

- **Server-authoritative ratings**: Skill ratings live server-side (JSON file for
  MVP, easy to swap to SQLite later). The server computes handicaps — clients
  never see raw formulas, only the resulting modifiers.
- **Glicko-2-inspired rating**: Use a simplified Glicko-2 system (rating +
  rating deviation + volatility). Better than raw ELO for players with few games
  and varying play frequency. Calibration period: first 10 games use wider RD.
- **"Boost, don't punish" default**: Handicap only reduces garbage *received*
  by the weaker player (multiplier ≤ 1.0). The stronger player's garbage output
  is never nerfed by default — their skill is never penalized. This feels like
  the weaker player is getting a shield, not like the stronger player is being
  held back. The lobby host can optionally enable "symmetric" mode which also
  reduces the stronger player's output, but this is off by default.
- **Multiplicative garbage modifiers**: Apply a multiplier (0.0–1.0) to garbage
  *received* by the weaker player. No artificial floor — the multiplier goes as
  low as needed to converge on the target win rate, including 0.0 (full immunity)
  for extreme skill gaps. Scales naturally with play intensity.
- **Per-pair modifiers**: In 3+ player games, each sender→receiver pair gets its
  own modifier based on *their* rating gap. Player A sending garbage to Player B
  may be modified differently than Player A sending to Player C. The middleware
  stores a modifier matrix indexed by (sender, receiver) computed at game start.
- **Skill-aware targeting (3+ players)**: Plan 2 defines base targeting mechanics
  (manual target selection + a default auto-targeting algorithm). Plan 3 layers
  skill-aware bias on the auto-targeting default: when a player hasn't manually
  selected a target, the server biases garbage distribution based on ratings.
  Stronger players' auto-targeted garbage skews toward other strong players;
  weaker players' garbage skews toward whoever is the biggest threat to them
  (highest-rated remaining opponent). This is a subtle, invisible lever that
  complements the per-pair multipliers. Manual targeting always overrides —
  if a player picks a target, that's where their garbage goes, no bias applied.
  The bias strength is configurable (0 = pure random/even, 1 = fully skill-weighted).
- **Garbage messiness as an optional knob**: Can be enabled per-lobby to give
  the weaker player cleaner garbage (easier to dig out). Off by default since
  it's subtler and harder to notice. Available as an additional lever when the
  garbage multiplier alone isn't enough.
- **Wrap, don't replace**: The handicap system wraps Plan 2's garbage pipeline
  via a `BalancingMiddleware` that intercepts garbage events, applies modifiers,
  and forwards them. Plan 2's garbage logic stays unchanged. Targeting bias
  hooks into Plan 2's target selection logic similarly.
- **Player identity**: Players are identified by a simple username (entered in
  lobby). No auth system — this is a family game. Ratings are keyed by username.

## Constraints

- Depends on Plan 2's garbage pipeline (`server/garbage-manager.ts`) and game
  results (`pr-bd3b549` win/loss detection).
- Must not degrade multiplayer performance — handicap calculation is lightweight
  and happens server-side between garbage send and receive.
- Needs playtesting to tune. The algorithm PRs should expose config constants
  that are easy to adjust without code changes.

## PRs

### PR: Skill rating types and interfaces
- **description**: Define shared TypeScript types for the skill system: `PlayerProfile` (username, rating, rating deviation, volatility, games played), `MatchResult` (winner, loser, metrics snapshot), `PerformanceMetrics` (APM, PPS, lines cleared, T-spins, combos), `HandicapModifiers` (garbage multiplier, delay modifier, messiness factor — per directed sender→receiver pair), `ModifierMatrix` (Map keyed by `${sender}→${receiver}` to `HandicapModifiers`), `TargetingBias` (weight distribution across opponents for auto-targeting), `HandicapSettings` (intensity, mode, targeting bias strength, optional knob toggles), and storage interface (`SkillStore`). These are pure type definitions with no runtime dependencies.
- **tests**: Type compilation checks, ensure interfaces are importable from both client and server paths.
- **files**: `shared/skill-types.ts`, `shared/handicap-types.ts`
- **depends_on**:

---

### PR: Skill rating storage layer
- **description**: Implement server-side persistence for player skill ratings. MVP uses a JSON file (`data/ratings.json`) with atomic read/write via temp-file-swap. Implements the `SkillStore` interface: `getPlayer(username)`, `upsertPlayer(profile)`, `getLeaderboard()`, `getMatchHistory(username, limit)`. Auto-creates the data file on first run. Includes a migration path comment for future SQLite upgrade.
- **tests**: CRUD operations on player profiles, concurrent write safety (temp-file swap), file creation on first access, match history append and retrieval with limit, leaderboard sorting by rating.
- **files**: `server/skill-store.ts`, `server/skill-store.test.ts`, `data/.gitkeep`
- **depends_on**: Skill rating types and interfaces

---

### PR: Glicko-2 rating algorithm
- **description**: Implement a simplified Glicko-2 rating calculation as a pure function module. Takes two `PlayerProfile`s and a match result, returns updated ratings for both. Handles the calibration period (first 10 games use higher RD for faster convergence). Exposes tunable constants (`INITIAL_RATING`, `INITIAL_RD`, `TAU`, `CALIBRATION_GAMES`) as a config object. No side effects — pure math.
- **tests**: Rating updates for win/loss, new player calibration (high RD = big swings), established player stability (low RD = small swings), symmetric updates (winner gains ~= loser loses), edge cases (identical ratings, maximum skill gap, RD decay over inactivity).
- **files**: `server/rating-algorithm.ts`, `server/rating-algorithm.test.ts`, `server/rating-config.ts`
- **depends_on**: Skill rating types and interfaces

---

### PR: Handicap calculation from skill gap
- **description**: Given two players' ratings, compute `HandicapModifiers` for a directed sender→receiver pair. Default mode ("boost"): when garbage flows from a stronger player to a weaker one, the receive multiplier is reduced (0.0–1.0) proportional to the rating gap via a smooth sigmoid curve. When garbage flows from weaker to stronger, the multiplier is always 1.0 (no boost). For 3+ player games, expose a function that takes all players' ratings and returns a full modifier matrix indexed by (sender, receiver). No artificial floor — multiplier goes to 0.0 for extreme gaps. Optional "symmetric" mode also reduces the stronger player's outgoing garbage. Delay and messiness modifiers computed but only applied when toggled on in lobby settings. Config constants control curve steepness. Pure functions, no server dependencies.
- **tests**: Equal ratings produce 1.0 for both directions, large gap produces near-zero multiplier for stronger→weaker direction, weaker→stronger always 1.0 in default mode, symmetric mode reduces both directions, modifier matrix correct for 3 players (6 directed pairs), config overrides change curve shape, optional knobs (delay/messiness) only populate when enabled.
- **files**: `server/handicap-calculator.ts`, `server/handicap-calculator.test.ts`, `server/handicap-config.ts`
- **depends_on**: Skill rating types and interfaces

---

### PR: Performance metrics collector
- **description**: Server-side module that tracks per-player performance metrics during a live game. Hooks into the game session's input/state stream to count actions (for APM), pieces placed (for PPS), line clears, T-spins, and combos. Produces a `PerformanceMetrics` snapshot when the game ends. Runs as a lightweight observer on the game session — no modifications to the game engine itself.
- **tests**: APM calculation from action timestamps, PPS from piece count and duration, T-spin counting, combo tracking, metrics reset between games, snapshot accuracy at game end.
- **files**: `server/metrics-collector.ts`, `server/metrics-collector.test.ts`
- **depends_on**: Skill rating types and interfaces, Server-authoritative game state (Plan 2)

---

### PR: Balancing middleware for garbage pipeline
- **description**: Implement `BalancingMiddleware` that wraps Plan 2's garbage manager. At game start, computes the full modifier matrix from all players' ratings (one entry per sender→receiver pair). When garbage is sent from player A to player B, looks up the (A, B) modifier and applies: (1) multiply garbage line count by the pair's multiplier (round probabilistically — e.g., 0.3x on 4 lines = 1 line 80% of the time, 2 lines 20%), (2) if delay modifier is enabled, adjust the garbage delay window for that pair, (3) if messiness modifier is enabled, adjust gap randomization. Multiplier can go all the way to 0.0, meaning garbage from that sender is completely absorbed. The middleware is injected between the garbage calculator and the network distribution layer. When handicap is disabled, passes through unchanged. **INPUT_REQUIRED: Human testing needed** to verify garbage feels right during actual play — automated tests confirm math but not game feel.
- **tests**: Garbage passthrough when handicap disabled, per-pair modifiers applied correctly (A→B differs from A→C), 0.0 multiplier blocks all garbage, probabilistic rounding averages correctly over many samples, modifier matrix recomputed correctly for player count, optional delay/messiness modifiers only apply when toggled on, integration test with mock garbage manager.
- **files**: `server/balancing-middleware.ts`, `server/balancing-middleware.test.ts`, `server/game-session.ts` (extend to inject middleware)
- **depends_on**: Handicap calculation from skill gap, Garbage network integration (Plan 2)

---

### PR: Skill-aware targeting bias
- **description**: Hook into Plan 2's auto-targeting system to bias garbage distribution based on skill ratings in 3+ player games. When a player hasn't manually selected a target, compute a weighted probability distribution across opponents: stronger players' garbage skews toward other strong players, weaker players' garbage skews toward their highest-rated opponent (biggest threat). The bias strength is configurable (0.0 = uniform random, 1.0 = fully skill-weighted). Manual target selection always overrides — if a player picks a target, their garbage goes there with no bias. In 2-player games this is a no-op. Implemented as a targeting strategy that Plan 2's garbage distribution calls into. **INPUT_REQUIRED: Human testing needed** in 3+ player games to verify targeting feels natural and not obviously rigged.
- **tests**: 2-player game bypasses targeting bias entirely, 3-player game with equal ratings produces uniform distribution, large skill gap biases toward expected targets, bias strength 0.0 produces uniform, bias strength 1.0 produces deterministic targeting, manual target override ignores bias completely, eliminated players excluded from targeting.
- **files**: `server/targeting-bias.ts`, `server/targeting-bias.test.ts`, `server/game-session.ts` (extend to wire targeting strategy)
- **depends_on**: Handicap calculation from skill gap, Garbage targeting strategies and attack power (Plan 2)

---

### PR: Post-game rating updates
- **description**: After a multiplayer game ends (win/loss detected), the server collects the final `PerformanceMetrics` for each player, runs the Glicko-2 algorithm to update ratings, stores the updated profiles and match result via `SkillStore`, and broadcasts updated ratings to all players in the room. Handles edge cases: disconnected players count as losses, 3+ player games update ratings pairwise (winner vs each loser).
- **tests**: 1v1 rating update after game end, 3+ player pairwise updates, disconnect counts as loss, metrics snapshot stored with match result, rating broadcast message format, no update when handicap is disabled.
- **files**: `server/post-game-handler.ts`, `server/post-game-handler.test.ts`, `server/game-session.ts` (extend with post-game hook)
- **depends_on**: Skill rating storage layer, Glicko-2 rating algorithm, Performance metrics collector, Win/loss detection and game-over screen (Plan 2)

---

### PR: Handicap settings in lobby UI
- **description**: Add handicap configuration to the lobby/waiting room UI. The room host can set: handicap intensity (off / light / standard / heavy — controls the sigmoid curve steepness, with heavier settings reaching lower multipliers faster for the same rating gap; no artificial floor on any setting), handicap mode (default "boost only" vs optional "symmetric" which also nerfs the stronger player's output), targeting bias strength slider (0.0–1.0, default 0.7), optional toggles for delay modifier and messiness modifier (both off by default), and rating visibility. Settings are sent to the server when the game starts and stored on the room. Show each player's current rating next to their name in the player list (when visibility is on). **INPUT_REQUIRED: Human testing needed** to verify lobby UI layout and settings interaction across multiple browser tabs.
- **tests**: Settings component renders all intensity options, default mode is "boost only", symmetric mode toggle works, delay/messiness toggles default to off, selection updates room config, rating display toggle works, settings sync to server on game start, non-host players see settings but can't change them.
- **files**: `src/ui/HandicapSettings.tsx`, `src/ui/HandicapSettings.css`, `src/ui/Lobby.tsx` (extend), `shared/protocol.ts` (add handicap settings messages), `server/handlers/lobby-handlers.ts` (extend)
- **depends_on**: Skill rating types and interfaces, Lobby UI (Plan 2)

---

### PR: In-game handicap indicator
- **description**: During a multiplayer game, display a small indicator near each player's board showing the active handicap modifier for garbage they receive. Show the multiplier (e.g., "0.6x" with a shield icon for a protected weaker player, "1.0x" neutral for unmodified). Use color coding: green tones for protection (multiplier < 1.0), neutral gray for 1.0x (no handicap). In 2-player games show a single value; in 3+ player show the average or strongest modifier. In symmetric mode, the stronger player's indicator also shows their reduced outgoing multiplier. The indicator updates if handicap changes mid-session (shouldn't happen normally, but defensive). **INPUT_REQUIRED: Human testing needed** to verify indicator placement doesn't obscure gameplay and is readable at a glance.
- **tests**: Indicator renders correct multiplier value, color coding matches modifier direction, neutral display at 1.0x, indicator hidden when handicap is off, correct display in symmetric mode showing both directions.
- **files**: `src/ui/HandicapIndicator.tsx`, `src/ui/HandicapIndicator.css`, `src/ui/GameBoard.tsx` (extend to include indicator)
- **depends_on**: Handicap settings in lobby UI, Canvas renderer for game board (Plan 1)

---

### PR: Stats screen with match history and skill progression
- **description**: Add a stats screen accessible from the main menu and post-game results. Shows: player's current rating and rank label (Beginner/Intermediate/Advanced/Expert based on rating thresholds), match history table (opponent, result, rating change, date — last 20 games), and a skill progression sparkline chart showing rating over time. Data fetched from server via a new REST endpoint (`GET /api/stats/:username`). **INPUT_REQUIRED: Human testing needed** to verify chart rendering, data display, and navigation flow.
- **tests**: Stats component renders with mock data, empty state for new players, match history pagination, sparkline renders correct data points, REST endpoint returns correct data shape.
- **files**: `src/ui/StatsScreen.tsx`, `src/ui/StatsScreen.css`, `src/ui/Sparkline.tsx`, `server/routes/stats-routes.ts`, `src/ui/App.tsx` (add stats route)
- **depends_on**: Skill rating storage layer, Project scaffolding with Vite + React + TypeScript (Plan 1)

---

### PR: Post-game results integration with ratings
- **description**: Extend Plan 2's game results screen to show rating changes after each match. Display each player's old rating, new rating, and delta (with +/- and color). Show a brief "New rating" animation. Include a link to the full stats screen. When handicap was active, show what the modifiers were for transparency. **INPUT_REQUIRED: Human testing needed** to verify rating animation, delta display, and navigation to stats screen.
- **tests**: Rating delta display with correct sign and color, animation triggers on mount, handicap modifier summary displays when active, hidden when handicap was off, link to stats screen navigates correctly.
- **files**: `src/ui/GameResults.tsx` (extend), `src/ui/RatingDelta.tsx`, `src/ui/RatingDelta.css`
- **depends_on**: Post-game rating updates, Stats screen with match history and skill progression, Win/loss detection and game-over screen (Plan 2)

---

### PR: End-to-end balancing integration and tuning config
- **description**: Wire all balancing components together in the server startup and game lifecycle. Ensure the full flow works: player joins with username → rating loaded → game starts with handicap modifiers → garbage modified in-flight → game ends → ratings updated → results shown. Add a `balancing-config.json` file with all tunable constants (rating params, handicap curves, intensity presets) so playtesting adjustments don't require code changes. Add integration tests covering the full lifecycle. **INPUT_REQUIRED: Human testing needed** — this PR requires multi-player playtesting to verify the system feels fair and fun. Tuning values will likely need adjustment after real play sessions.
- **tests**: Full lifecycle integration test (mock two players, play simulated games, verify ratings converge), config file loading and validation, graceful fallback if config file missing, handicap disabled mode bypasses all balancing logic.
- **files**: `server/balancing-init.ts`, `balancing-config.json`, `server/index.ts` (extend startup), `server/integration/balancing.integration.test.ts`
- **depends_on**: Balancing middleware for garbage pipeline, Skill-aware targeting bias, Post-game rating updates, Handicap settings in lobby UI
