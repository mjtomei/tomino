import { describe, it, expect } from "vitest";
import {
  BURST_DURATIONS,
  burstProgress,
  chromaticAlpha,
  createBursts,
  detectBursts,
  isBurstDone,
  rippleAlpha,
  rippleRadius,
  starburstRayLength,
  starburstRays,
  sweepOffsetX,
  type Burst,
} from "../event-bursts.js";
import type { AtmosphereEvent, GameSignals } from "../types.js";
import type { ThemePalette } from "../themes.js";

const palette: ThemePalette = {
  backgroundGradient: ["#000", "#111"],
  particleColors: ["#ff0", "#0ff", "#f0f"],
  accent: "#fff",
  boardBg: "#000",
  panelBg: "#000",
  gridLine: "rgba(0,0,0,0.1)",
};

function signals(overrides: Partial<GameSignals> = {}): GameSignals {
  return {
    status: "playing",
    level: 1,
    stackHeight: 0,
    combo: 0,
    b2b: -1,
    linesCleared: 0,
    pendingGarbage: 0,
    ...overrides,
  };
}

describe("detectBursts", () => {
  it("maps lineClear to a ripple burst", () => {
    const events: AtmosphereEvent[] = [{ type: "lineClear", magnitude: 1 }];
    const out = detectBursts(events, signals(), 0, palette);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("ripple");
  });

  it("maps tSpin to a starburst", () => {
    const events: AtmosphereEvent[] = [{ type: "tSpin", magnitude: 2 }];
    const out = detectBursts(events, signals(), 0, palette);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("starburst");
  });

  it("maps quad to a second ripple burst", () => {
    const events: AtmosphereEvent[] = [{ type: "quad", magnitude: 4 }];
    const out = detectBursts(events, signals(), 0, palette);
    expect(out[0]!.kind).toBe("ripple");
    expect(out[0]!.magnitude).toBeGreaterThanOrEqual(4);
  });

  it("maps levelUp to a chromatic burst", () => {
    const events: AtmosphereEvent[] = [{ type: "levelUp", magnitude: 3 }];
    const out = detectBursts(events, signals(), 0, palette);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("chromatic");
  });

  it("emits a back-to-back sweep alongside a line clear when b2b is active", () => {
    const events: AtmosphereEvent[] = [{ type: "lineClear", magnitude: 1 }];
    const out = detectBursts(events, signals({ b2b: 2 }), 0, palette);
    const kinds = out.map((b) => b.kind).sort();
    expect(kinds).toEqual(["ripple", "sweep"]);
  });

  it("ignores garbageReceived — no dedicated burst", () => {
    const events: AtmosphereEvent[] = [
      { type: "garbageReceived", magnitude: 3 },
    ];
    expect(detectBursts(events, signals(), 0, palette)).toHaveLength(0);
  });

  it("combo depth escalates ripple magnitude", () => {
    const small = createBursts(
      { type: "lineClear", magnitude: 1 },
      signals({ combo: 0 }),
      0,
      palette,
    )[0]!;
    const big = createBursts(
      { type: "lineClear", magnitude: 1 },
      signals({ combo: 6 }),
      0,
      palette,
    )[0]!;
    expect(big.magnitude).toBeGreaterThan(small.magnitude);
  });
});

function burst(kind: Burst["kind"], magnitude = 1): Burst {
  return {
    id: 0,
    kind,
    startedAt: 0,
    durationMs: BURST_DURATIONS[kind],
    magnitude,
    color: "#fff",
    secondaryColor: "#000",
  };
}

describe("rippleRadius", () => {
  it("starts at 0 and grows", () => {
    const b = burst("ripple", 1);
    const r0 = rippleRadius(b, 0, 200);
    const rMid = rippleRadius(b, 200, 200);
    const rEnd = rippleRadius(b, 700, 200);
    expect(r0).toBe(0);
    expect(rMid).toBeGreaterThan(r0);
    expect(rEnd).toBeGreaterThanOrEqual(rMid);
  });

  it("larger magnitude reaches further", () => {
    const small = rippleRadius(burst("ripple", 1), 700, 200);
    const big = rippleRadius(burst("ripple", 8), 700, 200);
    expect(big).toBeGreaterThan(small);
  });

  it("alpha decays to 0 at end of life", () => {
    const b = burst("ripple", 1);
    expect(rippleAlpha(b, 0)).toBeCloseTo(1);
    expect(rippleAlpha(b, 700)).toBeCloseTo(0);
  });
});

describe("starburstRays", () => {
  it("ray count escalates with magnitude", () => {
    expect(starburstRays(burst("starburst", 1)).count).toBeLessThan(
      starburstRays(burst("starburst", 4)).count,
    );
  });

  it("angles evenly distribute around a full circle", () => {
    const { count, angles } = starburstRays(burst("starburst", 2));
    expect(angles).toHaveLength(count);
    expect(angles[0]).toBe(0);
    expect(angles[count - 1]).toBeLessThan(Math.PI * 2);
  });

  it("ray length grows from 0 to maxLength", () => {
    const b = burst("starburst", 1);
    expect(starburstRayLength(b, 0, 100)).toBe(0);
    expect(starburstRayLength(b, 600, 100)).toBeCloseTo(100);
  });

  it("clamps to 6..24 rays", () => {
    expect(starburstRays(burst("starburst", 0)).count).toBeGreaterThanOrEqual(6);
    expect(starburstRays(burst("starburst", 100)).count).toBeLessThanOrEqual(24);
  });
});

describe("sweepOffsetX", () => {
  it("moves from left edge to right edge over the burst duration", () => {
    const b = burst("sweep", 1);
    expect(sweepOffsetX(b, 0, 600)).toBe(0);
    expect(sweepOffsetX(b, 800, 600)).toBeCloseTo(600);
    expect(sweepOffsetX(b, 400, 600)).toBeCloseTo(300);
  });
});

describe("chromaticAlpha", () => {
  it("peaks before midpoint and decays toward zero", () => {
    const b = burst("chromatic", 1);
    const rising = chromaticAlpha(b, 50);
    const peak = chromaticAlpha(b, 100);
    const late = chromaticAlpha(b, 450);
    expect(peak).toBeGreaterThan(rising);
    expect(late).toBeLessThan(peak);
    expect(chromaticAlpha(b, 500)).toBeCloseTo(0, 2);
  });
});

describe("isBurstDone / burstProgress", () => {
  it("reports not-done until duration elapses", () => {
    const b = burst("ripple", 1);
    expect(isBurstDone(b, 0)).toBe(false);
    expect(isBurstDone(b, 699)).toBe(false);
    expect(isBurstDone(b, 700)).toBe(true);
  });

  it("burstProgress is clamped to [0,1]", () => {
    const b = burst("ripple", 1);
    expect(burstProgress(b, -100)).toBe(0);
    expect(burstProgress(b, 10_000)).toBe(1);
  });
});
