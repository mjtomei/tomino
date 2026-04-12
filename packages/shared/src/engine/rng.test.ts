import { describe, expect, it } from "vitest";
import { createRNG } from "./rng.js";

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("createRNG determinism", () => {
  it("same seed produces identical next() sequence", () => {
    const a = createRNG(42);
    const b = createRNG(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("same seed produces identical nextInt() sequence", () => {
    const a = createRNG(42);
    const b = createRNG(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextInt(0, 100)).toBe(b.nextInt(0, 100));
    }
  });

  it("seed 0 is deterministic", () => {
    const a = createRNG(0);
    const b = createRNG(0);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });
});

// ---------------------------------------------------------------------------
// Distribution / range
// ---------------------------------------------------------------------------

describe("createRNG distribution", () => {
  it("next() produces values in [0, 1)", () => {
    const rng = createRNG(123);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("nextInt() produces values in [min, max]", () => {
    const rng = createRNG(456);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it("nextInt() hits both endpoints (statistical)", () => {
    const rng = createRNG(789);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextInt(1, 6);
      if (v === 1) sawMin = true;
      if (v === 6) sawMax = true;
      if (sawMin && sawMax) break;
    }
    expect(sawMin).toBe(true);
    expect(sawMax).toBe(true);
  });

  it("next() has reasonable uniformity", () => {
    const rng = createRNG(999);
    const buckets = new Array(10).fill(0) as number[];
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const bucket = Math.floor(rng.next() * 10);
      buckets[bucket]!++;
    }
    const expected = n / 10;
    for (const count of buckets) {
      // Allow 5% deviation
      expect(count).toBeGreaterThan(expected * 0.95);
      expect(count).toBeLessThan(expected * 1.05);
    }
  });
});

// ---------------------------------------------------------------------------
// Independence
// ---------------------------------------------------------------------------

describe("createRNG independence", () => {
  it("different seeds produce different sequences", () => {
    const a = createRNG(1);
    const b = createRNG(2);
    const matches = Array.from({ length: 20 }, () => a.next() === b.next());
    expect(matches.some((m) => !m)).toBe(true);
  });

  it("two instances do not share state", () => {
    const a = createRNG(42);
    const b = createRNG(42);
    // Advance a by 50
    for (let i = 0; i < 50; i++) a.next();
    // b should still be at position 0 — its next value differs from a's
    const aVal = a.next();
    const bVal = b.next();
    expect(aVal).not.toBe(bVal);
  });
});

// ---------------------------------------------------------------------------
// nextInt edge cases
// ---------------------------------------------------------------------------

describe("createRNG nextInt edge cases", () => {
  it("min === max always returns that value", () => {
    const rng = createRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(rng.nextInt(5, 5)).toBe(5);
    }
  });

  it("works with negative ranges", () => {
    const rng = createRNG(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it("works with range of 2 (binary)", () => {
    const rng = createRNG(42);
    let saw0 = false;
    let saw1 = false;
    for (let i = 0; i < 100; i++) {
      const v = rng.nextInt(0, 1);
      if (v === 0) saw0 = true;
      if (v === 1) saw1 = true;
    }
    expect(saw0).toBe(true);
    expect(saw1).toBe(true);
  });

  it("works with large range", () => {
    const rng = createRNG(42);
    const max = 1_000_000;
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(0, max);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(max);
    }
  });
});

// ---------------------------------------------------------------------------
// Compatibility with randomizer RNG contract
// ---------------------------------------------------------------------------

describe("createRNG compatibility", () => {
  it("next() can be used as a () => number RNG function", () => {
    const rng = createRNG(42);
    // The randomizers accept rng?: () => number
    const rngFn: () => number = () => rng.next();
    const values = Array.from({ length: 10 }, rngFn);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
