import { describe, expect, it } from "vitest";

import type { GameModeConfig, RuleSet } from "./types.js";
import {
  classicRuleSet,
  customRuleSet,
  gameModes,
  marathonMode,
  modernRuleSet,
  sprintMode,
  ultraMode,
  zenMode,
} from "./rulesets.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every field that must be present on a valid RuleSet. */
const RULESET_KEYS: (keyof RuleSet)[] = [
  "name",
  "rotationSystem",
  "lockDelay",
  "lockResets",
  "holdEnabled",
  "hardDropEnabled",
  "ghostEnabled",
  "randomizer",
  "scoringSystem",
  "gravityCurve",
  "das",
  "arr",
  "sdf",
  "startLevel",
  "previewCount",
];

function assertAllFieldsPopulated(rs: RuleSet) {
  for (const key of RULESET_KEYS) {
    expect(rs[key], `field "${key}" should be defined`).not.toBeUndefined();
  }
}

// ---------------------------------------------------------------------------
// Preset tests
// ---------------------------------------------------------------------------

describe("classicRuleSet", () => {
  const classic = classicRuleSet();

  it("returns a RuleSet with all fields populated", () => {
    assertAllFieldsPopulated(classic);
  });

  it("has correct Classic preset values", () => {
    expect(classic.name).toBe("Classic");
    expect(classic.rotationSystem).toBe("nrs");
    expect(classic.lockDelay).toBe(0);
    expect(classic.lockResets).toBe(0);
    expect(classic.holdEnabled).toBe(false);
    expect(classic.hardDropEnabled).toBe(false);
    expect(classic.ghostEnabled).toBe(false);
    expect(classic.randomizer).toBe("pure-random");
    expect(classic.scoringSystem).toBe("nes");
    expect(classic.gravityCurve).toBe("nes");
    expect(classic.das).toBe(267);
    expect(classic.arr).toBe(100);
    expect(classic.sdf).toBe(2);
    expect(classic.startLevel).toBe(0);
    expect(classic.previewCount).toBe(1);
  });

  it("returns a new object each call", () => {
    expect(classicRuleSet()).not.toBe(classic);
    expect(classicRuleSet()).toEqual(classic);
  });
});

describe("modernRuleSet", () => {
  const modern = modernRuleSet();

  it("returns a RuleSet with all fields populated", () => {
    assertAllFieldsPopulated(modern);
  });

  it("has correct Modern preset values", () => {
    expect(modern.name).toBe("Modern");
    expect(modern.rotationSystem).toBe("srs");
    expect(modern.lockDelay).toBe(500);
    expect(modern.lockResets).toBe(15);
    expect(modern.holdEnabled).toBe(true);
    expect(modern.hardDropEnabled).toBe(true);
    expect(modern.ghostEnabled).toBe(true);
    expect(modern.randomizer).toBe("7bag");
    expect(modern.scoringSystem).toBe("guideline");
    expect(modern.gravityCurve).toBe("guideline");
    expect(modern.das).toBe(133);
    expect(modern.arr).toBe(10);
    expect(modern.sdf).toBe(Infinity);
    expect(modern.startLevel).toBe(1);
    expect(modern.previewCount).toBe(5);
  });

  it("returns a new object each call", () => {
    expect(modernRuleSet()).not.toBe(modern);
    expect(modernRuleSet()).toEqual(modern);
  });
});

// ---------------------------------------------------------------------------
// Custom rule set tests
// ---------------------------------------------------------------------------

