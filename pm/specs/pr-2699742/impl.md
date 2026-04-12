# Implementation Spec: End-to-end balancing integration and tuning config

## Requirements

### R1: Resolve merge conflicts from dependency PRs
Three files have unresolved merge conflicts from the concurrent merges of rematch-flow (pr-3f9112e) and post-game-rating-updates (pr-c2fef7a):
- `packages/shared/src/protocol.ts` — `ServerMessage` union and `SERVER_MESSAGE_TYPES` array both need `S2C_RematchUpdate` AND `S2C_RatingUpdate`
- `packages/server/src/handlers/game-handlers.ts` — needs both `clearRematchVotes` import and `handlePostGame` import; needs both the rematch-clearing logic and the `isRanked` flag
- `packages/server/src/game-session.ts` — needs both `createSkillBiasStrategy` import and `MetricsCollector` import

### R2: Create `balancing-config.json` with all tunable constants
A single config file at the project root containing:
- **Rating params** from `rating-config.ts`: `INITIAL_RATING` (1500), `INITIAL_RD` (350), `INITIAL_VOLATILITY` (0.06), `TAU` (0.5), `CALIBRATION_GAMES` (10), `CALIBRATION_RD_FLOOR` (200)
- **Handicap curve params** from `handicap-config.ts`: `steepness` (0.01), `midpoint` (400), `delayScale` (0.5), `messinessScale` (0.3), `symmetricFactor` (0.5)
- **Intensity presets** from `handicap-config.ts`: `off` (0), `light` (0.5), `standard` (1.0), `heavy` (1.5)
- **Default handicap settings**: `intensity` ("off"), `mode` ("boost"), `targetingBiasStrength` (0.7), `delayEnabled` (false), `messinessEnabled` (false)

### R3: Create `server/balancing-init.ts` — config loader and initializer
- Load and validate `balancing-config.json` at startup
- Export a typed `BalancingConfig` object consumed by existing modules
- Graceful fallback: if config file is missing, use hardcoded defaults and log a warning
- Validation: reject invalid values (negative ratings, out-of-range multipliers, unknown intensity keys) with clear error messages

### R4: Wire config into server startup (`server/index.ts`)
- Import and call the balancing init module
- Pass loaded config to `createWebSocketServer` context so game handlers can use it
- Log config summary at startup

### R5: Wire config through game lifecycle
- `game-handlers.ts`: Pass loaded `HandicapCurveConfig` to `computeModifierMatrix()` (currently uses default)
- `game-handlers.ts`: Pass loaded `RatingConfig` through to `handlePostGame()` (currently uses hardcoded `GLICKO_CONFIG`)
- `rating-algorithm.ts` already accepts optional `config` param — just need to thread it through
- `handicap-calculator.ts` already accepts optional `config` param — just need to thread it through

### R6: Handicap-disabled mode bypasses all balancing logic
When `intensity === "off"` (already the default):
- No modifier matrix computed (already true in `game-handlers.ts:87`)
- `BalancingMiddleware` operates in passthrough mode (already true when `modifiers` undefined)
- Targeting bias not activated (already true — `biasStrength` defaults to 0)
- Verify this full bypass path works end-to-end in integration tests

### R7: Integration tests
File: `packages/server/src/__tests__/balancing.integration.test.ts`
- **Full lifecycle test**: Mock two players, simulate game, verify ratings converge
- **Config loading and validation**: Valid config, invalid config, partial config
- **Graceful fallback**: Missing config file uses defaults
- **Handicap disabled bypass**: With `intensity: "off"`, verify no modifiers applied, passthrough garbage, no rating bias

## Implicit Requirements

### IR1: Config changes don't require server restart
The task says "playtesting adjustments don't require code changes." The config file itself achieves this — but the server currently has no hot-reload mechanism. **Resolution**: Load config at startup only (sufficient for MVP — restart between playtest rounds is acceptable). Hot-reload is out of scope.

### IR2: Existing tests must continue passing
All changes must be backward-compatible with existing test suites. The existing modules that accept optional config params will continue using their hardcoded defaults when called without the config arg.

### IR3: `handlePostGame` must receive `RatingConfig` from loaded config
`updateRatings()` in `rating-algorithm.ts` already accepts `Partial<RatingConfig>`. The `handlePostGame` function needs a way to receive the config. Current signature: `handlePostGame(result, store, broadcastToRoom)`. Will need to extend with an optional config param.

### IR4: Type safety for config file
The config JSON must be validated at load time and mapped to existing TypeScript interfaces (`RatingConfig`, `HandicapCurveConfig`, intensity presets).

## Ambiguities

### A1: Config file location
**Question**: Where should `balancing-config.json` live?
**Resolution**: Place it at the project root (alongside `package.json`), but load it relative to `DATA_DIR` (consistent with `ratings.json`). This lets different deployments override it. Fall back to bundled defaults if not found.

### A2: Should `handlePostGame` always run or only when ranked?
**Current state**: `game-handlers.ts` already guards with `isRanked && ctx.skillStore`. The `isRanked` flag is `settings.intensity !== "off"`. **Resolution**: Keep this — ratings only update for handicap-enabled (ranked) games.

### A3: Config schema strictness
**Question**: Should unknown keys in config be rejected or ignored?
**Resolution**: Ignore unknown keys (forward-compatible). Only validate known keys for type and range.

## Edge Cases

### E1: Config file has partial overrides
If config only specifies `rating.TAU` but not other rating params, the unspecified params should use defaults. Use deep-merge with defaults.

### E2: All players at default rating (1500)
When all players have identical ratings, the handicap modifier matrix should produce identity modifiers (multiplier=1.0 for all pairs). The sigmoid formula already handles this: gap=0 → multiplier = 1/(1+exp(steepness*(0-midpoint))) ≈ 1.0 when midpoint=400.

### E3: Single-player game
Should not compute modifiers or update ratings. The existing guard `playerIds.length >= 3` for targeting bias and the pairwise nature of rating updates handles this, but the integration test should verify 1-player is a no-op.

### E4: Player with no stored profile joins a rated game
`post-game-handler.ts` already creates a default profile with `GLICKO_CONFIG` defaults. With the config file, this should use the loaded `INITIAL_RATING` etc. instead.
