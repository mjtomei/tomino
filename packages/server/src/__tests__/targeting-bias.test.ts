import { describe, it, expect } from "vitest";
import {
  computeTargetingWeights,
  selectWeightedTarget,
  createSkillBiasStrategy,
  type TargetingBiasConfig,
} from "../targeting-bias.js";
import type { TargetingContext } from "@tetris/shared";

// ---------------------------------------------------------------------------
// computeTargetingWeights
// ---------------------------------------------------------------------------

describe("computeTargetingWeights", () => {
  it("returns uniform weights when bias strength is 0.0", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 2000, p2: 1500, p3: 1000 },
      biasStrength: 0.0,
    };
    const weights = computeTargetingWeights("p1", ["p2", "p3"], config);
    expect(weights.p2).toBeCloseTo(0.5);
    expect(weights.p3).toBeCloseTo(0.5);
  });

  it("returns uniform weights when all players have equal ratings", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 1500, p2: 1500, p3: 1500, p4: 1500 },
      biasStrength: 1.0,
    };
    const weights = computeTargetingWeights("p1", ["p2", "p3", "p4"], config);
    // All equal ratings → proportional weights are equal → uniform
    expect(weights.p2).toBeCloseTo(1 / 3);
    expect(weights.p3).toBeCloseTo(1 / 3);
    expect(weights.p4).toBeCloseTo(1 / 3);
  });

  it("strong sender biases toward higher-rated opponents", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 2000, p2: 1800, p3: 1200 },
      biasStrength: 1.0,
    };
    // p1 is strongest (above median of [1200, 1800, 2000] = 1800)
    const weights = computeTargetingWeights("p1", ["p2", "p3"], config);
    // Rating-proportional: p2=1800, p3=1200 → p2 gets 1800/3000=0.6, p3 gets 0.4
    expect(weights.p2).toBeCloseTo(1800 / 3000);
    expect(weights.p3).toBeCloseTo(1200 / 3000);
    expect(weights.p2!).toBeGreaterThan(weights.p3!);
  });

  it("weak sender concentrates weight on highest-rated opponent", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 1000, p2: 2000, p3: 1500 },
      biasStrength: 1.0,
    };
    // p1 is weakest (below median of [1000, 1500, 2000] = 1500)
    const weights = computeTargetingWeights("p1", ["p2", "p3"], config);
    // Highest threat is p2 → all skill weight goes to p2
    expect(weights.p2).toBeCloseTo(1.0);
    expect(weights.p3).toBeCloseTo(0.0);
  });

  it("intermediate bias strength blends uniform and skill weights", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 1000, p2: 2000, p3: 1500 },
      biasStrength: 0.5,
    };
    const weights = computeTargetingWeights("p1", ["p2", "p3"], config);
    // uniform = 0.5 each; skill = [1.0, 0.0]
    // final: p2 = 0.5*0.5 + 0.5*1.0 = 0.75, p3 = 0.5*0.5 + 0.5*0.0 = 0.25
    expect(weights.p2).toBeCloseTo(0.75);
    expect(weights.p3).toBeCloseTo(0.25);
  });

  it("returns empty record for no opponents", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 1500 },
      biasStrength: 1.0,
    };
    const weights = computeTargetingWeights("p1", [], config);
    expect(Object.keys(weights)).toHaveLength(0);
  });

  it("uses default 1500 for missing ratings", () => {
    const config: TargetingBiasConfig = {
      ratings: {}, // no ratings at all
      biasStrength: 1.0,
    };
    // All default to 1500 → equal → uniform
    const weights = computeTargetingWeights("p1", ["p2", "p3"], config);
    expect(weights.p2).toBeCloseTo(0.5);
    expect(weights.p3).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// selectWeightedTarget
// ---------------------------------------------------------------------------

describe("selectWeightedTarget", () => {
  it("selects based on cumulative weight threshold", () => {
    const weights = { p2: 0.3, p3: 0.7 };
    // rng=0.2 → within p2's range [0, 0.3)
    expect(selectWeightedTarget(weights, () => 0.2)).toBe("p2");
    // rng=0.5 → within p3's range [0.3, 1.0)
    expect(selectWeightedTarget(weights, () => 0.5)).toBe("p3");
  });

  it("returns undefined for empty weights", () => {
    expect(selectWeightedTarget({}, () => 0.5)).toBeUndefined();
  });

  it("handles floating-point edge case (rng = 0.9999)", () => {
    const weights = { p2: 0.5, p3: 0.5 };
    const result = selectWeightedTarget(weights, () => 0.9999);
    expect(result).toBe("p3");
  });
});

// ---------------------------------------------------------------------------
// createSkillBiasStrategy (integration)
// ---------------------------------------------------------------------------

describe("createSkillBiasStrategy", () => {
  function makeContext(overrides: Partial<TargetingContext> = {}): TargetingContext {
    return {
      linesToSend: 4,
      rng: () => 0.0,
      ...overrides,
    };
  }

  it("2-player game bypasses targeting bias entirely", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 2000, p2: 1000 },
      biasStrength: 1.0,
    };
    const strategy = createSkillBiasStrategy(config);
    const result = strategy.resolveTargets("p1", ["p1", "p2"], makeContext());
    // Only one opponent → direct targeting, no bias calculation needed
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("p2");
    expect(result[0].lines).toBe(4);
  });

  it("3-player game with equal ratings produces uniform distribution", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 1500, p2: 1500, p3: 1500 },
      biasStrength: 1.0,
    };
    const strategy = createSkillBiasStrategy(config);

    // With rng=0.0 should pick first opponent
    const r1 = strategy.resolveTargets("p1", ["p1", "p2", "p3"], makeContext({ rng: () => 0.0 }));
    expect(r1).toHaveLength(1);
    expect(r1[0].playerId).toBe("p2");

    // With rng=0.9 should pick last opponent
    const r2 = strategy.resolveTargets("p1", ["p1", "p2", "p3"], makeContext({ rng: () => 0.9 }));
    expect(r2).toHaveLength(1);
    expect(r2[0].playerId).toBe("p3");
  });

  it("large skill gap biases toward expected targets", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 1000, p2: 2500, p3: 1200 },
      biasStrength: 1.0,
    };
    const strategy = createSkillBiasStrategy(config);

    // p1 is weak → concentrates on highest-rated (p2)
    // With bias=1.0, weight on p2=1.0, p3=0.0
    // rng=0.5 still picks p2
    const result = strategy.resolveTargets(
      "p1",
      ["p1", "p2", "p3"],
      makeContext({ rng: () => 0.5 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("p2");
  });

  it("bias strength 0.0 produces uniform distribution", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 2000, p2: 1000, p3: 1500 },
      biasStrength: 0.0,
    };
    const strategy = createSkillBiasStrategy(config);

    // rng=0.0 → first; rng=0.99 → last (uniform 50/50)
    const r1 = strategy.resolveTargets("p1", ["p1", "p2", "p3"], makeContext({ rng: () => 0.0 }));
    expect(r1[0].playerId).toBe("p2");

    const r2 = strategy.resolveTargets("p1", ["p1", "p2", "p3"], makeContext({ rng: () => 0.99 }));
    expect(r2[0].playerId).toBe("p3");
  });

  it("bias strength 1.0 produces deterministic targeting for weak player", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 800, p2: 2200, p3: 1400 },
      biasStrength: 1.0,
    };
    const strategy = createSkillBiasStrategy(config);

    // p1 is weak → all weight on p2 (highest threat)
    // Any rng value should pick p2
    for (const rngVal of [0.0, 0.25, 0.5, 0.75, 0.99]) {
      const result = strategy.resolveTargets(
        "p1",
        ["p1", "p2", "p3"],
        makeContext({ rng: () => rngVal }),
      );
      expect(result[0].playerId).toBe("p2");
    }
  });

  it("manual target override ignores bias (tested at integration level)", () => {
    // The manual override happens in GameSession.processGarbageFor, not in the
    // bias strategy itself. When strategy is "manual", createSkillBiasStrategy
    // is not used. This test verifies the strategy itself doesn't interfere with
    // context.manualTarget (it doesn't read it).
    const config: TargetingBiasConfig = {
      ratings: { p1: 2000, p2: 1000, p3: 1500 },
      biasStrength: 1.0,
    };
    const strategy = createSkillBiasStrategy(config);
    // Even with manualTarget set, the bias strategy ignores it and uses weights
    const result = strategy.resolveTargets(
      "p1",
      ["p1", "p2", "p3"],
      makeContext({ manualTarget: "p3", rng: () => 0.0 }),
    );
    // Strategy doesn't look at manualTarget — it uses weights
    expect(result).toHaveLength(1);
  });

  it("eliminated players excluded from targeting", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 1500, p2: 2000, p3: 1000 },
      biasStrength: 1.0,
    };
    const strategy = createSkillBiasStrategy(config);

    // p3 eliminated — only p2 in players list
    const result = strategy.resolveTargets(
      "p1",
      ["p1", "p2"],
      makeContext({ rng: () => 0.5 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("p2");
    expect(result[0].lines).toBe(4);
  });

  it("returns empty when no opponents", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 1500 },
      biasStrength: 1.0,
    };
    const strategy = createSkillBiasStrategy(config);
    const result = strategy.resolveTargets("p1", ["p1"], makeContext());
    expect(result).toHaveLength(0);
  });

  it("returns empty for zero lines", () => {
    const config: TargetingBiasConfig = {
      ratings: { p1: 1500, p2: 1500, p3: 1500 },
      biasStrength: 1.0,
    };
    const strategy = createSkillBiasStrategy(config);
    const result = strategy.resolveTargets(
      "p1",
      ["p1", "p2", "p3"],
      makeContext({ linesToSend: 0 }),
    );
    expect(result).toHaveLength(0);
  });
});
