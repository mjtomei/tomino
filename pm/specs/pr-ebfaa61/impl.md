# Implementation Spec: Glicko-2 Rating Algorithm

PR: pr-ebfaa61 | Depends on: pr-c7b0d7c (MERGED)

## 1. Requirements

### R1: Rating Config (`packages/server/src/rating-config.ts`)
Export a `GLICKO_CONFIG` object with tunable constants:
- `INITIAL_RATING` (1500) — default Glicko-2 starting rating
- `INITIAL_RD` (350) — default rating deviation for new players
- `INITIAL_VOLATILITY` (0.06) — default volatility
- `TAU` (0.5) — system constant controlling volatility change
- `CALIBRATION_GAMES` (10) — number of games in calibration period
- `CALIBRATION_RD_FLOOR` (200) — minimum RD during calibration to ensure big swings

Export a `RatingConfig` type for the config shape.

### R2: Rating Algorithm (`packages/server/src/rating-algorithm.ts`)
Pure function module implementing simplified Glicko-2. Core export:

```ts
function updateRatings(
  winner: PlayerProfile,
  loser: PlayerProfile,
  config?: Partial<RatingConfig>,
): { winner: PlayerProfile; loser: PlayerProfile }
```

- Takes two `PlayerProfile`s (from `@tetris/shared`) and a match result (winner/loser implied by parameter names)
- Returns new `PlayerProfile` objects with updated `rating`, `ratingDeviation`, `volatility`, and `gamesPlayed`
- No mutations — returns new objects
- No side effects — pure math

Internal implementation follows Glicko-2 steps:
1. Convert ratings to Glicko-2 scale (μ, φ)
2. Compute expected outcome g(φ) and E(μ, μ_j, φ_j)
3. Compute estimated variance v
4. Compute volatility update σ' via iterative algorithm (Illinois method)
5. Update φ* and φ' (pre-rating and new RD)
6. Update μ' (new rating)
7. Convert back to Glicko scale

### R3: Calibration Period
Players with `gamesPlayed < CALIBRATION_GAMES` use a higher RD floor (`CALIBRATION_RD_FLOOR`) to ensure fast convergence. After calculation, if a player is still in calibration, their RD is clamped to at least `CALIBRATION_RD_FLOOR`.

### R4: Tests (`packages/server/src/__tests__/rating-algorithm.test.ts`)
Test cases:
- Win/loss: winner rating goes up, loser rating goes down
- New player calibration: high RD produces large rating swings
- Established player stability: low RD produces small rating swings
- Symmetric updates: winner gains approximately what loser loses (at equal ratings/RDs)
- Edge case — identical ratings: both players at same rating, symmetric outcome
- Edge case — maximum skill gap: large rating difference, winner gains little
- Edge case — RD decay over inactivity: RD increases when not playing (pre-period RD update)

## 2. Implicit Requirements

- **IR1**: Import `PlayerProfile` from `@tetris/shared` — the type is already exported from `packages/shared/src/index.ts`
- **IR2**: `gamesPlayed` must be incremented by 1 for both players in the result
- **IR3**: The function must handle the case where `ratingDeviation` is already at maximum (350) — new player scenario
- **IR4**: Volatility must remain bounded (no NaN, no negative values, no explosion)
- **IR5**: Config must merge with defaults — `Partial<RatingConfig>` overlay on `GLICKO_CONFIG`
- **IR6**: TypeScript strict mode compliance — `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`

## 3. Ambiguities

### A1: RD Decay Over Inactivity
**Resolution**: The Glicko-2 algorithm naturally increases RD over time via the pre-rating period step: `φ* = sqrt(φ² + σ²)`. Since we process one match at a time (not rating periods), we apply this step once per match. True time-based decay is deferred to a future PR. The test for "RD decay over inactivity" will verify that `φ*` correctly inflates RD before the update calculation.

### A2: Volatility Algorithm — Illinois vs Bisection
**Resolution**: Use the Illinois variant of the regula falsi method as recommended in the Glicko-2 paper (Mark Glickman, 2013). It converges faster than bisection.

### A3: Draw Handling
**Resolution**: Tetris matches have a clear winner/loser — no draws. The function signature (`winner`/`loser`) makes this explicit. No draw support needed.

### A4: File Paths — `server/` vs `packages/server/src/`
**Resolution**: The task description says `server/rating-algorithm.ts` but the monorepo structure places server source in `packages/server/src/`. Files will be created at:
- `packages/server/src/rating-config.ts`
- `packages/server/src/rating-algorithm.ts`
- `packages/server/src/__tests__/rating-algorithm.test.ts`

## 4. Edge Cases

- **EC1**: Both players at minimum rating (or any equal rating) — the algorithm should produce symmetric but opposite changes
- **EC2**: Player with RD = 350 (brand new) vs player with RD = 50 (very established) — the new player should swing much more
- **EC3**: Volatility clamping — the iterative σ' algorithm must converge; set a max iteration count (50) as safety
- **EC4**: Numerical precision — Glicko-2 scale conversion uses factor 173.7178 (from the paper). Use this constant, not a rounded value
