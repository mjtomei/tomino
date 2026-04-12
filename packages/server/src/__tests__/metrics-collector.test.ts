import { describe, it, expect, beforeEach } from "vitest";
import { MetricsCollector, type PieceLockEvent } from "../metrics-collector.js";

function lock(
  linesCleared: number,
  tSpin: PieceLockEvent["tSpin"] = "none",
  combo = -1,
): PieceLockEvent {
  return { linesCleared, tSpin, combo };
}

describe("MetricsCollector", () => {
  let c: MetricsCollector;
  beforeEach(() => {
    c = new MetricsCollector();
  });

  describe("APM", () => {
    it("computes actions-per-minute from injected timestamps", () => {
      c.start(0);
      for (let i = 0; i < 120; i++) c.recordAction();
      c.end(60_000);
      expect(c.snapshot().apm).toBe(120);
    });

    it("scales correctly for sub-minute games", () => {
      c.start(0);
      for (let i = 0; i < 60; i++) c.recordAction();
      c.end(30_000); // 30 seconds → 120 apm
      expect(c.snapshot().apm).toBe(120);
    });

    it("returns 0 when duration is zero (no divide-by-zero)", () => {
      c.start(1000);
      c.recordAction();
      c.end(1000);
      const snap = c.snapshot();
      expect(snap.apm).toBe(0);
      expect(snap.pps).toBe(0);
    });
  });

  describe("PPS", () => {
    it("computes pieces-per-second from lock count and duration", () => {
      c.start(0);
      for (let i = 0; i < 30; i++) c.recordPieceLock(lock(0));
      c.end(60_000); // 60s → 0.5 pps
      expect(c.snapshot().pps).toBe(0.5);
    });

    it("handles fractional piece rates", () => {
      c.start(0);
      for (let i = 0; i < 4; i++) c.recordPieceLock(lock(0));
      c.end(2_000); // 2s, 4 pieces → 2 pps
      expect(c.snapshot().pps).toBe(2);
    });
  });

  describe("Line clears", () => {
    it("sums linesCleared across all locks", () => {
      c.start(0);
      c.recordPieceLock(lock(1));
      c.recordPieceLock(lock(0));
      c.recordPieceLock(lock(4));
      c.recordPieceLock(lock(2));
      c.end(1_000);
      expect(c.snapshot().linesCleared).toBe(7);
    });
  });

  describe("T-spin counting", () => {
    it("counts full and mini t-spins, ignores 'none'", () => {
      c.start(0);
      c.recordPieceLock(lock(0, "none"));
      c.recordPieceLock(lock(1, "full"));
      c.recordPieceLock(lock(1, "mini"));
      c.recordPieceLock(lock(0, "none"));
      c.recordPieceLock(lock(2, "full"));
      c.end(1_000);
      expect(c.snapshot().tSpins).toBe(3);
    });
  });

  describe("Max combo tracking", () => {
    it("tracks the highest combo counter value seen", () => {
      c.start(0);
      // Sequence: 2 non-clearing, then 4 consecutive clears (combo 0,1,2,3), then break
      c.recordPieceLock(lock(0, "none", -1));
      c.recordPieceLock(lock(0, "none", -1));
      c.recordPieceLock(lock(1, "none", 0));
      c.recordPieceLock(lock(1, "none", 1));
      c.recordPieceLock(lock(1, "none", 2));
      c.recordPieceLock(lock(1, "none", 3));
      c.recordPieceLock(lock(0, "none", -1));
      c.end(1_000);
      expect(c.snapshot().maxCombo).toBe(3);
    });

    it("never drops below zero when combos reset to -1", () => {
      c.start(0);
      c.recordPieceLock(lock(0, "none", -1));
      c.recordPieceLock(lock(0, "none", -1));
      c.end(1_000);
      expect(c.snapshot().maxCombo).toBe(0);
    });
  });

  describe("reset between games", () => {
    it("clears all state so the same instance can be reused", () => {
      c.start(0);
      for (let i = 0; i < 10; i++) c.recordAction();
      c.recordPieceLock(lock(4, "full", 5));
      c.end(60_000);

      c.reset();
      c.start(1_000_000);
      c.recordAction();
      c.recordPieceLock(lock(1, "none", 0));
      c.end(1_060_000);

      const snap = c.snapshot();
      expect(snap.apm).toBe(1);
      expect(snap.pps).toBeCloseTo(1 / 60);
      expect(snap.linesCleared).toBe(1);
      expect(snap.tSpins).toBe(0);
      expect(snap.maxCombo).toBe(0);
    });

    it("start() implicitly resets prior state", () => {
      c.start(0);
      c.recordAction();
      c.recordPieceLock(lock(4, "full", 7));
      // no end() — just re-start
      c.start(0);
      c.recordPieceLock(lock(1, "none", 0));
      c.end(60_000);
      const snap = c.snapshot();
      expect(snap.linesCleared).toBe(1);
      expect(snap.tSpins).toBe(0);
      expect(snap.maxCombo).toBe(0);
      expect(snap.apm).toBe(0);
    });
  });

  describe("Snapshot accuracy at game end", () => {
    it("produces a PerformanceMetrics reflecting all accumulated events", () => {
      c.start(0);
      // 180 actions over 90 seconds → apm = 120
      for (let i = 0; i < 180; i++) c.recordAction();
      // 45 pieces → pps = 0.5
      // mix of clears, tSpins, combo peaks
      for (let i = 0; i < 40; i++) c.recordPieceLock(lock(0, "none", -1));
      c.recordPieceLock(lock(1, "full", 0));
      c.recordPieceLock(lock(2, "none", 1));
      c.recordPieceLock(lock(1, "mini", 2));
      c.recordPieceLock(lock(4, "none", 3));
      c.recordPieceLock(lock(0, "none", -1));
      c.end(90_000);

      const snap = c.snapshot();
      expect(snap.apm).toBe(120);
      expect(snap.pps).toBe(0.5);
      expect(snap.linesCleared).toBe(8);
      expect(snap.tSpins).toBe(2);
      expect(snap.maxCombo).toBe(3);
    });

    it("returns all-zero metrics for an empty game", () => {
      c.start(0);
      c.end(60_000);
      expect(c.snapshot()).toEqual({
        apm: 0,
        pps: 0,
        linesCleared: 0,
        tSpins: 0,
        maxCombo: 0,
      });
    });
  });

  describe("defensive behavior", () => {
    it("ignores events before start()", () => {
      c.recordAction();
      c.recordPieceLock(lock(4, "full", 10));
      c.start(0);
      c.end(60_000);
      const snap = c.snapshot();
      expect(snap.apm).toBe(0);
      expect(snap.pps).toBe(0);
      expect(snap.linesCleared).toBe(0);
      expect(snap.tSpins).toBe(0);
      expect(snap.maxCombo).toBe(0);
    });

    it("ignores events after end()", () => {
      c.start(0);
      c.recordAction();
      c.recordPieceLock(lock(1, "full", 0));
      c.end(60_000);
      c.recordAction();
      c.recordPieceLock(lock(4, "full", 9));
      const snap = c.snapshot();
      expect(snap.apm).toBe(1);
      expect(snap.linesCleared).toBe(1);
      expect(snap.tSpins).toBe(1);
      expect(snap.maxCombo).toBe(0);
    });

    it("end() is idempotent — second call does not extend duration", () => {
      c.start(0);
      for (let i = 0; i < 60; i++) c.recordAction();
      c.end(60_000);
      c.end(120_000); // should be ignored
      expect(c.snapshot().apm).toBe(60);
    });

    it("snapshot() before end() returns zeros for rate metrics", () => {
      c.start(0);
      c.recordAction();
      c.recordPieceLock(lock(2, "full", 1));
      const snap = c.snapshot();
      expect(snap.apm).toBe(0);
      expect(snap.pps).toBe(0);
      // counts still visible
      expect(snap.linesCleared).toBe(2);
      expect(snap.tSpins).toBe(1);
      expect(snap.maxCombo).toBe(1);
    });
  });
});
