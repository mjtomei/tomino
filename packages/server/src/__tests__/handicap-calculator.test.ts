import { describe, it, expect } from "vitest";
import type { HandicapSettings } from "@tomino/shared";
import { modifierKey } from "@tomino/shared";
import { computePairHandicap, computeModifierMatrix } from "../handicap-calculator.js";
import type { HandicapCurveConfig } from "../handicap-config.js";
import { DEFAULT_CURVE_CONFIG } from "../handicap-config.js";

const BASE_SETTINGS: HandicapSettings = {
  intensity: "standard",
  mode: "boost",
  targetingBiasStrength: 0,
};

describe("computePairHandicap", () => {
  it("returns identity modifiers for equal ratings", () => {
    const mods = computePairHandicap(1500, 1500, BASE_SETTINGS);
    expect(mods.garbageMultiplier).toBe(1.0);
    expect(mods.delayModifier).toBe(1.0);
    expect(mods.messinessFactor).toBe(1.0);
  });

  it("returns near-zero multiplier for large gap (stronger→weaker)", () => {
    const mods = computePairHandicap(2000, 1000, BASE_SETTINGS);
    expect(mods.garbageMultiplier).toBeLessThan(0.01);
  });

  it("returns 1.0 for weaker→stronger in boost mode", () => {
    const mods = computePairHandicap(1000, 2000, BASE_SETTINGS);
    expect(mods.garbageMultiplier).toBe(1.0);
  });

  it("reduces both directions in symmetric mode", () => {
    const symmetricSettings: HandicapSettings = {
      ...BASE_SETTINGS,
      mode: "symmetric",
    };

    const strongToWeak = computePairHandicap(1800, 1200, symmetricSettings);
    const weakToStrong = computePairHandicap(1200, 1800, symmetricSettings);

    // Both should be reduced below 1.0
    expect(strongToWeak.garbageMultiplier).toBeLessThan(1.0);
    expect(weakToStrong.garbageMultiplier).toBeLessThan(1.0);

    // Stronger→weaker should be reduced more
    expect(strongToWeak.garbageMultiplier).toBeLessThan(weakToStrong.garbageMultiplier);
  });

  it("returns identity when intensity is off", () => {
    const offSettings: HandicapSettings = {
      ...BASE_SETTINGS,
      intensity: "off",
    };
    const mods = computePairHandicap(2000, 1000, offSettings);
    expect(mods.garbageMultiplier).toBe(1.0);
    expect(mods.delayModifier).toBe(1.0);
    expect(mods.messinessFactor).toBe(1.0);
  });

  it("config overrides change curve shape", () => {
    const steepConfig: HandicapCurveConfig = {
      ...DEFAULT_CURVE_CONFIG,
      steepness: 0.02, // much steeper
    };
    const shallowConfig: HandicapCurveConfig = {
      ...DEFAULT_CURVE_CONFIG,
      steepness: 0.005, // shallower
    };

    const gap = 500; // above midpoint so steeper curve produces lower value
    const steep = computePairHandicap(1500 + gap, 1500, BASE_SETTINGS, steepConfig);
    const shallow = computePairHandicap(1500 + gap, 1500, BASE_SETTINGS, shallowConfig);

    // Steeper curve should produce a lower multiplier at the same gap
    expect(steep.garbageMultiplier).toBeLessThan(shallow.garbageMultiplier);
  });

  it("delay modifier only applied when delayEnabled", () => {
    const withDelay: HandicapSettings = { ...BASE_SETTINGS, delayEnabled: true };

    const noDelay = computePairHandicap(1800, 1200, BASE_SETTINGS);
    const delayed = computePairHandicap(1800, 1200, withDelay);

    expect(noDelay.delayModifier).toBe(1.0);
    expect(delayed.delayModifier).toBeGreaterThan(1.0);
  });

  it("messiness modifier only applied when messinessEnabled", () => {
    const withMessiness: HandicapSettings = { ...BASE_SETTINGS, messinessEnabled: true };

    const noMessiness = computePairHandicap(1800, 1200, BASE_SETTINGS);
    const messy = computePairHandicap(1800, 1200, withMessiness);

    expect(noMessiness.messinessFactor).toBe(1.0);
    expect(messy.messinessFactor).toBeLessThan(1.0);
  });

  it("multiplier approaches 0.0 for extreme gaps without floor", () => {
    const mods = computePairHandicap(3000, 1000, BASE_SETTINGS);
    expect(mods.garbageMultiplier).toBeCloseTo(0.0, 5);
  });

  it("light intensity produces less reduction than heavy", () => {
    const light: HandicapSettings = { ...BASE_SETTINGS, intensity: "light" };
    const heavy: HandicapSettings = { ...BASE_SETTINGS, intensity: "heavy" };

    const lightMods = computePairHandicap(1800, 1200, light);
    const heavyMods = computePairHandicap(1800, 1200, heavy);

    expect(lightMods.garbageMultiplier).toBeGreaterThan(heavyMods.garbageMultiplier);
  });
});

describe("computeModifierMatrix", () => {
  it("produces correct entries for 3 players (6 directed pairs)", () => {
    const players = [
      { username: "alice", rating: 1800 },
      { username: "bob", rating: 1500 },
      { username: "carol", rating: 1200 },
    ];

    const matrix = computeModifierMatrix(players, BASE_SETTINGS);

    // 3 players → 3*2 = 6 pairs
    expect(matrix.size).toBe(6);

    // All expected keys exist
    const expectedPairs = [
      ["alice", "bob"], ["alice", "carol"],
      ["bob", "alice"], ["bob", "carol"],
      ["carol", "alice"], ["carol", "bob"],
    ] as const;

    for (const [sender, receiver] of expectedPairs) {
      const key = modifierKey(sender, receiver);
      expect(matrix.has(key)).toBe(true);
      const mods = matrix.get(key)!;
      expect(mods.garbageMultiplier).toBeGreaterThanOrEqual(0.0);
      expect(mods.garbageMultiplier).toBeLessThanOrEqual(1.0);
    }

    // Strongest→weakest should have lowest multiplier
    const aliceToCarol = matrix.get(modifierKey("alice", "carol"))!;
    const aliceToBob = matrix.get(modifierKey("alice", "bob"))!;
    expect(aliceToCarol.garbageMultiplier).toBeLessThan(aliceToBob.garbageMultiplier);

    // Weaker→stronger in boost mode should be 1.0
    const carolToAlice = matrix.get(modifierKey("carol", "alice"))!;
    expect(carolToAlice.garbageMultiplier).toBe(1.0);
  });

  it("returns empty matrix for single player", () => {
    const matrix = computeModifierMatrix(
      [{ username: "solo", rating: 1500 }],
      BASE_SETTINGS,
    );
    expect(matrix.size).toBe(0);
  });

  it("returns 2 entries for two players", () => {
    const matrix = computeModifierMatrix(
      [
        { username: "a", rating: 1600 },
        { username: "b", rating: 1400 },
      ],
      BASE_SETTINGS,
    );
    expect(matrix.size).toBe(2);
  });
});
