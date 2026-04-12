import { describe, it, expect } from "vitest";
import {
  activeLayers,
  computeTempo,
  fillPattern,
  isLayerActive,
  layerIntensityThreshold,
  midiToHz,
  noteFromDegree,
  shiftScale,
  stepDurationMs,
  stepToDegree,
} from "./music-layers";
import { GENRES } from "../atmosphere/genres";
import type { Layer } from "../atmosphere/genres";

function makeLayer(threshold: number, name = "l"): Layer {
  return {
    name,
    instrument: {
      name,
      timbre: "sine",
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 },
      gain: 0.2,
    },
    pattern: { steps: new Array(16).fill(0) },
    activationThreshold: threshold,
  };
}

describe("layer activation thresholds", () => {
  it("maps activationThreshold/10 to intensity", () => {
    expect(layerIntensityThreshold(makeLayer(0))).toBe(0);
    expect(layerIntensityThreshold(makeLayer(3))).toBeCloseTo(0.3);
    expect(layerIntensityThreshold(makeLayer(10))).toBe(1);
  });

  it("activates when intensity >= threshold", () => {
    const l = makeLayer(3);
    expect(isLayerActive(l, 0.29)).toBe(false);
    expect(isLayerActive(l, 0.3)).toBe(true);
    expect(isLayerActive(l, 1)).toBe(true);
  });

  it("always includes threshold-0 layers at zero intensity", () => {
    const g = GENRES.ambient!;
    const names = activeLayers(g, 0).map((l) => l.name);
    expect(names).toContain("pad");
    expect(names).not.toContain("bells");
  });

  it("adds higher layers as intensity climbs", () => {
    const g = GENRES.ambient!;
    expect(activeLayers(g, 0.35).map((l) => l.name)).toContain("bells");
  });
});

describe("computeTempo", () => {
  it("returns base tempo at level 1", () => {
    expect(computeTempo(120, 1)).toBe(120);
  });

  it("increases monotonically with level", () => {
    const t1 = computeTempo(120, 1);
    const t5 = computeTempo(120, 5);
    const t10 = computeTempo(120, 10);
    expect(t5).toBeGreaterThan(t1);
    expect(t10).toBeGreaterThan(t5);
  });

  it("caps at 2x base tempo", () => {
    expect(computeTempo(100, 999)).toBe(200);
  });

  it("clamps level<1 to level 1", () => {
    expect(computeTempo(120, 0)).toBe(120);
    expect(computeTempo(120, -5)).toBe(120);
  });
});

describe("stepDurationMs", () => {
  it("computes 16th note duration from bpm", () => {
    // 120 bpm → 500 ms per beat → 125 ms per 16th
    expect(stepDurationMs(120)).toBeCloseTo(125);
  });
});

describe("shiftScale", () => {
  it("passes through when danger is low", () => {
    const major = [0, 2, 4, 5, 7, 9, 11];
    expect(shiftScale(major, 0.3)).toEqual(major);
  });

  it("flattens the 3rd when danger > 0.6", () => {
    const shifted = shiftScale([0, 2, 4, 5, 7, 9, 11], 0.7);
    expect(shifted[2]).toBe(3);
  });

  it("flattens 3rd and 5th when danger > 0.85", () => {
    const shifted = shiftScale([0, 2, 4, 5, 7, 9, 11], 0.9);
    expect(shifted[2]).toBe(3);
    expect(shifted[4]).toBe(6);
  });

  it("passes pentatonic through (too short for safe flatten)", () => {
    const pent = [0, 2, 4, 7, 9];
    expect(shiftScale(pent, 0.9)).toEqual([0, 2, 3, 7, 8]);
  });
});

describe("noteFromDegree", () => {
  const major = [0, 2, 4, 5, 7, 9, 11];
  it("returns root at degree 0", () => {
    expect(noteFromDegree(60, major, 0)).toBe(60);
  });
  it("wraps octave for degree beyond scale length", () => {
    expect(noteFromDegree(60, major, 7)).toBe(72);
    expect(noteFromDegree(60, major, 8)).toBe(74);
  });
  it("handles negative degrees", () => {
    expect(noteFromDegree(60, major, -1)).toBe(60 - 12 + 11);
  });
});

describe("midiToHz", () => {
  it("returns 440 for A4 (midi 69)", () => {
    expect(midiToHz(69)).toBeCloseTo(440);
  });
});

describe("fillPattern", () => {
  it("fills empty steps with low-velocity hits", () => {
    const filled = fillPattern([1, 0, 0, 1]);
    expect(filled[0]).toBe(1);
    expect(filled[1]).toBe(0.4);
    expect(filled[2]).toBe(0.4);
    expect(filled[3]).toBe(1);
  });
});

describe("stepToDegree", () => {
  it("returns 0 for silent step", () => {
    expect(stepToDegree(0, 0)).toBe(0);
  });
  it("returns non-negative degrees for audible steps", () => {
    for (let s = 0; s < 16; s++) {
      expect(stepToDegree(s, 1)).toBeGreaterThanOrEqual(0);
    }
  });
});
