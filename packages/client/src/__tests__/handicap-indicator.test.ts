import { describe, it, expect } from "vitest";
import { computeIndicatorData } from "../ui/handicap-indicator.js";
import type { HandicapModifiers } from "@tetris/shared";
import { modifierKey } from "@tetris/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMod(garbageMultiplier: number): HandicapModifiers {
  return { garbageMultiplier, delayModifier: 1.0, messinessFactor: 1.0 };
}

function makeModifiers(
  entries: Array<[string, string, number]>,
): Record<string, HandicapModifiers> {
  const result: Record<string, HandicapModifiers> = {};
  for (const [sender, receiver, mult] of entries) {
    result[modifierKey(sender, receiver)] = makeMod(mult);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeIndicatorData", () => {
  it("returns undefined when no opponents", () => {
    const mods = makeModifiers([["alice", "bob", 0.6]]);
    expect(computeIndicatorData("alice", [], mods)).toBeUndefined();
  });

  it("returns undefined when no modifiers match", () => {
    const mods = makeModifiers([["charlie", "dave", 0.5]]);
    expect(computeIndicatorData("alice", ["bob"], mods)).toBeUndefined();
  });

  describe("2-player game", () => {
    it("returns the incoming multiplier from the single opponent", () => {
      const mods = makeModifiers([
        ["alice", "bob", 0.6],
        ["bob", "alice", 0.8],
      ]);
      const result = computeIndicatorData("alice", ["bob"], mods);
      expect(result).toEqual({ incomingMultiplier: 0.8 });
    });

    it("shows 1.0x when no handicap effect", () => {
      const mods = makeModifiers([
        ["alice", "bob", 1.0],
        ["bob", "alice", 1.0],
      ]);
      const result = computeIndicatorData("alice", ["bob"], mods);
      expect(result).toEqual({ incomingMultiplier: 1.0 });
    });
  });

  describe("3+ player game", () => {
    it("returns the minimum incoming multiplier", () => {
      const mods = makeModifiers([
        ["bob", "alice", 0.4],
        ["charlie", "alice", 0.8],
        ["alice", "bob", 1.0],
        ["alice", "charlie", 1.0],
        ["bob", "charlie", 1.0],
        ["charlie", "bob", 1.0],
      ]);
      const result = computeIndicatorData("alice", ["bob", "charlie"], mods);
      expect(result?.incomingMultiplier).toBe(0.4);
    });
  });

  describe("symmetric mode", () => {
    it("includes outgoing multiplier when it differs from 1.0", () => {
      const mods = makeModifiers([
        ["alice", "bob", 0.7],   // alice outgoing to bob
        ["bob", "alice", 0.5],   // alice incoming from bob
      ]);
      const result = computeIndicatorData("alice", ["bob"], mods, "symmetric");
      expect(result).toEqual({
        incomingMultiplier: 0.5,
        outgoingMultiplier: 0.7,
      });
    });

    it("omits outgoing multiplier when it equals 1.0", () => {
      const mods = makeModifiers([
        ["alice", "bob", 1.0],
        ["bob", "alice", 0.6],
      ]);
      const result = computeIndicatorData("alice", ["bob"], mods, "symmetric");
      expect(result).toEqual({ incomingMultiplier: 0.6 });
    });

    it("returns minimum outgoing in 3+ player", () => {
      const mods = makeModifiers([
        ["bob", "alice", 0.5],
        ["charlie", "alice", 0.7],
        ["alice", "bob", 0.8],
        ["alice", "charlie", 0.6],
        ["bob", "charlie", 1.0],
        ["charlie", "bob", 1.0],
      ]);
      const result = computeIndicatorData("alice", ["bob", "charlie"], mods, "symmetric");
      expect(result?.incomingMultiplier).toBe(0.5);
      expect(result?.outgoingMultiplier).toBe(0.6);
    });
  });

  describe("boost mode", () => {
    it("does not include outgoing multiplier", () => {
      const mods = makeModifiers([
        ["alice", "bob", 0.7],
        ["bob", "alice", 0.5],
      ]);
      const result = computeIndicatorData("alice", ["bob"], mods, "boost");
      expect(result).toEqual({ incomingMultiplier: 0.5 });
      expect(result?.outgoingMultiplier).toBeUndefined();
    });
  });
});
