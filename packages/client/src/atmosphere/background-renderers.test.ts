import { describe, it, expect } from "vitest";
import {
  computeBackgroundParams,
  mixColor,
  shiftTowardDanger,
  renderBackground,
} from "./background-renderers.js";
import { getTheme } from "./themes.js";
import type { AtmosphereState } from "./types.js";

const theme = getTheme("neon-city");

function atmo(partial: Partial<AtmosphereState> = {}): AtmosphereState {
  return {
    intensity: 0,
    danger: 0,
    momentum: 0,
    events: [],
    ...partial,
  };
}

describe("mixColor", () => {
  it("returns a at t=0 and b at t=1", () => {
    expect(mixColor("#000000", "#ffffff", 0).toLowerCase()).toBe("#000000");
    expect(mixColor("#000000", "#ffffff", 1).toLowerCase()).toBe("#ffffff");
  });
  it("blends halfway", () => {
    const m = mixColor("#000000", "#ffffff", 0.5);
    expect(m.toLowerCase()).toBe("#808080");
  });
  it("falls back when a color is invalid", () => {
    expect(mixColor("not-a-color", "#ffffff", 0.5)).toBe("not-a-color");
  });
  it("clamps t outside 0..1", () => {
    expect(mixColor("#000000", "#ffffff", -1).toLowerCase()).toBe("#000000");
    expect(mixColor("#000000", "#ffffff", 2).toLowerCase()).toBe("#ffffff");
  });
});

describe("shiftTowardDanger", () => {
  it("is identity at danger=0", () => {
    expect(shiftTowardDanger("#4fd4ff", 0).toLowerCase()).toBe("#4fd4ff");
  });
  it("shifts toward red as danger rises", () => {
    const low = shiftTowardDanger("#4fd4ff", 0.3);
    const high = shiftTowardDanger("#4fd4ff", 0.9);
    const redness = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(redness(high)).toBeGreaterThan(redness(low));
    expect(redness(low)).toBeGreaterThan(redness("#4fd4ff"));
  });
});

describe("computeBackgroundParams", () => {
  it("low intensity produces lower density and speed than high intensity", () => {
    const low = computeBackgroundParams(atmo({ intensity: 0.05 }), theme);
    const high = computeBackgroundParams(atmo({ intensity: 0.95 }), theme);
    expect(high.density).toBeGreaterThan(low.density);
    expect(high.speed).toBeGreaterThan(low.speed);
    expect(high.warmth).toBeGreaterThan(low.warmth);
  });

  it("danger drives agitation and warmth", () => {
    const calm = computeBackgroundParams(atmo({ intensity: 0.5 }), theme);
    const scared = computeBackgroundParams(
      atmo({ intensity: 0.5, danger: 0.9 }),
      theme,
    );
    expect(scared.agitation).toBeGreaterThan(calm.agitation);
    expect(scared.warmth).toBeGreaterThan(calm.warmth);
  });

  it("danger shifts gradient colors toward red", () => {
    const safe = computeBackgroundParams(atmo(), theme);
    const danger = computeBackgroundParams(atmo({ danger: 1 }), theme);
    expect(danger.gradient).not.toEqual(safe.gradient);
    const redChannel = (hex: string) => parseInt(hex.slice(1, 3), 16);
    for (let i = 0; i < safe.gradient.length; i++) {
      expect(redChannel(danger.gradient[i]!)).toBeGreaterThanOrEqual(
        redChannel(safe.gradient[i]!),
      );
    }
  });

  it("is deterministic for identical inputs", () => {
    const a = computeBackgroundParams(
      atmo({ intensity: 0.4, danger: 0.2, momentum: 0.3 }),
      theme,
    );
    const b = computeBackgroundParams(
      atmo({ intensity: 0.4, danger: 0.2, momentum: 0.3 }),
      theme,
    );
    expect(a).toEqual(b);
  });

  it("clamps outputs to 0..1", () => {
    const p = computeBackgroundParams(
      atmo({ intensity: 5, danger: 5, momentum: 5 }),
      theme,
    );
    for (const k of ["density", "speed", "warmth", "agitation"] as const) {
      expect(p[k]).toBeGreaterThanOrEqual(0);
      expect(p[k]).toBeLessThanOrEqual(1);
    }
  });
});

describe("renderBackground", () => {
  // Minimal 2D context stub for testing render dispatch without a DOM.
  function makeCtx() {
    const calls: string[] = [];
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      globalAlpha: 1,
      createLinearGradient: () => ({
        addColorStop: () => calls.push("addColorStop"),
      }),
      fillRect: () => calls.push("fillRect"),
      clearRect: () => calls.push("clearRect"),
      beginPath: () => calls.push("beginPath"),
      moveTo: () => calls.push("moveTo"),
      lineTo: () => calls.push("lineTo"),
      arc: () => calls.push("arc"),
      fill: () => calls.push("fill"),
      stroke: () => calls.push("stroke"),
      closePath: () => calls.push("closePath"),
      setTransform: () => calls.push("setTransform"),
    } as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  }

  it("draws a gradient fill for every theme pattern", () => {
    for (const id of ["deep-ocean", "neon-city", "void", "aurora"]) {
      const t = getTheme(id);
      const { ctx, calls } = makeCtx();
      const params = computeBackgroundParams(atmo({ intensity: 0.5 }), t);
      renderBackground(ctx, params, t, { width: 400, height: 600 }, 0);
      expect(calls).toContain("fillRect");
    }
  });

  it("noops on zero-size canvas", () => {
    const { ctx, calls } = makeCtx();
    const params = computeBackgroundParams(atmo(), theme);
    renderBackground(ctx, params, theme, { width: 0, height: 0 }, 0);
    expect(calls).toHaveLength(0);
  });
});
