import { describe, it, expect } from "vitest";
import {
  hexToHsl,
  hslToHex,
  computeShimmer,
  computeGridPulse,
  computeBreathe,
  computeGlint,
  glintContribution,
  SHIMMER_LIGHTNESS_AMPLITUDE,
  SHIMMER_HUE_AMPLITUDE,
  GRID_PULSE_BASE_ALPHA,
  GRID_PULSE_MAX_ALPHA,
  BREATHE_AMPLITUDE,
  GLINT_INTERVAL_MS,
  GLINT_DURATION_MS,
} from "../board-life.js";

const BASE = "#00D4D4";

describe("hexToHsl / hslToHex round trip", () => {
  it("round-trips pure red", () => {
    const hsl = hexToHsl("#ff0000");
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
    expect(hex).toBe("#ff0000");
  });
  it("round-trips a teal", () => {
    const hsl = hexToHsl(BASE);
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
    expect(hex.toLowerCase()).toBe(BASE.toLowerCase());
  });
  it("handles grayscale", () => {
    const hsl = hexToHsl("#808080");
    expect(hsl.s).toBe(0);
    expect(hslToHex(hsl.h, hsl.s, hsl.l)).toBe("#808080");
  });
});

describe("computeShimmer", () => {
  it("preserves baseline when now=0 and intensity=0", () => {
    expect(computeShimmer(BASE, 0, 0, 5)).toBe(BASE);
  });
  it("is deterministic in (now, intensity, seed)", () => {
    const a = computeShimmer(BASE, 1234, 0.5, 3);
    const b = computeShimmer(BASE, 1234, 0.5, 3);
    expect(a).toBe(b);
  });
  it("lightness stays within amplitude budget", () => {
    const base = hexToHsl(BASE);
    for (let t = 0; t < 10000; t += 137) {
      const out = hexToHsl(computeShimmer(BASE, t, 1, 0));
      expect(Math.abs(out.l - base.l)).toBeLessThanOrEqual(
        SHIMMER_LIGHTNESS_AMPLITUDE + 1e-3,
      );
    }
  });
  it("different cell seeds produce different phases", () => {
    const a = computeShimmer(BASE, 500, 1, 0);
    const b = computeShimmer(BASE, 500, 1, 7);
    expect(a).not.toBe(b);
  });
  it("accent pulls hue toward accent direction", () => {
    // Base is cyan (~180°), accent is magenta (~300°) → hue should land
    // between the unaccented case and the accent.
    const no = hexToHsl(computeShimmer(BASE, 300, 1, 0));
    const withAccent = hexToHsl(computeShimmer(BASE, 300, 1, 0, "#ff00aa"));
    // Hue should differ by at least a couple of degrees.
    expect(Math.abs(withAccent.h - no.h)).toBeGreaterThan(1);
    // And stay within SHIMMER_HUE_AMPLITUDE of the pulled center.
    expect(Math.abs(withAccent.h - no.h)).toBeLessThan(
      SHIMMER_HUE_AMPLITUDE + 20,
    );
  });
});

describe("computeGridPulse", () => {
  it("returns base alpha when quiet", () => {
    expect(computeGridPulse(0, 0).alpha).toBeCloseTo(GRID_PULSE_BASE_ALPHA);
  });
  it("stays within alpha envelope", () => {
    for (let t = 0; t < 20000; t += 113) {
      const a = computeGridPulse(t, 1).alpha;
      expect(a).toBeGreaterThanOrEqual(GRID_PULSE_BASE_ALPHA - 1e-6);
      expect(a).toBeLessThanOrEqual(GRID_PULSE_MAX_ALPHA + 1e-6);
    }
  });
  it("higher intensity increases the envelope", () => {
    // Sample at 1/4 period where sin peaks.
    const quiet = computeGridPulse(1200, 0).alpha;
    const loud = computeGridPulse(1200, 1).alpha;
    expect(loud).toBeGreaterThan(quiet);
  });
});

describe("computeBreathe", () => {
  it("returns 1 at now=0", () => {
    expect(computeBreathe(0, 1)).toBe(1);
  });
  it("stays within amplitude", () => {
    for (let t = 0; t < 20000; t += 97) {
      const b = computeBreathe(t, 1);
      expect(Math.abs(b - 1)).toBeLessThanOrEqual(BREATHE_AMPLITUDE + 1e-6);
    }
  });
});

describe("computeGlint", () => {
  it("is inactive at t=0", () => {
    expect(computeGlint(0, 10, 20).active).toBe(false);
  });
  it("fires once per interval for GLINT_DURATION_MS", () => {
    // Early in the interval — active.
    const early = computeGlint(100, 10, 20);
    expect(early.active).toBe(true);
    // Past duration but before next interval — inactive.
    const gap = computeGlint(GLINT_DURATION_MS + 500, 10, 20);
    expect(gap.active).toBe(false);
    // Next epoch starts active again.
    const next = computeGlint(GLINT_INTERVAL_MS + 10, 10, 20);
    expect(next.active).toBe(true);
  });
  it("strength envelope peaks mid-duration", () => {
    const start = computeGlint(10, 10, 20).strength;
    const mid = computeGlint(GLINT_DURATION_MS / 2, 10, 20).strength;
    const late = computeGlint(GLINT_DURATION_MS - 10, 10, 20).strength;
    expect(mid).toBeGreaterThan(start);
    expect(mid).toBeGreaterThan(late);
  });
  it("alternates direction between epochs", () => {
    const e0 = computeGlint(100, 10, 20);
    const e1 = computeGlint(GLINT_INTERVAL_MS + 100, 10, 20);
    // Different epochs should produce different headCol at same progress.
    expect(e0.headCol).not.toBe(e1.headCol);
  });
});

describe("glintContribution", () => {
  it("is 0 when inactive", () => {
    const g = computeGlint(GLINT_DURATION_MS + 2000, 10, 20);
    expect(glintContribution(g, 5, 5)).toBe(0);
  });
  it("decays to 0 outside falloff", () => {
    const g = computeGlint(GLINT_DURATION_MS / 2, 10, 20);
    const far = glintContribution(g, 99, 99);
    expect(far).toBe(0);
  });
  it("returns positive when cell is near sweep head", () => {
    const g = computeGlint(GLINT_DURATION_MS / 2, 10, 20);
    const c = glintContribution(g, Math.round(g.headCol), Math.round(g.headRow));
    expect(c).toBeGreaterThan(0);
  });
});
