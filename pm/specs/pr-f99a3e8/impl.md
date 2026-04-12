# Spec: Investigate and fix NES classic mode level progression

## Bug Analysis

**Root cause**: In `packages/shared/src/engine/engine.ts:160`, the `TetrisEngine` constructor defaults `startLevel` to `1`:

```ts
const startLevel = options.startLevel ?? 1;
```

Neither `StartScreen` nor `SoloGameShell` passes a `startLevel` when constructing the engine. The `RuleSet` type has no `startLevel` field. So every game — classic NES included — starts at level 1.

NES Tetris starts at level 0 by default. This means:
- Level display shows 1 instead of 0 at game start
- Gravity uses `NES_FRAMES[1]` (43 frames, ~710ms) instead of `NES_FRAMES[0]` (48 frames, ~793ms)
- Scoring multiplier is `(1+1) = 2` instead of `(0+1) = 1` for first clears
- Level-up threshold is `firstLevelUpThreshold(1) = 20 lines` instead of `firstLevelUpThreshold(0) = 10 lines`

The engine scoring logic (`scoring-nes.ts`) and gravity table (`gravity.ts`) are correct — the bug is that the wrong `startLevel` is wired in.

## Requirements

### R1: Add `startLevel` to `RuleSet`
- **File**: `packages/shared/src/engine/types.ts` — add `startLevel: number` field to the `RuleSet` interface
- **File**: `packages/shared/src/engine/rulesets.ts` — set `startLevel: 0` in `classicRuleSet()`, `startLevel: 1` in `modernRuleSet()`
- This allows each preset to carry its own default starting level

### R2: Wire `startLevel` from `RuleSet` into `TetrisEngine`
- **File**: `packages/shared/src/engine/engine.ts:160` — change default from `1` to `options.ruleSet.startLevel`:
  ```ts
  const startLevel = options.startLevel ?? options.ruleSet.startLevel;
  ```
- Explicit `options.startLevel` still takes precedence (for future level-select UI or tests)

### R3: E2E test for classic NES marathon starting at level 0
- **File**: `e2e/single-player.spec.ts` (new)
- Test: `setupSoloGame(page, { preset: "classic", mode: "marathon" })`, then `readScoreDisplay(page)` and assert `level === 0`

## Implicit Requirements

### IR1: `CustomRuleSetPanel` must handle `startLevel`
- `packages/client/src/ui/CustomRuleSetPanel.tsx` — when the custom panel spreads `{ ...ruleSet, ...overrides }`, the `startLevel` field from the base preset is preserved automatically. No explicit UI control is needed for `startLevel` in the custom panel right now (it will carry the base preset's value).

### IR2: Existing tests must remain green
- `packages/client/src/__tests__/GameShell.test.tsx` uses `defaultScoring()` with `startLevel: 1` — this is fine since it constructs state directly, not via the engine.
- `packages/shared/src/engine/engine.test.ts` — any engine test using `modernRuleSet()` will now get `startLevel: 1` from the rule set (same as the previous default). Tests using `classicRuleSet()` will now get `startLevel: 0` from the rule set — which is the correct behavior.
- `packages/shared/src/engine/rulesets.test.ts` — if this tests the shape of rule sets, it will need updating for the new field.

### IR3: Server-side engine construction must pass through correctly
- `packages/server/src/game-session.ts` and related files construct `TetrisEngine` with a `RuleSet`. The new `startLevel` field on the rule set will be picked up automatically by the engine constructor change in R2.

### IR4: Multiplayer mode (modern rule set) unaffected
- Multiplayer uses `modernRuleSet()` which will have `startLevel: 1`, matching the current behavior exactly.

## Ambiguities

### A1: Should `startLevel` on `RuleSet` be optional?
**Resolution**: Make it required. Both presets define it, and `customRuleSet()` spreads from a base that always has it. A required field prevents accidental omission and avoids needing a fallback default.

### A2: Should the `CustomRuleSetPanel` expose a `startLevel` control?
**Resolution**: Not in this PR. The custom panel currently lets users pick scoring/gravity system which implies a natural starting level. A start-level selector is a separate feature. The custom panel preserves `startLevel` from whichever base preset was selected.

## Edge Cases

### E1: `customRuleSet()` with partial overrides
`customRuleSet(base, overrides)` uses spread, so `startLevel` from the base is preserved unless explicitly overridden. No change needed.

### E2: Game harness in tests (`packages/shared/src/__test-utils__/game-harness.ts`)
If the game harness constructs engines, the `startLevel` from the rule set flows through. Existing tests that pass a rule set will get the correct level.

### E3: `rulesets.test.ts` snapshot/shape tests
The new `startLevel` field must appear in any test that validates the shape of `classicRuleSet()` or `modernRuleSet()`. These tests need updating.
