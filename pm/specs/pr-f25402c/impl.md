# Spec: Skill-aware targeting bias

## Requirements

1. **New targeting bias module** (`packages/server/src/targeting-bias.ts`): Given a sender, a list of alive opponents, and their skill ratings, compute a weighted probability distribution that determines which opponent receives garbage.

2. **Bias logic for strong players**: A strong player's garbage should skew toward other strong players (distribute proportionally to opponents' ratings).

3. **Bias logic for weak players**: A weak player's garbage should skew toward their highest-rated opponent (biggest threat).

4. **Configurable bias strength** (0.0–1.0): Interpolates between uniform random (0.0) and fully skill-weighted (1.0). At 0.0, every opponent has equal probability. At 1.0, the distribution is fully determined by skill weights.

5. **2-player games are a no-op**: When there's only one opponent, the bias is irrelevant — all garbage goes to the single opponent regardless.

6. **Manual target override**: If a player has selected a manual target (via Plan 2's `manualStrategy`), their garbage goes directly to that target with no bias applied.

7. **Integration with existing targeting system**: The bias applies as a layer within `processGarbageFor` in `GameSession` (`packages/server/src/game-session.ts`). It wraps/augments the strategy resolution so that when auto-targeting is active (random/attackers/kos strategies), the target selection is biased by skill ratings.

8. **Eliminated players excluded**: Dead/game-over players must not appear in the targeting distribution.

9. **Skill ratings sourced from room state**: `RoomState.playerRatings` (keyed by PlayerId) is already populated on room join. This data must be passed into `GameSessionConfig` so targeting-bias can use it.

## Implicit Requirements

- The `TargetingContext` interface (in `packages/shared/src/targeting-types.ts`) may need extension to carry skill ratings or the bias result, OR the bias can be applied as a pre-processing step before invoking the inner strategy.
- The bias module must be deterministic given a fixed RNG seed — it should accept an `rng: () => number` parameter for testability.
- The bias should not interact with the attack power multiplier (that's a separate concern applied to line count, not target selection).
- The handicap modifier matrix (garbage reduction) is orthogonal — it applies *after* targeting decides who receives garbage. Bias decides *who* gets it; modifiers decide *how much* arrives.

## Ambiguities

1. **What defines "strong" vs "weak"?** Resolution: Use the median (or mean) rating of alive players as the dividing line. Players above the median use the "strong" distribution (weight proportional to opponent ratings); players at or below use the "weak" distribution (weight concentrated on highest-rated opponent).

2. **How does bias interact with attackers/kos strategies?** Resolution: The bias is an *alternative targeting resolution* that replaces the random/attackers/kos strategy when auto-targeting is active. Actually — re-reading the task: "bias garbage distribution based on skill ratings." The simplest interpretation: the bias module IS a targeting strategy (as stated: "Implemented as a targeting strategy"). It produces a single target via weighted random selection from the probability distribution. When a player uses random/attackers/kos, the skill-aware bias overrides target selection. When using manual, no override.

3. **"Strongest player's garbage skews toward other strong players"** — does this mean the strongest player targets only other strong players? Resolution: No, it means the probability distribution is weighted — stronger opponents have higher weight, but weaker opponents can still be targeted with lower probability. The bias strength parameter controls how extreme this weighting is.

4. **Integration point**: The task says "Implemented as a targeting strategy that Plan 2's garbage distribution calls into." This means `targeting-bias.ts` exports a `TargetingStrategy` implementation that wraps the existing strategies and applies skill-based weighting. The game session would use this wrapping strategy when skill ratings are available and there are 3+ players.

## Edge Cases

1. **All players have equal ratings**: Distribution should be uniform regardless of bias strength (since all weights would be equal).

2. **One opponent much stronger than others**: Weak player's garbage heavily biases toward that opponent; strong opponent's garbage distributes among other strong players (if any) or falls back to uniform-ish.

3. **Player eliminated mid-game**: Their rating is removed from the distribution. Remaining distributions re-normalize.

4. **Ratings unavailable**: If `playerRatings` is not provided (older rooms, guests without profiles), default to uniform targeting (bias has no effect).

5. **Bias strength mid-game**: The bias strength is a configuration constant, not something that changes during a game.

## Design

### `packages/server/src/targeting-bias.ts`

```typescript
export interface TargetingBiasConfig {
  /** Player skill ratings keyed by PlayerId. */
  ratings: Record<PlayerId, number>;
  /** Bias strength: 0.0 = uniform, 1.0 = fully skill-weighted. */
  biasStrength: number;
}

/**
 * Compute targeting weights for a sender against alive opponents.
 * Returns a probability distribution (weights summing to 1.0).
 */
export function computeTargetingWeights(
  sender: PlayerId,
  opponents: PlayerId[],
  config: TargetingBiasConfig,
): Record<PlayerId, number>;

/**
 * Select a target from the weighted distribution using the given RNG.
 */
export function selectWeightedTarget(
  weights: Record<PlayerId, number>,
  rng: () => number,
): PlayerId;

/**
 * A TargetingStrategy that applies skill-based bias.
 * Falls through to uniform when config is absent or 2-player.
 */
export function createSkillBiasStrategy(
  config: TargetingBiasConfig,
): TargetingStrategy;
```

### Integration in `GameSession`

In `processGarbageFor`, when the sender's strategy is NOT manual, wrap the target resolution with skill-aware bias if:
- There are 3+ alive players
- Player ratings are available
- Bias strength > 0

### Test file: `packages/server/src/__tests__/targeting-bias.test.ts`

Tests per the task description:
- 2-player game bypasses targeting bias entirely
- 3-player game with equal ratings produces uniform distribution
- Large skill gap biases toward expected targets
- Bias strength 0.0 produces uniform
- Bias strength 1.0 produces deterministic targeting
- Manual target override ignores bias completely
- Eliminated players excluded from targeting
