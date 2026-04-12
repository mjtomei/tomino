import { describe, it, expect } from "vitest";
import { FlowDetector } from "../flow-detection.js";
import type { GameSignals } from "../types.js";

function base(overrides: Partial<GameSignals> = {}): GameSignals {
  return {
    status: "playing",
    level: 5,
    stackHeight: 6,
    combo: -1,
    b2b: -1,
    linesCleared: 0,
    pendingGarbage: 0,
    ...overrides,
  };
}

/**
 * Drive a skilled-play sequence: one line clear every `stepMs` with
 * combo + b2b maintained. Returns the detector so further updates can
 * be issued.
 */
function skilledRun(
  detector: FlowDetector,
  opts: { startTime: number; steps: number; stepMs: number; startLines?: number },
): { lastNow: number; lastLines: number } {
  const startLines = opts.startLines ?? 0;
  let t = opts.startTime;
  let lines = startLines;
  // seed
  detector.update(base({ linesCleared: lines }), t);
  for (let i = 0; i < opts.steps; i++) {
    t += opts.stepMs;
    lines += 1;
    detector.update(
      base({
        linesCleared: lines,
        combo: Math.min(i + 1, 6),
        b2b: Math.min(i + 1, 4),
        stackHeight: 6,
      }),
      t,
    );
  }
  return { lastNow: t, lastLines: lines };
}

describe("FlowDetector — rolling window & entry", () => {
  it("first update returns defaults", () => {
    const d = new FlowDetector();
    const r = d.update(base(), 0);
    expect(r.active).toBe(false);
    expect(r.level).toBe(0);
    expect(r.clearsPerMinute).toBe(0);
  });

  it("clearsPerMinute rises as clears accumulate in the window", () => {
    const d = new FlowDetector();
    const { lastNow } = skilledRun(d, { startTime: 1_000, steps: 10, stepMs: 1000 });
    const r = d.update(
      base({ linesCleared: 10, combo: 6, b2b: 4, stackHeight: 6 }),
      lastNow + 100,
    );
    // 10 clears over a 30s window → 20 cpm. Allow small rounding slack.
    expect(r.clearsPerMinute).toBeGreaterThan(18);
    expect(r.clearsPerMinute).toBeLessThanOrEqual(22);
  });

  it("enters flow after sustained skilled play", () => {
    const d = new FlowDetector();
    // 20 clears at 600ms each → ~100 cpm (way above threshold), and
    // sustainedEntryMs = 4000ms is easily exceeded.
    const { lastNow, lastLines } = skilledRun(d, {
      startTime: 1_000,
      steps: 20,
      stepMs: 600,
    });
    const r = d.update(
      base({ linesCleared: lastLines, combo: 6, b2b: 4, stackHeight: 6 }),
      lastNow + 10,
    );
    expect(r.active).toBe(true);
    expect(r.level).toBeGreaterThan(0.5);
  });

  it("does NOT enter flow when play is slow (low cpm)", () => {
    const d = new FlowDetector();
    // 3 clears over 30s = 6 cpm, nowhere near 24 cpm target.
    const { lastNow } = skilledRun(d, { startTime: 1_000, steps: 3, stepMs: 10_000 });
    const r = d.update(base({ linesCleared: 3, stackHeight: 6 }), lastNow + 100);
    expect(r.active).toBe(false);
  });

  it("does NOT enter flow with a tall stack", () => {
    const d = new FlowDetector();
    let t = 1_000;
    let lines = 0;
    d.update(base({ linesCleared: 0, stackHeight: 15 }), t);
    for (let i = 0; i < 10; i++) {
      t += 600;
      lines += 1;
      d.update(
        base({ linesCleared: lines, combo: i + 1, b2b: i + 1, stackHeight: 15 }),
        t,
      );
    }
    const r = d.getReadout();
    expect(r.active).toBe(false);
  });
});

