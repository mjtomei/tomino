import { describe, expect, it } from "vitest";

import { ALL_PIECES, type PieceType } from "./pieces.js";
import { SevenBagRandomizer } from "./randomizer-7bag.js";
import { PureRandomRandomizer } from "./randomizer-pure.js";
import { createRandomizer, seededRng } from "./randomizer.js";
import type { Randomizer } from "./randomizer.js";
import {
  createHoldState,
  holdPiece,
  resetHoldFlag,
} from "./hold.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fixed-seed RNG for deterministic tests. */
const testRng = () => seededRng(42);

// ---------------------------------------------------------------------------
// seededRng
// ---------------------------------------------------------------------------

describe("seededRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = seededRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("same seed produces same sequence", () => {
    const a = seededRng(99);
    const b = seededRng(99);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = seededRng(1);
    const b = seededRng(2);
    const matches = Array.from({ length: 20 }, () => a() === b());
    expect(matches.some((m) => !m)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SevenBagRandomizer
// ---------------------------------------------------------------------------

describe("SevenBagRandomizer", () => {
  it("first 7 pieces contain all 7 types exactly once", () => {
    const rand = new SevenBagRandomizer(5, testRng());
    const drawn: PieceType[] = [];
    for (let i = 0; i < 7; i++) {
      drawn.push(rand.next());
    }
    expect([...drawn].sort()).toEqual([...ALL_PIECES].sort());
  });

  it("no repeats within a single bag", () => {
    const rand = new SevenBagRandomizer(5, testRng());
    // Draw 3 full bags (21 pieces)
    for (let bag = 0; bag < 3; bag++) {
      const drawn: PieceType[] = [];
      for (let i = 0; i < 7; i++) {
        drawn.push(rand.next());
      }
      const unique = new Set(drawn);
      expect(unique.size).toBe(7);
    }
  });

  it("refills seamlessly on bag exhaustion", () => {
    const rand = new SevenBagRandomizer(5, testRng());
    // Draw 14 pieces (2 full bags) — should not throw
    for (let i = 0; i < 14; i++) {
      const piece = rand.next();
      expect(ALL_PIECES).toContain(piece);
    }
  });

  it("queue stays filled to previewCount after each next()", () => {
    const previewCount = 5;
    const rand = new SevenBagRandomizer(previewCount, testRng());
    expect(rand.queue.length).toBe(previewCount);
    for (let i = 0; i < 20; i++) {
      rand.next();
      expect(rand.queue.length).toBe(previewCount);
    }
  });

  it("peek returns the correct upcoming pieces", () => {
    const rand = new SevenBagRandomizer(5, testRng());
    const peeked = rand.peek(3);
    expect(peeked.length).toBe(3);
    // The peeked pieces should match the next 3 drawn
    for (const piece of peeked) {
      expect(rand.next()).toBe(piece);
    }
  });

  it("peek does not consume pieces", () => {
    const rand = new SevenBagRandomizer(5, testRng());
    const first = rand.peek(3);
    const second = rand.peek(3);
    expect(first).toEqual(second);
  });

  it("works with previewCount = 0", () => {
    const rand = new SevenBagRandomizer(0, testRng());
    expect(rand.queue.length).toBe(0);
    // next() still works — generates on demand
    const piece = rand.next();
    expect(ALL_PIECES).toContain(piece);
    expect(rand.queue.length).toBe(0);
  });

  it("works with previewCount > 7 (spans multiple bags)", () => {
    const rand = new SevenBagRandomizer(10, testRng());
    expect(rand.queue.length).toBe(10);
    for (const piece of rand.queue) {
      expect(ALL_PIECES).toContain(piece);
    }
  });

  it("defaults to Math.random when no rng provided", () => {
    const rand = new SevenBagRandomizer(5);
    const piece = rand.next();
    expect(ALL_PIECES).toContain(piece);
    expect(rand.queue.length).toBe(5);
  });

  it("refills bag when exhausted during on-demand generation (previewCount = 0)", () => {
    const rand = new SevenBagRandomizer(0, testRng());
    // Draw 8 pieces with previewCount=0: first 7 exhaust the bag, 8th forces a refill
    const drawn: PieceType[] = [];
    for (let i = 0; i < 8; i++) {
      drawn.push(rand.next());
    }
    expect(drawn.every((p) => ALL_PIECES.includes(p))).toBe(true);
  });

  it("deterministic with same seed", () => {
    const a = new SevenBagRandomizer(5, seededRng(42));
    const b = new SevenBagRandomizer(5, seededRng(42));
    for (let i = 0; i < 50; i++) {
      expect(a.next()).toBe(b.next());
    }
  });
});

// ---------------------------------------------------------------------------
// PureRandomRandomizer
// ---------------------------------------------------------------------------

describe("PureRandomRandomizer", () => {
  it("produces only valid PieceType values", () => {
    const rand = new PureRandomRandomizer(5, testRng());
    for (let i = 0; i < 100; i++) {
      expect(ALL_PIECES).toContain(rand.next());
    }
  });

  it("allows repeats (statistical)", () => {
    const rand = new PureRandomRandomizer(0, testRng());
    let hasRepeat = false;
    let prev = rand.next();
    for (let i = 0; i < 200; i++) {
      const curr = rand.next();
      if (curr === prev) {
        hasRepeat = true;
        break;
      }
      prev = curr;
    }
    expect(hasRepeat).toBe(true);
  });

  it("queue stays filled to previewCount after each next()", () => {
    const previewCount = 5;
    const rand = new PureRandomRandomizer(previewCount, testRng());
    expect(rand.queue.length).toBe(previewCount);
    for (let i = 0; i < 20; i++) {
      rand.next();
      expect(rand.queue.length).toBe(previewCount);
    }
  });

  it("peek returns upcoming pieces without consuming them", () => {
    const rand = new PureRandomRandomizer(5, testRng());
    const peeked = rand.peek(3);
    expect(peeked.length).toBe(3);
    const first = rand.peek(3);
    expect(first).toEqual(peeked);
  });

  it("works with previewCount = 0", () => {
    const rand = new PureRandomRandomizer(0, testRng());
    expect(rand.queue.length).toBe(0);
    const piece = rand.next();
    expect(ALL_PIECES).toContain(piece);
  });

  it("defaults to Math.random when no rng provided", () => {
    const rand = new PureRandomRandomizer(5);
    const piece = rand.next();
    expect(ALL_PIECES).toContain(piece);
    expect(rand.queue.length).toBe(5);
  });

  it("deterministic with same seed", () => {
    const a = new PureRandomRandomizer(5, seededRng(42));
    const b = new PureRandomRandomizer(5, seededRng(42));
    for (let i = 0; i < 50; i++) {
      expect(a.next()).toBe(b.next());
    }
  });
});

// ---------------------------------------------------------------------------
// createRandomizer factory
// ---------------------------------------------------------------------------

describe("createRandomizer", () => {
  it("creates a SevenBagRandomizer for '7bag'", () => {
    const rand = createRandomizer("7bag", 5, testRng());
    expect(rand).toBeInstanceOf(SevenBagRandomizer);
  });

  it("creates a PureRandomRandomizer for 'pure-random'", () => {
    const rand = createRandomizer("pure-random", 5, testRng());
    expect(rand).toBeInstanceOf(PureRandomRandomizer);
  });

  it("factory-created randomizers work correctly", () => {
    const rand = createRandomizer("7bag", 3, testRng());
    expect(rand.queue.length).toBe(3);
    const piece = rand.next();
    expect(ALL_PIECES).toContain(piece);
  });
});

// ---------------------------------------------------------------------------
// Randomizer interface compliance (both implementations)
// ---------------------------------------------------------------------------

describe("Randomizer interface compliance", () => {
  const implementations: [string, () => Randomizer][] = [
    ["SevenBagRandomizer", () => new SevenBagRandomizer(5, testRng())],
    ["PureRandomRandomizer", () => new PureRandomRandomizer(5, testRng())],
  ];

  for (const [name, factory] of implementations) {
    describe(name, () => {
      it("queue is readonly (returns array)", () => {
        const rand = factory();
        expect(Array.isArray(rand.queue)).toBe(true);
      });

      it("next() returns a valid PieceType", () => {
        const rand = factory();
        expect(ALL_PIECES).toContain(rand.next());
      });

      it("peek(0) returns empty array", () => {
        const rand = factory();
        expect(rand.peek(0)).toEqual([]);
      });

      it("peek(n) where n > queue length returns only available pieces", () => {
        const rand = factory();
        const peeked = rand.peek(100);
        expect(peeked.length).toBe(5); // previewCount is 5
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Hold piece
// ---------------------------------------------------------------------------

describe("hold piece", () => {
  it("initial state has no held piece and is unused", () => {
    const state = createHoldState();
    expect(state.heldPiece).toBeNull();
    expect(state.holdUsedThisDrop).toBe(false);
  });

  it("first hold: current goes to hold, returns null (pull from randomizer)", () => {
    const state = createHoldState();
    const result = holdPiece("T", state, true);
    expect(result.newCurrent).toBeNull();
    expect(result.newState.heldPiece).toBe("T");
    expect(result.newState.holdUsedThisDrop).toBe(true);
  });

  it("second hold (after reset): swaps held and current", () => {
    let state = createHoldState();
    // First hold: put T in hold
    const r1 = holdPiece("T", state, true);
    state = resetHoldFlag(r1.newState);
    // Second hold: swap T with I
    const r2 = holdPiece("I", state, true);
    expect(r2.newCurrent).toBe("T");
    expect(r2.newState.heldPiece).toBe("I");
    expect(r2.newState.holdUsedThisDrop).toBe(true);
  });

  it("hold is blocked when holdEnabled is false", () => {
    const state = createHoldState();
    const result = holdPiece("T", state, false);
    expect(result.newCurrent).toBe("T");
    expect(result.newState).toBe(state); // same reference, no change
  });

  it("cannot hold twice per drop", () => {
    const state = createHoldState();
    const r1 = holdPiece("T", state, true);
    // Try to hold again without resetting
    const r2 = holdPiece("I", r1.newState, true);
    expect(r2.newCurrent).toBe("I"); // returned unchanged
    expect(r2.newState).toBe(r1.newState); // same reference
    expect(r2.newState.heldPiece).toBe("T"); // still T from first hold
  });

  it("resetHoldFlag clears the flag but keeps the piece", () => {
    const state = createHoldState();
    const r1 = holdPiece("T", state, true);
    const reset = resetHoldFlag(r1.newState);
    expect(reset.heldPiece).toBe("T");
    expect(reset.holdUsedThisDrop).toBe(false);
  });

  it("can hold again after resetHoldFlag", () => {
    let state = createHoldState();
    // Hold T
    const r1 = holdPiece("T", state, true);
    state = resetHoldFlag(r1.newState);
    // Now hold I — should swap
    const r2 = holdPiece("I", state, true);
    expect(r2.newCurrent).toBe("T");
    expect(r2.newState.heldPiece).toBe("I");
  });
});
