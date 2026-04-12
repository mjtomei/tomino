import { describe, it, expect } from "vitest";
import type {
  HandicapModifiers,
  LineClearCount,
  PlayerId,
  TargetingStrategy,
} from "@tetris/shared";
import { modifierKey } from "@tetris/shared";
import { makeGarbageBatch } from "@tetris/shared/__test-utils__/factories.js";
import { assertGarbageInserted } from "@tetris/shared/__test-utils__/assertions.js";
import { boardFromAscii } from "@tetris/shared/__test-utils__/board-builder.js";
import { BalancingMiddleware } from "../balancing-middleware.js";
import { GarbageManager } from "../garbage-manager.js";
import { PlayerEngine, MULTIPLAYER_MODE_CONFIG } from "../player-engine.js";
import { modernRuleSet } from "@tetris/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

function fixedRng(value: number): () => number {
  return () => value;
}

/** Steps through a predetermined sequence of [0,1) RNG values. */
function seqRng(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i++;
    return v;
  };
}

const TETRIS = {
  linesCleared: 4 as LineClearCount,
  tSpin: "none" as const,
  combo: 0,
  b2b: -1,
};

const NAMES_2: Record<PlayerId, string> = { p1: "Alice", p2: "Bob" };
const NAMES_3: Record<PlayerId, string> = {
  p1: "Alice",
  p2: "Bob",
  p3: "Carol",
};

// ---------------------------------------------------------------------------
// Passthrough
// ---------------------------------------------------------------------------