describe("FlowDetector — hysteresis & exits", () => {
  it("brief dip under exit threshold does not immediately exit", () => {
    const d = new FlowDetector();
    const { lastNow, lastLines } = skilledRun(d, {
      startTime: 1_000,
      steps: 20,
      stepMs: 600,
    });
    expect(d.getReadout().active).toBe(true);
    // One tick with no new clear — raw score drops slightly but should
    // stay above exit threshold because cpm is still high.
    const r = d.update(
      base({ linesCleared: lastLines, combo: 6, b2b: 4, stackHeight: 6 }),
      lastNow + 200,
    );
    expect(r.active).toBe(true);
  });

  it("hard break on top-out exits immediately", () => {
    const d = new FlowDetector();
    const { lastNow, lastLines } = skilledRun(d, {
      startTime: 1_000,
      steps: 20,
      stepMs: 600,
    });
    expect(d.getReadout().active).toBe(true);
    const r = d.update(
      base({ linesCleared: lastLines, stackHeight: 18, combo: 6, b2b: 4 }),
      lastNow + 50,
    );
    expect(r.active).toBe(false);
    expect(r.level).toBe(0);
  });

  it("combo drop from positive → -1 exits flow (misdrop proxy)", () => {
    const d = new FlowDetector();
    const { lastNow, lastLines } = skilledRun(d, {
      startTime: 1_000,
      steps: 20,
      stepMs: 600,
    });
    expect(d.getReadout().active).toBe(true);
    const r = d.update(
      base({ linesCleared: lastLines, combo: -1, b2b: 4, stackHeight: 6 }),
      lastNow + 50,
    );
    expect(r.active).toBe(false);
  });

  it("big garbage batch exits flow", () => {
    const d = new FlowDetector();
    const { lastNow, lastLines } = skilledRun(d, {
      startTime: 1_000,
      steps: 20,
      stepMs: 600,
    });
    expect(d.getReadout().active).toBe(true);
    const mp = (total: number) => ({
      opponentCount: 1,
      eliminations: 0,
      garbageSent: 0,
      garbageReceivedTotal: total,
    });
    // Seed with mp: 0 so the delta is observable.
    d.update(
      base({ linesCleared: lastLines, combo: 6, b2b: 4, stackHeight: 6, multiplayer: mp(0) }),
      lastNow + 10,
    );
    const r = d.update(
      base({ linesCleared: lastLines, combo: 6, b2b: 4, stackHeight: 6, multiplayer: mp(4) }),
      lastNow + 20,
    );
    expect(r.active).toBe(false);
  });

  it("paused status freezes the detector without breaking flow", () => {
    const d = new FlowDetector();
    const { lastNow, lastLines } = skilledRun(d, {
      startTime: 1_000,
      steps: 20,
      stepMs: 600,
    });
    expect(d.getReadout().active).toBe(true);
    const r = d.update(
      base({ status: "paused", linesCleared: lastLines }),
      lastNow + 5_000,
    );
    expect(r.active).toBe(true);
  });

  it("reset() clears all internal state", () => {
    const d = new FlowDetector();
    skilledRun(d, { startTime: 1_000, steps: 20, stepMs: 600 });
    expect(d.getReadout().active).toBe(true);
    d.reset();
    const r = d.getReadout();
    expect(r.active).toBe(false);
    expect(r.level).toBe(0);
    expect(r.sustainedMs).toBe(0);
  });
});

describe("FlowDetector — sustained-entry hysteresis", () => {
  it("high raw score for < sustainedEntryMs does not enter yet", () => {
    const d = new FlowDetector({ sustainedEntryMs: 10_000 });
    const { lastNow } = skilledRun(d, {
      startTime: 1_000,
      steps: 6,
      stepMs: 500,
    });
    // Only ~3s of elapsed time — below the 10s sustain gate.
    const r = d.update(
      base({ linesCleared: 6, combo: 6, b2b: 4, stackHeight: 6 }),
      lastNow + 50,
    );
    expect(r.active).toBe(false);
    expect(r.sustainedMs).toBeLessThan(10_000);
  });
});

describe("FlowDetector — snapshot", () => {
  it("skilled sequence produces expected snapshot", () => {
    const d = new FlowDetector();
    const { lastNow, lastLines } = skilledRun(d, {
      startTime: 0,
      steps: 20,
      stepMs: 600,
    });
    const r = d.update(
      base({ linesCleared: lastLines, combo: 6, b2b: 4, stackHeight: 6 }),
      lastNow + 10,
    );
    expect({
      active: r.active,
      rawScoreGt: r.rawScore > 0.7,
      cpmGt: r.clearsPerMinute > 18,
    }).toEqual({ active: true, rawScoreGt: true, cpmGt: true });
  });

  it("non-skilled sequence stays inert", () => {
    const d = new FlowDetector();
    // Slow, tall, broken combos.
    let t = 0;
    let lines = 0;
    d.update(base(), t);
    for (let i = 0; i < 6; i++) {
      t += 5000;
      if (i % 2 === 0) lines += 1;
      d.update(
        base({
          linesCleared: lines,
          combo: i % 2 === 0 ? 1 : -1,
          stackHeight: 12,
        }),
        t,
      );
    }
    const r = d.getReadout();
    expect(r.active).toBe(false);
    expect(r.level).toBeLessThan(0.5);
  });
});
