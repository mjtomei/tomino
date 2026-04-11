# Implementation Spec: Handicap Calculation from Skill Gap

## Requirements

### R1: Pairwise Handicap Computation
Given two `PlayerProfile.rating` values (from `packages/shared/src/skill-types.ts`), compute a `HandicapModifiers` object (from `packages/shared/src/handicap-types.ts`) for the directed sender→receiver pair.

**File:** `packages/server/src/handicap-calculator.ts`
**Function:** `computePairHandicap(senderRating: number, receiverRating: number, settings: HandicapSettings, config?: HandicapCurveConfig): HandicapModifiers`

### R2: Default "boost" Mode
- When garbage flows from a **stronger** player (higher rating) to a **weaker** player (lower rating), `garbageMultiplier` is reduced (0.0–1.0) proportional to the rating gap via a smooth sigmoid curve.
- When garbage flows from a **weaker** player to a **stronger** player, `garbageMultiplier` is always 1.0 (no modification).
- No artificial floor — multiplier approaches 0.0 for extreme gaps.

### R3: Symmetric Mode
When `HandicapSettings.mode === "symmetric"`, the stronger player's outgoing garbage is also reduced. Both directions get a reduced multiplier proportional to the gap (the stronger→weaker direction still gets reduced more than weaker→stronger).

### R4: Modifier Matrix for 3+ Players
Expose a function that takes all players' ratings and returns a full `ModifierMatrix` (from `packages/shared/src/handicap-types.ts`) indexed by `ModifierMatrixKey` (`${sender}→${receiver}`).

**Function:** `computeModifierMatrix(players: Array<{username: string; rating: number}>, settings: HandicapSettings, config?: HandicapCurveConfig): ModifierMatrix`

This produces N*(N-1) directed pairs for N players.

### R5: Delay and Messiness Modifiers
`delayModifier` and `messinessFactor` are computed based on the skill gap but only populated with non-1.0 values when `HandicapSettings.delayEnabled` / `HandicapSettings.messinessEnabled` are `true`. When disabled, they default to 1.0.

### R6: Configurable Curve
Config constants control the sigmoid curve steepness and midpoint.

**File:** `packages/server/src/handicap-config.ts`
**Type:** `HandicapCurveConfig` with fields:
- `steepness`: controls sigmoid slope (default ~0.005–0.01 per rating point)
- `midpoint`: rating gap at which multiplier = 0.5 (default ~400)
- `delayScale`: how much delay scales with gap (default factor)
- `messinessScale`: how much messiness scales with gap (default factor)

### R7: Pure Functions, No Server Dependencies
All functions are pure — no imports from ws-server, express, or any stateful module. Only imports from `@tetris/shared` and local config.

### R8: Tests
**File:** `packages/server/src/__tests__/handicap-calculator.test.ts`

Test cases:
1. Equal ratings → all multipliers 1.0 for both directions
2. Large gap → near-zero `garbageMultiplier` for stronger→weaker
3. Weaker→stronger always 1.0 in boost mode
4. Symmetric mode reduces both directions
5. Modifier matrix correct for 3 players (6 directed pairs)
6. Config overrides change curve shape
7. Delay/messiness only populated when enabled

## Implicit Requirements

### IR1: Sigmoid Curve Function
Need a sigmoid function: `multiplier = 1 / (1 + exp(steepness * (gap - midpoint)))` or similar. The curve must:
- Return 1.0 when gap = 0
- Approach 0.0 for large positive gaps
- Be smooth and monotonically decreasing

A better formulation: `multiplier = 1 - sigmoid(gap)` where `sigmoid(gap) = 1 / (1 + exp(-steepness * (gap - midpoint)))`. At gap=0 with midpoint=400, this gives a value close to 1.0. At gap=midpoint, gives 0.5. At large gaps, approaches 0.0.

Simplified: `multiplier = 1 / (1 + exp(steepness * (gap - midpoint)))` where gap = senderRating - receiverRating (positive when sender is stronger).

### IR2: HandicapSettings Defaults
The function should work with sensible defaults for `HandicapSettings` fields. `delayEnabled` and `messinessEnabled` default to `false` (optional fields).

### IR3: Intensity Scaling
`HandicapSettings.intensity` ("off", "light", "standard", "heavy") should scale the effect. "off" → all 1.0 multipliers. Different intensities should scale the sigmoid's effect.

### IR4: Export from Server Package
Functions should be exported so they can be imported by other server modules.

## Ambiguities

### A1: Sigmoid Parameterization — **[RESOLVED]**
The exact sigmoid formula and defaults. **Resolution:** Use `multiplier = 1 / (1 + exp(steepness * (gap - midpoint)))` with defaults steepness=0.01, midpoint=400. This gives: gap=0 → ~0.98 (close to 1.0), gap=400 → 0.5, gap=800 → ~0.02 (close to 0.0). For equal ratings, we'll explicitly return 1.0 when gap=0.

### A2: Symmetric Mode Reduction for Weaker Player — **[RESOLVED]**
How much does the weaker player's garbage get reduced in symmetric mode? **Resolution:** Use the same sigmoid but with a reduced gap. The weaker→stronger multiplier in symmetric mode = `1 / (1 + exp(steepness * (gap * symmetricFactor - midpoint)))` where `symmetricFactor` is ~0.5, meaning the weaker player's outgoing garbage is reduced less aggressively than the stronger player's.

### A3: Intensity Mapping — **[RESOLVED]**
How intensity maps to curve parameters. **Resolution:** Intensity scales the effective steepness: off=0 (no effect), light=0.5x, standard=1.0x, heavy=1.5x of the configured steepness.

### A4: Delay/Messiness Computation — **[RESOLVED]**
How delay and messiness modifiers are computed from the gap. **Resolution:** Use linear scaling capped at reasonable bounds. `delayModifier = 1.0 + delayScale * normalizedGap` (stronger player's garbage is delayed more for weaker receivers). `messinessFactor = 1.0 - messinessScale * normalizedGap` (cleaner garbage for weaker receivers, clamped to [0.0, 1.0]).

### A5: File Paths — **[RESOLVED]**
Task says `server/handicap-calculator.ts` but actual project structure is `packages/server/src/`. **Resolution:** Use `packages/server/src/handicap-calculator.ts`, `packages/server/src/handicap-config.ts`, `packages/server/src/__tests__/handicap-calculator.test.ts`.

## Edge Cases

### E1: Equal Ratings
Gap = 0. Both directions should produce multiplier = 1.0 exactly (not ~0.98). Special-case this.

### E2: Intensity "off"
Should produce identity modifiers (all 1.0) regardless of gap.

### E3: Single Player in Matrix
N=1 → empty matrix (no pairs). Should handle gracefully.

### E4: Two Players in Matrix
N=2 → exactly 2 directed pairs.

### E5: Negative Rating Gap
When receiver is stronger, gap is negative. In boost mode, the multiplier clamps to 1.0 (no reduction for weaker→stronger).

### E6: Very Large Gaps (1000+)
Multiplier should approach 0.0 without underflow. JavaScript handles this fine with standard Math.exp.

### E7: Config with Zero Steepness
If steepness=0, sigmoid is flat at 0.5 at midpoint. Should still work mathematically.
