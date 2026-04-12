import { describe, it, expect } from "vitest";
import {
  averageDirection,
  buildMultiplayerSignals,
  computeMatchIntensity,
  computeOpponentDirection,
  playMultiplayerEffect,
} from "../multiplayer-effects.js";
import { ParticleSystem } from "../particle-system.js";
import type { AtmosphereEvent } from "../types.js";

describe("computeMatchIntensity", () => {
  it("is 0 for an empty match", () => {
    expect(
      computeMatchIntensity({
        opponentCount: 0,
        eliminations: 0,
        garbageSent: 0,
        garbageReceivedTotal: 0,
      }),
    ).toBe(0);
  });

  it("rises with opponent count, garbage volume, and eliminations", () => {
    const calm = computeMatchIntensity({
      opponentCount: 2,
      eliminations: 0,
      garbageSent: 0,
      garbageReceivedTotal: 0,
    });
    const heated = computeMatchIntensity({
      opponentCount: 6,
      eliminations: 2,
      garbageSent: 15,
      garbageReceivedTotal: 10,
    });
    expect(heated).toBeGreaterThan(calm);
    expect(heated).toBeLessThanOrEqual(1);
  });

  it("is clamped to [0,1] in extreme cases", () => {
    const out = computeMatchIntensity({
      opponentCount: 100,
      eliminations: 100,
      garbageSent: 999,
      garbageReceivedTotal: 999,
    });
    expect(out).toBeLessThanOrEqual(1);
    expect(out).toBeGreaterThanOrEqual(0);
  });
});

describe("computeOpponentDirection", () => {
  it("returns unit vectors", () => {
    for (let total = 1; total <= 6; total++) {
      for (let slot = 0; slot < total; slot++) {
        const v = computeOpponentDirection(slot, total);
        const len = Math.hypot(v.x, v.y);
        expect(len).toBeCloseTo(1, 5);
      }
    }
  });

  it("middle slot of odd counts points horizontally", () => {
    const v = computeOpponentDirection(1, 3);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.x).toBeGreaterThan(0);
  });

  it("top slot has negative y, bottom slot has positive y", () => {
    const top = computeOpponentDirection(0, 4);
    const bottom = computeOpponentDirection(3, 4);
    expect(top.y).toBeLessThan(0);
    expect(bottom.y).toBeGreaterThan(0);
  });
});

describe("averageDirection", () => {
  it("defaults to {1,0} when empty", () => {
    expect(averageDirection([], 3)).toEqual({ x: 1, y: 0 });
  });

  it("averages symmetric slots to horizontal", () => {
    const avg = averageDirection([0, 2], 3);
    expect(avg.y).toBeCloseTo(0, 5);
    expect(avg.x).toBeCloseTo(1, 5);
  });
});

describe("playMultiplayerEffect", () => {
  const ctx = {
    center: { x: 100, y: 200 },
    incomingDir: { x: 1, y: 0 },
    outgoingDir: { x: 1, y: 0 },
    spawnRadius: 300,
  };

  it("emits particles for garbageReceived", () => {
    const sys = new ParticleSystem();
    const n = playMultiplayerEffect(
      sys,
      { type: "garbageReceived", magnitude: 3 } as AtmosphereEvent,
      ctx,
    );
    expect(n).toBeGreaterThan(0);
    expect(sys.count()).toBe(n);
  });

  it("emits particles for garbageSent", () => {
    const sys = new ParticleSystem();
    const n = playMultiplayerEffect(
      sys,
      { type: "garbageSent", magnitude: 2 } as AtmosphereEvent,
      ctx,
    );
    expect(n).toBeGreaterThan(0);
    expect(sys.count()).toBe(n);
  });

  it("emits particles for opponentEliminated", () => {
    const sys = new ParticleSystem();
    const n = playMultiplayerEffect(
      sys,
      { type: "opponentEliminated", magnitude: 1 } as AtmosphereEvent,
      ctx,
    );
    expect(n).toBe(24);
    expect(sys.count()).toBe(24);
  });

  it("emits nothing for unrelated events", () => {
    const sys = new ParticleSystem();
    const n = playMultiplayerEffect(
      sys,
      { type: "lineClear", magnitude: 2 } as AtmosphereEvent,
      ctx,
    );
    expect(n).toBe(0);
    expect(sys.count()).toBe(0);
  });

  it("magnitude scales the incoming particle count", () => {
    const sys = new ParticleSystem();
    const small = playMultiplayerEffect(
      sys,
      { type: "garbageReceived", magnitude: 1 } as AtmosphereEvent,
      ctx,
    );
    const sys2 = new ParticleSystem();
    const big = playMultiplayerEffect(
      sys2,
      { type: "garbageReceived", magnitude: 6 } as AtmosphereEvent,
      ctx,
    );
    expect(big).toBeGreaterThan(small);
  });
});

describe("buildMultiplayerSignals", () => {
  it("passes through aggregated counters", () => {
    const s = buildMultiplayerSignals({
      opponentCount: 4,
      eliminations: 1,
      garbageSent: 7,
      garbageReceivedTotal: 5,
    });
    expect(s).toEqual({
      opponentCount: 4,
      eliminations: 1,
      garbageSent: 7,
      garbageReceivedTotal: 5,
    });
  });
});
