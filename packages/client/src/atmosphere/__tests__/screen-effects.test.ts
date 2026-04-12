import { describe, it, expect } from "vitest";
import {
  computeVignetteOpacity,
  computeVignetteColor,
  computeShakeMagnitude,
  computeFlashOpacity,
  decayTransient,
  VIGNETTE_MAX_OPACITY,
  SHAKE_HARD_DROP_PX,
  SHAKE_GARBAGE_MIN_PX,
  SHAKE_GARBAGE_MAX_PX,
  FLASH_MAX_OPACITY,
} from "../screen-effects.js";

describe("computeVignetteOpacity", () => {
  it("is zero at zero danger", () => {
    expect(computeVignetteOpacity(0)).toBe(0);
  });
  it("scales linearly up to VIGNETTE_MAX_OPACITY at danger=1", () => {
    expect(computeVignetteOpacity(1)).toBeCloseTo(VIGNETTE_MAX_OPACITY, 5);
    expect(computeVignetteOpacity(0.5)).toBeCloseTo(VIGNETTE_MAX_OPACITY / 2, 5);
  });
  it("clamps negative and >1 input", () => {
    expect(computeVignetteOpacity(-0.5)).toBe(0);
    expect(computeVignetteOpacity(2)).toBeCloseTo(VIGNETTE_MAX_OPACITY, 5);
  });
});

describe("computeVignetteColor", () => {
  it("returns pure accent at zero danger", () => {
    expect(computeVignetteColor("#4fd4ff", 0)).toBe("rgb(79, 212, 255)");
  });
  it("returns alarm red at max danger", () => {
    expect(computeVignetteColor("#4fd4ff", 1)).toBe("rgb(255, 32, 48)");
  });
  it("blends accent and red at mid danger", () => {
    const mid = computeVignetteColor("#000000", 0.5);
    // halfway from black to red(255,32,48)
    expect(mid).toBe("rgb(128, 16, 24)");
  });
  it("falls back to red on malformed accent", () => {
    expect(computeVignetteColor("not-a-hex", 0.3)).toBe("rgb(255, 32, 48)");
  });
});

describe("computeShakeMagnitude", () => {
  it("hard drop is a small fixed thump", () => {
    expect(computeShakeMagnitude("hardDrop", 1)).toBe(SHAKE_HARD_DROP_PX);
    // magnitude input is ignored for hard drop
    expect(computeShakeMagnitude("hardDrop", 99)).toBe(SHAKE_HARD_DROP_PX);
  });
  it("garbage scales from MIN at 1 line to MAX at 4 lines", () => {
    expect(computeShakeMagnitude("garbageReceived", 1)).toBeCloseTo(
      SHAKE_GARBAGE_MIN_PX,
      5,
    );
    expect(computeShakeMagnitude("garbageReceived", 4)).toBeCloseTo(
      SHAKE_GARBAGE_MAX_PX,
      5,
    );
    const mid = computeShakeMagnitude("garbageReceived", 2);
    expect(mid).toBeGreaterThan(SHAKE_GARBAGE_MIN_PX);
    expect(mid).toBeLessThan(SHAKE_GARBAGE_MAX_PX);
  });
  it("clamps garbage > 4 to MAX", () => {
    expect(computeShakeMagnitude("garbageReceived", 10)).toBeCloseTo(
      SHAKE_GARBAGE_MAX_PX,
      5,
    );
  });
  it("zero garbage produces no shake", () => {
    expect(computeShakeMagnitude("garbageReceived", 0)).toBe(0);
  });
  it("unrelated event types produce no shake", () => {
    expect(computeShakeMagnitude("lineClear", 4)).toBe(0);
    expect(computeShakeMagnitude("tetris", 4)).toBe(0);
  });
});

describe("computeFlashOpacity", () => {
  it("is zero for no lines", () => {
    expect(computeFlashOpacity(0)).toBe(0);
    expect(computeFlashOpacity(-1)).toBe(0);
  });
  it("reaches max at 4 lines", () => {
    expect(computeFlashOpacity(4)).toBeCloseTo(FLASH_MAX_OPACITY, 5);
  });
  it("scales with line count", () => {
    expect(computeFlashOpacity(1)).toBeCloseTo(FLASH_MAX_OPACITY / 4, 5);
    expect(computeFlashOpacity(2)).toBeCloseTo(FLASH_MAX_OPACITY / 2, 5);
  });
  it("clamps > 4 lines to the ceiling", () => {
    expect(computeFlashOpacity(10)).toBeCloseTo(FLASH_MAX_OPACITY, 5);
  });
});

describe("decayTransient", () => {
  it("halves value after one half-life", () => {
    expect(decayTransient(1, 60, 60)).toBeCloseTo(0.5, 5);
  });
  it("quarters value after two half-lives", () => {
    expect(decayTransient(1, 120, 60)).toBeCloseTo(0.25, 5);
  });
  it("returns 0 once value decays below threshold", () => {
    expect(decayTransient(0.0001, 60, 60)).toBe(0);
  });
  it("returns 0 for zero input", () => {
    expect(decayTransient(0, 100, 60)).toBe(0);
  });
  it("handles zero half-life safely", () => {
    expect(decayTransient(1, 10, 0)).toBe(0);
  });
  it("monotonically decreases toward zero", () => {
    let v = 1;
    const prior: number[] = [];
    for (let i = 0; i < 10; i++) {
      v = decayTransient(v, 30, 60);
      prior.push(v);
    }
    for (let i = 1; i < prior.length; i++) {
      expect(prior[i]).toBeLessThanOrEqual(prior[i - 1]);
    }
    expect(prior[prior.length - 1]).toBeLessThan(0.05);
  });
});
