import { describe, it, expect } from "vitest";
import type { GameStateSnapshot } from "@tomino/shared";
import {
  detectReactions,
  playEmoteEffect,
  playReactionEffect,
} from "../opponent-reactions.js";
import { ParticleSystem } from "../particle-system.js";

function makeSnapshot(overrides: Partial<GameStateSnapshot> = {}): GameStateSnapshot {
  return {
    tick: 0,
    board: [],
    activePiece: null,
    ghostY: null,
    nextQueue: [],
    holdPiece: null,
    holdUsed: false,
    score: 0,
    level: 1,
    linesCleared: 0,
    piecesPlaced: 0,
    pendingGarbage: [],
    isGameOver: false,
    ...overrides,
  };
}

describe("detectReactions", () => {
  const pid = "p1";
  const now = 1000;

  it("returns empty when prev is null", () => {
    expect(detectReactions(null, makeSnapshot(), pid, now)).toEqual([]);
  });

  it("returns empty for identical snapshots", () => {
    const s = makeSnapshot({ linesCleared: 5 });
    expect(detectReactions(s, s, pid, now)).toEqual([]);
  });

  it("fires quad when linesCleared jumps by 4+", () => {
    const prev = makeSnapshot({ linesCleared: 2 });
    const next = makeSnapshot({ linesCleared: 6 });
    const events = detectReactions(prev, next, pid, now);
    expect(events).toContainEqual({ playerId: pid, reaction: "quad", at: now });
  });

  it("does not fire quad on single/double/triple clears", () => {
    const prev = makeSnapshot({ linesCleared: 2 });
    const next = makeSnapshot({ linesCleared: 5 });
    const events = detectReactions(prev, next, pid, now);
    expect(events.find((e) => e.reaction === "quad")).toBeUndefined();
  });

  it("fires heavyGarbage when pending queue grows by 4+", () => {
    const prev = makeSnapshot({ pendingGarbage: [] });
    const next = makeSnapshot({
      pendingGarbage: [{ lines: 5, gapColumn: 3 }],
    });
    const events = detectReactions(prev, next, pid, now);
    expect(events).toContainEqual({
      playerId: pid,
      reaction: "heavyGarbage",
      at: now,
    });
  });

  it("does not fire heavyGarbage for small garbage bumps", () => {
    const prev = makeSnapshot({ pendingGarbage: [] });
    const next = makeSnapshot({
      pendingGarbage: [{ lines: 2, gapColumn: 3 }],
    });
    const events = detectReactions(prev, next, pid, now);
    expect(events.find((e) => e.reaction === "heavyGarbage")).toBeUndefined();
  });

  it("does not fire heavyGarbage when pending queue shrinks", () => {
    const prev = makeSnapshot({
      pendingGarbage: [{ lines: 6, gapColumn: 3 }],
    });
    const next = makeSnapshot({ pendingGarbage: [] });
    const events = detectReactions(prev, next, pid, now);
    expect(events.find((e) => e.reaction === "heavyGarbage")).toBeUndefined();
  });

  it("fires eliminated when isGameOver flips false → true", () => {
    const prev = makeSnapshot({ isGameOver: false });
    const next = makeSnapshot({ isGameOver: true });
    const events = detectReactions(prev, next, pid, now);
    expect(events).toContainEqual({ playerId: pid, reaction: "eliminated", at: now });
  });

  it("does not fire eliminated when already game over", () => {
    const prev = makeSnapshot({ isGameOver: true });
    const next = makeSnapshot({ isGameOver: true });
    const events = detectReactions(prev, next, pid, now);
    expect(events.find((e) => e.reaction === "eliminated")).toBeUndefined();
  });

  it("fires multiple events at once (quad + elimination)", () => {
    const prev = makeSnapshot({ linesCleared: 0, isGameOver: false });
    const next = makeSnapshot({ linesCleared: 4, isGameOver: true });
    const events = detectReactions(prev, next, pid, now);
    const kinds = events.map((e) => e.reaction).sort();
    expect(kinds).toEqual(["eliminated", "quad"]);
  });
});

describe("playReactionEffect / playEmoteEffect", () => {
  it("emits particles for each reaction kind", () => {
    for (const reaction of ["quad", "heavyGarbage", "eliminated"] as const) {
      const sys = new ParticleSystem();
      playReactionEffect(sys, reaction, { x: 50, y: 50 });
      expect(sys.count()).toBeGreaterThan(0);
    }
  });

  it("emits particles for each emote kind", () => {
    for (const emote of ["thumbsUp", "fire", "wave", "gg"] as const) {
      const sys = new ParticleSystem();
      playEmoteEffect(sys, emote, { x: 50, y: 50 });
      expect(sys.count()).toBeGreaterThan(0);
    }
  });
});
