import { describe, it, expect } from "vitest";
import type { PlayerId, TargetingStrategy } from "@tetris/shared";
import { makeGarbageBatch } from "@tetris/shared/__test-utils__/factories.js";
import { GarbageManager } from "../garbage-manager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

/** Fixed-gap RNG so tests can predict gap columns. */
function fixedRng(value: number): () => number {
  return () => value;
}

const PLAYERS: PlayerId[] = ["p1", "p2"];
const TRIO: PlayerId[] = ["p1", "p2", "p3"];
const FOUR: PlayerId[] = ["p1", "p2", "p3", "p4"];

// Enough to send: a quad (Tetris) with no T-spin, combo -1, b2b -1 → 4 lines.
const TETRIS = {
  linesCleared: 4 as const,
  tSpin: "none" as const,
  combo: 0,
  b2b: -1,
};
// Single clear without combo/b2b → 0 or 1 lines depending on table.
// Use a triple to guarantee non-zero distribution in 3+ player tests.
const TRIPLE = {
  linesCleared: 3 as const,
  tSpin: "none" as const,
  combo: 0,
  b2b: -1,
};

// ---------------------------------------------------------------------------
// Distribution
// ---------------------------------------------------------------------------

describe("GarbageManager — distribution", () => {
  it("routes outgoing garbage to the single opponent (2 players)", () => {
    const clock = createClock();
    const gm = new GarbageManager({
      playerIds: PLAYERS,
      now: clock.now,
      gapRng: fixedRng(0),
      delayMs: 500,
    });

    const outcome = gm.onLinesCleared("p1", TETRIS);
    expect(outcome.total).toBeGreaterThanOrEqual(4);
    expect(outcome.cancelled).toBe(0);
    expect(outcome.residualSent).toBe(outcome.total);
    expect(outcome.affectedReceivers).toEqual(["p2"]);
    expect(gm.getPending("p1")).toEqual([]);
    const p2Pending = gm.getPending("p2");
    expect(p2Pending).toHaveLength(1);
    expect(p2Pending[0]!.lines).toBe(outcome.total);
  });

  it("splits evenly across 3+ opponents (default even-split)", () => {
    const clock = createClock();
    const gm = new GarbageManager({
      playerIds: FOUR,
      now: clock.now,
      gapRng: fixedRng(0.5),
    });

    const outcome = gm.onLinesCleared("p1", TETRIS);
    const total = outcome.total;

    // 4-player session → 3 opponents. total=4 → 2/1/1 distribution.
    const pendings = [
      gm.getPending("p2"),
      gm.getPending("p3"),
      gm.getPending("p4"),
    ];
    const received = pendings.map((q) =>
      q.reduce((sum, b) => sum + b.lines, 0),
    );
    expect(received.reduce((a, b) => a + b, 0)).toBe(total);
    // Deterministic ordering: remainder goes to earliest opponents.
    // With total=4 and 3 opponents: 2,1,1.
    if (total === 4) expect(received).toEqual([2, 1, 1]);
  });

  it("excludes a sender with no opponents", () => {
    const gm = new GarbageManager({
      playerIds: ["p1"],
      now: createClock().now,
      gapRng: fixedRng(0),
    });
    const outcome = gm.onLinesCleared("p1", TETRIS);
    expect(outcome.residualSent).toBe(0);
    expect(outcome.affectedReceivers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Delay timer
// ---------------------------------------------------------------------------

describe("GarbageManager — delay timer", () => {
  it("does not drain before delayMs has elapsed", () => {
    const clock = createClock(1000);
    const gm = new GarbageManager({
      playerIds: PLAYERS,
      now: clock.now,
      gapRng: fixedRng(0),
      delayMs: 500,
    });

    gm.onLinesCleared("p1", TETRIS);

    // Right before readyAt
    clock.advance(499);
    expect(gm.drainReady("p2")).toEqual([]);
    expect(gm.getPending("p2")).toHaveLength(1);

    // At readyAt
    clock.advance(1);
    const drained = gm.drainReady("p2");
    expect(drained).toHaveLength(1);
    expect(drained[0]!.lines).toBeGreaterThan(0);
    expect(gm.getPending("p2")).toEqual([]);
  });

  it("drains all entries whose readyAt has passed in one call", () => {
    const clock = createClock(0);
    const gm = new GarbageManager({
      playerIds: PLAYERS,
      now: clock.now,
      gapRng: fixedRng(0),
      delayMs: 100,
    });

    gm.onLinesCleared("p1", TETRIS); // readyAt = 100
    clock.advance(50);
    gm.onLinesCleared("p1", TETRIS); // readyAt = 150
    clock.advance(50); // now = 100
    // First entry ready, second not yet
    expect(gm.drainReady("p2")).toHaveLength(1);
    expect(gm.getPending("p2")).toHaveLength(1);
    clock.advance(50); // now = 150
    expect(gm.drainReady("p2")).toHaveLength(1);
    expect(gm.getPending("p2")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

describe("GarbageManager — cancellation", () => {
  it("cancels sender's pending incoming when they clear lines", () => {
    const clock = createClock();
    const gm = new GarbageManager({
      playerIds: PLAYERS,
      now: clock.now,
      gapRng: fixedRng(0),
      delayMs: 500,
    });

    // p2 sends garbage to p1 (p1 now has incoming).
    const sent = gm.onLinesCleared("p2", TETRIS);
    const incomingToP1 = sent.total;
    expect(gm.getPending("p1")).toHaveLength(1);
    expect(gm.getPending("p1")[0]!.lines).toBe(incomingToP1);

    // p1 clears a Tetris → cancels all (or most) of their incoming.
    const outcome = gm.onLinesCleared("p1", TETRIS);
    const expectedCancel = Math.min(outcome.total, incomingToP1);
    expect(outcome.cancelled).toBe(expectedCancel);
    expect(outcome.residualSent).toBe(outcome.total - expectedCancel);
    expect(gm.getPending("p1").length).toBeLessThanOrEqual(1);
    // Residual was routed to p2 only if residual > 0.
    if (outcome.residualSent > 0) {
      expect(outcome.affectedReceivers).toContain("p2");
    }
    expect(outcome.affectedReceivers).toContain("p1");
  });

  it("partial-cancels the head entry without consuming it", () => {
    const clock = createClock();
    const gm = new GarbageManager({
      playerIds: PLAYERS,
      now: clock.now,
      gapRng: fixedRng(0),
      delayMs: 500,
    });

    // Seed p1's queue directly via a fake send from p2 with a large batch.
    gm.onLinesCleared("p2", {
      linesCleared: 4,
      tSpin: "none",
      combo: 0,
      b2b: 0, // b2b bonus bumps total above 4
    });
    const beforeLines = gm
      .getPending("p1")
      .reduce((sum, b) => sum + b.lines, 0);
    expect(beforeLines).toBeGreaterThanOrEqual(4);

    // p1 clears a double → sends 1 base line, partially cancelling.
    gm.onLinesCleared("p1", {
      linesCleared: 2,
      tSpin: "none",
      combo: 0,
      b2b: -1,
    });
    const afterLines = gm
      .getPending("p1")
      .reduce((sum, b) => sum + b.lines, 0);
    expect(afterLines).toBeLessThan(beforeLines);
  });
});

// ---------------------------------------------------------------------------
// Queue state accuracy
// ---------------------------------------------------------------------------

describe("GarbageManager — queue state broadcast accuracy", () => {
  it("getPending reflects enqueues, drains, and cancels", () => {
    const clock = createClock(0);
    const gm = new GarbageManager({
      playerIds: PLAYERS,
      now: clock.now,
      gapRng: fixedRng(0),
      delayMs: 100,
    });

    expect(gm.getPending("p2")).toEqual([]);

    gm.onLinesCleared("p1", TETRIS);
    expect(gm.getPending("p2")).toHaveLength(1);

    clock.advance(100);
    const drained = gm.drainReady("p2");
    expect(drained).toHaveLength(1);
    expect(gm.getPending("p2")).toEqual([]);
  });

  it("uses makeGarbageBatch factory shape for returned batches", () => {
    const clock = createClock();
    const gm = new GarbageManager({
      playerIds: PLAYERS,
      now: clock.now,
      gapRng: fixedRng(0),
    });
    gm.onLinesCleared("p1", TETRIS);
    const pending = gm.getPending("p2");
    // Shape matches the factory template.
    expect(pending[0]).toMatchObject(makeGarbageBatch({ lines: pending[0]!.lines }));
  });
});

// ---------------------------------------------------------------------------
// Pluggable strategy
// ---------------------------------------------------------------------------

describe("GarbageManager — pluggable targeting strategy", () => {
  it("accepts a custom strategy via setTargetingStrategy", () => {
    const clock = createClock();
    const gm = new GarbageManager({
      playerIds: TRIO,
      now: clock.now,
      gapRng: fixedRng(0),
    });

    // Custom strategy: send everything to p3.
    const stub: TargetingStrategy = {
      resolveTargets: (_sender, _players, ctx) => [
        { playerId: "p3", lines: ctx.linesToSend },
      ],
    };
    gm.setTargetingStrategy(stub);

    const outcome = gm.onLinesCleared("p1", TETRIS);
    expect(outcome.affectedReceivers).toEqual(["p3"]);
    expect(gm.getPending("p2")).toEqual([]);
    expect(gm.getPending("p3")).toHaveLength(1);
  });

  it("accepts a targeting strategy at construction time", () => {
    const stub: TargetingStrategy = {
      resolveTargets: (_sender, _players, ctx) => [
        { playerId: "p2", lines: ctx.linesToSend },
      ],
    };
    const gm = new GarbageManager({
      playerIds: TRIO,
      now: () => 0,
      gapRng: fixedRng(0),
      targetingStrategy: stub,
    });
    gm.onLinesCleared("p1", TRIPLE);
    expect(gm.getPending("p3")).toEqual([]);
    expect(gm.getPending("p2").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Player lifecycle
// ---------------------------------------------------------------------------

describe("GarbageManager — player lifecycle", () => {
  it("removePlayer skips routing to the removed player and drops their queue", () => {
    const clock = createClock();
    const gm = new GarbageManager({
      playerIds: TRIO,
      now: clock.now,
      gapRng: fixedRng(0),
    });

    // Seed p3 with some incoming
    gm.onLinesCleared("p1", TETRIS);
    expect(gm.getPending("p3").length).toBeGreaterThan(0);

    gm.removePlayer("p3");
    expect(gm.getPending("p3")).toEqual([]);

    // Now p1 sends again — should only target p2.
    gm.onLinesCleared("p1", TETRIS);
    expect(gm.getPending("p2").length).toBeGreaterThan(0);
    expect(gm.getPending("p3")).toEqual([]);
  });
});