describe("customRuleSet", () => {
  it("applies partial overrides to the base", () => {
    const base = modernRuleSet();
    const custom = customRuleSet(base, {
      holdEnabled: false,
      das: 200,
    });

    expect(custom.holdEnabled).toBe(false);
    expect(custom.das).toBe(200);
  });

  it("preserves base values for fields not overridden", () => {
    const base = modernRuleSet();
    const custom = customRuleSet(base, { name: "My Custom" });

    expect(custom.rotationSystem).toBe(base.rotationSystem);
    expect(custom.lockDelay).toBe(base.lockDelay);
    expect(custom.lockResets).toBe(base.lockResets);
    expect(custom.holdEnabled).toBe(base.holdEnabled);
    expect(custom.ghostEnabled).toBe(base.ghostEnabled);
    expect(custom.randomizer).toBe(base.randomizer);
    expect(custom.previewCount).toBe(base.previewCount);
  });

  it("allows mixing settings from different presets", () => {
    const custom = customRuleSet(modernRuleSet(), {
      name: "Hybrid",
      rotationSystem: "nrs",
      gravityCurve: "nes",
      holdEnabled: false,
    });

    // NRS rotation + NES gravity from Classic
    expect(custom.rotationSystem).toBe("nrs");
    expect(custom.gravityCurve).toBe("nes");
    expect(custom.holdEnabled).toBe(false);
    // Everything else from Modern base
    expect(custom.lockDelay).toBe(500);
    expect(custom.randomizer).toBe("7bag");
    expect(custom.scoringSystem).toBe("guideline");
  });

  it("does not mutate the base rule set", () => {
    const base = classicRuleSet();
    const originalName = base.name;
    customRuleSet(base, { name: "Modified" });

    expect(base.name).toBe(originalName);
  });

  it("returns all fields populated", () => {
    const custom = customRuleSet(classicRuleSet(), { previewCount: 3 });
    assertAllFieldsPopulated(custom);
  });
});

// ---------------------------------------------------------------------------
// Game mode definition tests
// ---------------------------------------------------------------------------

describe("game mode definitions", () => {
  describe("marathon", () => {
    it("has no goal (endless until top-out)", () => {
      expect(marathonMode.mode).toBe("marathon");
      expect(marathonMode.goal).toBe("none");
      expect(marathonMode.goalValue).toBeNull();
    });

    it("has gravity and top-out ends game", () => {
      expect(marathonMode.gravity).toBe(true);
      expect(marathonMode.topOutEndsGame).toBe(true);
    });

    it("displays score, level, and lines", () => {
      expect(marathonMode.displayStats).toEqual(["score", "level", "lines"]);
    });
  });

  describe("sprint", () => {
    it("has a 40-line goal", () => {
      expect(sprintMode.mode).toBe("sprint");
      expect(sprintMode.goal).toBe("lines");
      expect(sprintMode.goalValue).toBe(40);
    });

    it("has gravity and top-out ends game", () => {
      expect(sprintMode.gravity).toBe(true);
      expect(sprintMode.topOutEndsGame).toBe(true);
    });

    it("displays timer and lines remaining", () => {
      expect(sprintMode.displayStats).toEqual(["timer", "linesRemaining"]);
    });
  });

  describe("ultra", () => {
    it("has a 3-minute (180000ms) time goal", () => {
      expect(ultraMode.mode).toBe("ultra");
      expect(ultraMode.goal).toBe("time");
      expect(ultraMode.goalValue).toBe(180_000);
    });

    it("has gravity and top-out ends game", () => {
      expect(ultraMode.gravity).toBe(true);
      expect(ultraMode.topOutEndsGame).toBe(true);
    });

    it("displays countdown timer and score", () => {
      expect(ultraMode.displayStats).toEqual(["timer", "score"]);
    });
  });

  describe("zen", () => {
    it("has no goal", () => {
      expect(zenMode.mode).toBe("zen");
      expect(zenMode.goal).toBe("none");
      expect(zenMode.goalValue).toBeNull();
    });

    it("has no gravity and top-out does not end game", () => {
      expect(zenMode.gravity).toBe(false);
      expect(zenMode.topOutEndsGame).toBe(false);
    });

    it("displays lines and score", () => {
      expect(zenMode.displayStats).toEqual(["lines", "score"]);
    });
  });

  describe("gameModes record", () => {
    it("contains all four modes", () => {
      expect(Object.keys(gameModes)).toEqual(["marathon", "sprint", "ultra", "zen"]);
    });

    it("every entry has a matching mode field", () => {
      for (const [key, config] of Object.entries(gameModes)) {
        expect(config.mode).toBe(key);
      }
    });

    it("every entry satisfies GameModeConfig shape", () => {
      const requiredKeys: (keyof GameModeConfig)[] = [
        "mode",
        "goal",
        "goalValue",
        "gravity",
        "topOutEndsGame",
        "displayStats",
      ];
      for (const config of Object.values(gameModes)) {
        for (const key of requiredKeys) {
          expect(config, `missing "${key}"`).toHaveProperty(key);
        }
      }
    });
  });
});