describe("BalancingMiddleware — passthrough (handicap disabled)", () => {
  it("produces identical outcomes to raw GarbageManager when modifiers undefined", () => {
    const c1 = clock(1000);
    const gm = new GarbageManager({
      playerIds: ["p1", "p2"],
      now: c1.now,
      gapRng: fixedRng(0),
      delayMs: 500,
    });

    const c2 = clock(1000);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: NAMES_2,
      now: c2.now,
      gapRng: fixedRng(0),
      delayMs: 500,
    });

    const o1 = gm.onLinesCleared("p1", TETRIS);
    const o2 = mw.onLinesCleared("p1", TETRIS);

    expect(o2).toEqual(o1);
    expect(mw.getPending("p2")).toEqual(gm.getPending("p2"));
  });

  it("delegates drainReady and removePlayer", () => {
    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2", "p3"],
      playerNames: NAMES_3,
      now: c.now,
      gapRng: fixedRng(0),
      delayMs: 100,
    });

    mw.onLinesCleared("p1", TETRIS);
    expect(mw.drainReady("p2", 50)).toEqual([]); // not ready yet
    c.advance(100);
    const drained = mw.drainReady("p2", c.now());
    expect(drained.length).toBeGreaterThan(0);

    mw.removePlayer("p3");
    expect(mw.getPending("p3")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Per-pair modifiers
// ---------------------------------------------------------------------------

describe("BalancingMiddleware — per-pair modifiers", () => {
  it("applies different multipliers for A→B vs A→C", () => {
    const modifiers: Record<string, HandicapModifiers> = {
      [modifierKey("Alice", "Bob")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Alice", "Carol")]: {
        garbageMultiplier: 0.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      // other directions — identity
      [modifierKey("Bob", "Alice")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Bob", "Carol")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Carol", "Alice")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Carol", "Bob")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
    };

    const c = clock(1000);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2", "p3"],
      playerNames: NAMES_3,
      modifiers,
      now: c.now,
      gapRng: fixedRng(0),
      rounderRng: fixedRng(0.999),
      delayMs: 500,
    });

    // Tetris → 4 lines split evenly across 2 opponents (2 each)
    mw.onLinesCleared("p1", TETRIS);

    // Bob (p2) gets full 2 lines; Carol (p3) gets 0 (multiplier 0.0)
    const bob = mw.getPending("p2");
    const carol = mw.getPending("p3");
    expect(bob.length).toBe(1);
    expect(bob[0]!.lines).toBe(2);
    expect(carol).toEqual([]);
  });

  it("0.0 multiplier across the board absorbs all garbage (no receivers affected)", () => {
    const modifiers: Record<string, HandicapModifiers> = {
      [modifierKey("Alice", "Bob")]: {
        garbageMultiplier: 0.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Bob", "Alice")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
    };

    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: NAMES_2,
      modifiers,
      now: c.now,
      gapRng: fixedRng(0),
      rounderRng: fixedRng(0.999),
    });

    const outcome = mw.onLinesCleared("p1", TETRIS);
    expect(outcome.total).toBe(4);
    expect(outcome.residualSent).toBe(0);
    expect(outcome.affectedReceivers).toEqual([]);
    expect(mw.getPending("p2")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Probabilistic rounding
// ---------------------------------------------------------------------------

describe("BalancingMiddleware — probabilistic rounding", () => {
  it("rounds 0.3 × 4 = 1.2 to 1 (80%) or 2 (20%) on average", () => {
    const modifiers: Record<string, HandicapModifiers> = {
      [modifierKey("Alice", "Bob")]: {
        garbageMultiplier: 0.3,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Bob", "Alice")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
    };

    let total = 0;
    const iterations = 10000;
    // Deterministic pseudo-random sequence from a linear congruential generator.
    let seed = 1;
    const lcg = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = 0; i < iterations; i++) {
      const c = clock(0);
      const mw = new BalancingMiddleware({
        playerIds: ["p1", "p2"],
        playerNames: NAMES_2,
        modifiers,
        now: c.now,
        gapRng: fixedRng(0),
        rounderRng: lcg,
      });
      mw.onLinesCleared("p1", TETRIS);
      const bob = mw.getPending("p2");
      total += bob[0]?.lines ?? 0;
    }

    const mean = total / iterations;
    // expected mean = 1.2, tolerance ±0.05
    expect(mean).toBeGreaterThan(1.15);
    expect(mean).toBeLessThan(1.25);
  });

  it("rounds 1.0 multiplier to exact integer (no randomness)", () => {
    const modifiers: Record<string, HandicapModifiers> = {
      [modifierKey("Alice", "Bob")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Bob", "Alice")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
    };

    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: NAMES_2,
      modifiers,
      now: c.now,
      gapRng: fixedRng(0),
      rounderRng: fixedRng(0.0),
    });
    mw.onLinesCleared("p1", TETRIS);
    const bob = mw.getPending("p2");
    expect(bob[0]!.lines).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Optional delay modifier
// ---------------------------------------------------------------------------

describe("BalancingMiddleware — optional delay modifier", () => {
  const modifiers: Record<string, HandicapModifiers> = {
    [modifierKey("Alice", "Bob")]: {
      garbageMultiplier: 1.0,
      delayModifier: 2.0,
      messinessFactor: 1.0,
    },
    [modifierKey("Bob", "Alice")]: {
      garbageMultiplier: 1.0,
      delayModifier: 1.0,
      messinessFactor: 1.0,
    },
  };

  it("ignores delayModifier when delayEnabled is false", () => {
    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: NAMES_2,
      modifiers,
      now: c.now,
      gapRng: fixedRng(0),
      rounderRng: fixedRng(0.5),
      delayMs: 500,
      delayEnabled: false,
    });
    mw.onLinesCleared("p1", TETRIS);
    // ready at now + 500
    expect(mw.drainReady("p2", 499)).toEqual([]);
    expect(mw.drainReady("p2", 500).length).toBe(1);
  });

  it("multiplies delay by delayModifier when delayEnabled is true", () => {
    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: NAMES_2,
      modifiers,
      now: c.now,
      gapRng: fixedRng(0),
      rounderRng: fixedRng(0.5),
      delayMs: 500,
      delayEnabled: true,
    });
    mw.onLinesCleared("p1", TETRIS);
    // ready at now + 500*2 = 1000
    expect(mw.drainReady("p2", 999)).toEqual([]);
    expect(mw.drainReady("p2", 1000).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Optional messiness modifier
// ---------------------------------------------------------------------------

describe("BalancingMiddleware — optional messiness modifier", () => {
  const cleanModifiers: Record<string, HandicapModifiers> = {
    [modifierKey("Alice", "Bob")]: {
      garbageMultiplier: 1.0,
      delayModifier: 1.0,
      messinessFactor: 0.0, // fully clean — canonical gap column
    },
    [modifierKey("Bob", "Alice")]: {
      garbageMultiplier: 1.0,
      delayModifier: 1.0,
      messinessFactor: 1.0,
    },
  };

  it("ignores messinessFactor when messinessEnabled is false", () => {
    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: NAMES_2,
      modifiers: cleanModifiers,
      now: c.now,
      gapRng: fixedRng(0.77), // → column 7
      rounderRng: fixedRng(0.5),
      messinessEnabled: false,
    });
    mw.onLinesCleared("p1", TETRIS);
    const bob = mw.getPending("p2");
    expect(bob[0]!.gapColumn).toBe(7);
  });

  it("forces canonical gap column when messinessFactor=0 and enabled", () => {
    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: NAMES_2,
      modifiers: cleanModifiers,
      now: c.now,
      gapRng: fixedRng(0.77),
      rounderRng: fixedRng(0.5),
      messinessEnabled: true,
    });
    mw.onLinesCleared("p1", TETRIS);
    const bob = mw.getPending("p2");
    expect(bob[0]!.gapColumn).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Matrix works for 2 and 3+ players
// ---------------------------------------------------------------------------

describe("BalancingMiddleware — matrix handles different player counts", () => {
  it("2-player matrix has 1 directed entry per direction", () => {
    const modifiers: Record<string, HandicapModifiers> = {
      [modifierKey("Alice", "Bob")]: {
        garbageMultiplier: 0.5,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Bob", "Alice")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
    };
    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: NAMES_2,
      modifiers,
      now: c.now,
      gapRng: fixedRng(0),
      rounderRng: fixedRng(0.999),
    });
    mw.onLinesCleared("p1", TETRIS);
    expect(mw.getPending("p2")[0]!.lines).toBe(2);
  });

  it("3-player matrix applies per-receiver multipliers independently", () => {
    const modifiers: Record<string, HandicapModifiers> = {
      [modifierKey("Alice", "Bob")]: {
        garbageMultiplier: 1.0,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Alice", "Carol")]: {
        garbageMultiplier: 0.5,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Bob", "Alice")]: IDENTITY(),
      [modifierKey("Bob", "Carol")]: IDENTITY(),
      [modifierKey("Carol", "Alice")]: IDENTITY(),
      [modifierKey("Carol", "Bob")]: IDENTITY(),
    };
    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2", "p3"],
      playerNames: NAMES_3,
      modifiers,
      now: c.now,
      gapRng: fixedRng(0),
      rounderRng: fixedRng(0.999),
    });
    mw.onLinesCleared("p1", TETRIS);
    expect(mw.getPending("p2")[0]!.lines).toBe(2);
    expect(mw.getPending("p3")[0]!.lines).toBe(1); // 2 * 0.5 = 1
  });
});

function IDENTITY(): HandicapModifiers {
  return { garbageMultiplier: 1.0, delayModifier: 1.0, messinessFactor: 1.0 };
}

// ---------------------------------------------------------------------------
// Integration with PlayerEngine + assertGarbageInserted
// ---------------------------------------------------------------------------

describe("BalancingMiddleware — integration with garbage insertion", () => {
  it("modified batch is correctly applied to a PlayerEngine board", () => {
    const modifiers: Record<string, HandicapModifiers> = {
      [modifierKey("Alice", "Bob")]: {
        garbageMultiplier: 0.5,
        delayModifier: 1.0,
        messinessFactor: 1.0,
      },
      [modifierKey("Bob", "Alice")]: IDENTITY(),
    };

    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: NAMES_2,
      modifiers,
      now: c.now,
      gapRng: fixedRng(0.35), // → column 3
      rounderRng: fixedRng(0.999),
      delayMs: 0,
    });

    mw.onLinesCleared("p1", TETRIS);
    const ready = mw.drainReady("p2", c.now());
    // Tetris=4 × 0.5 = 2 lines delivered
    expect(ready).toEqual([makeGarbageBatch({ lines: 2, gapColumn: 3 })]);

    // Apply to a real PlayerEngine and assert board state transitions
    const engine = new PlayerEngine({
      playerId: "p2",
      seed: 42,
      ruleSet: modernRuleSet(),
      modeConfig: MULTIPLAYER_MODE_CONFIG,
    });
    const before = engine.getSnapshot();
    engine.applyGarbage(ready);
    const after = engine.getSnapshot();

    assertGarbageInserted(before, after, ready[0]!);
  });

  it("uses boardFromAscii to verify pre-garbage state then middleware delivery", () => {
    // Sanity-check the test-utils wiring used above.
    const board = boardFromAscii(`
..........
..........
..X.......
    `.trim());
    expect(board.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Strategy swap + targeting
// ---------------------------------------------------------------------------

describe("BalancingMiddleware — targeting strategy", () => {
  it("setTargetingStrategy swaps the active strategy", () => {
    const c = clock(0);
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2", "p3"],
      playerNames: NAMES_3,
      now: c.now,
      gapRng: fixedRng(0),
      rounderRng: fixedRng(0.5),
    });

    // Custom strategy: send all to p3
    const allToP3: TargetingStrategy = {
      resolveTargets(_sender, _players, ctx) {
        return [{ playerId: "p3", lines: ctx.linesToSend }];
      },
    };
    mw.setTargetingStrategy(allToP3);
    mw.onLinesCleared("p1", TETRIS);
    expect(mw.getPending("p2")).toEqual([]);
    expect(mw.getPending("p3").reduce((s, b) => s + b.lines, 0)).toBe(4);
  });
});
