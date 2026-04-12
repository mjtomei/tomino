import { describe, it, expect } from "vitest";
import { AtmosphereEngine } from "../atmosphere-engine.js";
import type { GameSignals } from "../types.js";

function base(overrides: Partial<GameSignals> = {}): GameSignals {
  return {
    status: "playing",
    level: 1,
    stackHeight: 0,
    combo: -1,
    b2b: -1,
    linesCleared: 0,
    pendingGarbage: 0,
    ...overrides,
  };
}

describe("AtmosphereEngine — continuous outputs", () => {
  it("intensity rises with level", () => {
    const e = new AtmosphereEngine();
    const low = e.update(base({ level: 1 })).intensity;
    const mid = e.update(base({ level: 10 })).intensity;
    const high = e.update(base({ level: 20 })).intensity;
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("intensity rises with stack height", () => {
    const e = new AtmosphereEngine();
    const low = e.update(base({ stackHeight: 0 })).intensity;
    const high = e.update(base({ stackHeight: 18 })).intensity;
    expect(high).toBeGreaterThan(low);
  });

  it("intensity is clamped to [0,1]", () => {
    const e = new AtmosphereEngine();
    const { intensity } = e.update(base({ level: 999, stackHeight: 999 }));
    expect(intensity).toBeLessThanOrEqual(1);
    expect(intensity).toBeGreaterThanOrEqual(0);
  });

  it("danger rises with stack height and stays low at mid-board", () => {
    const e = new AtmosphereEngine();
    const empty = e.update(base({ stackHeight: 0 })).danger;
    const mid = e.update(base({ stackHeight: 10 })).danger;
    const high = e.update(base({ stackHeight: 18 })).danger;
    expect(empty).toBe(0);
    expect(mid).toBeLessThan(0.5);
    expect(high).toBeGreaterThan(mid);
    expect(high).toBeGreaterThan(0.7);
  });

  it("danger is boosted by pending garbage", () => {
    const e1 = new AtmosphereEngine();
    const e2 = new AtmosphereEngine();
    const a = e1.update(base({ stackHeight: 8, pendingGarbage: 0 })).danger;
    const b = e2.update(base({ stackHeight: 8, pendingGarbage: 6 })).danger;
    expect(b).toBeGreaterThan(a);
  });

  it("momentum tracks combo and b2b streaks", () => {
    const e = new AtmosphereEngine();
    expect(e.update(base({ combo: -1, b2b: -1 })).momentum).toBe(0);
    const comboOnly = e.update(base({ combo: 4, b2b: -1 })).momentum;
    const both = e.update(base({ combo: 4, b2b: 3 })).momentum;
    expect(comboOnly).toBeGreaterThan(0);
    expect(both).toBeGreaterThan(comboOnly);
  });

  it("momentum saturates at 1", () => {
    const e = new AtmosphereEngine();
    expect(e.update(base({ combo: 50, b2b: 50 })).momentum).toBe(1);
  });
});

describe("AtmosphereEngine — events", () => {
  it("emits no events on the first update", () => {
    const e = new AtmosphereEngine();
    const { events } = e.update(base({ linesCleared: 2 }));
    expect(events).toEqual([]);
  });

  it("fires lineClear on linesCleared delta", () => {
    const e = new AtmosphereEngine();
    e.update(base({ linesCleared: 0 }));
    const { events } = e.update(base({ linesCleared: 2 }));
    expect(events.some((ev) => ev.type === "lineClear")).toBe(true);
    expect(events.find((ev) => ev.type === "lineClear")?.magnitude).toBe(2);
  });

  it("fires tetris when four lines clear at once", () => {
    const e = new AtmosphereEngine();
    e.update(base({ linesCleared: 0 }));
    const { events } = e.update(base({ linesCleared: 4 }));
    expect(events.some((ev) => ev.type === "tetris")).toBe(true);
  });

  it("fires tSpin when lastLineClear marks a spin", () => {
    const e = new AtmosphereEngine();
    e.update(base({ linesCleared: 0 }));
    const { events } = e.update(
      base({
        linesCleared: 2,
        lastLineClear: { linesCleared: 2, tSpin: "full", combo: 0, b2b: 0 },
      }),
    );
    expect(events.some((ev) => ev.type === "tSpin")).toBe(true);
  });

  it("fires levelUp when level increments", () => {
    const e = new AtmosphereEngine();
    e.update(base({ level: 1 }));
    const { events } = e.update(base({ level: 2 }));
    expect(events.find((ev) => ev.type === "levelUp")?.magnitude).toBe(2);
  });

  it("fires garbageReceived on multiplayer cumulative delta", () => {
    const e = new AtmosphereEngine();
    const mp = (total: number) => ({
      opponentCount: 1,
      eliminations: 0,
      garbageSent: 0,
      garbageReceivedTotal: total,
    });
    e.update(base({ multiplayer: mp(0) }));
    const { events } = e.update(base({ multiplayer: mp(3) }));
    expect(events.find((ev) => ev.type === "garbageReceived")?.magnitude).toBe(
      3,
    );
  });

  it("events reset each tick", () => {
    const e = new AtmosphereEngine();
    e.update(base({ linesCleared: 0 }));
    e.update(base({ linesCleared: 2 }));
    const { events } = e.update(base({ linesCleared: 2 }));
    expect(events).toEqual([]);
  });

  it("does not fire events across a game reset", () => {
    const e = new AtmosphereEngine();
    e.update(base({ linesCleared: 5, level: 3 }));
    e.reset();
    const { events } = e.update(base({ linesCleared: 0, level: 1 }));
    expect(events).toEqual([]);
  });

  it("holds continuous values when paused", () => {
    const e = new AtmosphereEngine();
    const active = e.update(base({ level: 10, stackHeight: 10 }));
    const paused = e.update(base({ status: "paused", level: 10, stackHeight: 10 }));
    expect(paused.intensity).toBe(active.intensity);
    expect(paused.events).toEqual([]);
  });
});

describe("AtmosphereEngine — snapshots", () => {
  it("calm start → empty board, level 1", () => {
    const e = new AtmosphereEngine();
    const s = e.update(base({ level: 1, stackHeight: 0 }));
    expect({
      intensity: Number(s.intensity.toFixed(3)),
      danger: Number(s.danger.toFixed(3)),
      momentum: s.momentum,
    }).toMatchInlineSnapshot(`
      {
        "danger": 0,
        "intensity": 0,
        "momentum": 0,
      }
    `);
  });

  it("mid-game → level 6, half stack, small combo", () => {
    const e = new AtmosphereEngine();
    const s = e.update(
      base({ level: 6, stackHeight: 10, combo: 2, b2b: -1 }),
    );
    expect({
      intensity: Number(s.intensity.toFixed(3)),
      danger: Number(s.danger.toFixed(3)),
      momentum: Number(s.momentum.toFixed(3)),
    }).toMatchInlineSnapshot(`
      {
        "danger": 0.275,
        "intensity": 0.358,
        "momentum": 0.24,
      }
    `);
  });

  it("danger state → near top-out", () => {
    const e = new AtmosphereEngine();
    const s = e.update(
      base({ level: 15, stackHeight: 18, combo: 6, b2b: 4 }),
    );
    expect({
      intensity: Number(s.intensity.toFixed(3)),
      danger: Number(s.danger.toFixed(3)),
      momentum: Number(s.momentum.toFixed(3)),
    }).toMatchInlineSnapshot(`
      {
        "danger": 0.891,
        "intensity": 0.802,
        "momentum": 1,
      }
    `);
  });
});
