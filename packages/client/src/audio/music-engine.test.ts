import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MusicEngine } from "./music-engine";
import type { AtmosphereState } from "../atmosphere/types";

// ---------------------------------------------------------------------------
// Minimal Web Audio mock — same shape as sounds.test.ts
// ---------------------------------------------------------------------------

function createMockParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function createMockOscillator() {
  return {
    type: "sine" as OscillatorType,
    frequency: createMockParam(),
    detune: createMockParam(),
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockGain() {
  return { gain: createMockParam(), connect: vi.fn() };
}

let mockContextInstance: {
  currentTime: number;
  state: AudioContextState;
  destination: object;
  createOscillator: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} | null = null;

let constructorCalls = 0;
let oscInstances: ReturnType<typeof createMockOscillator>[];
let gainInstances: ReturnType<typeof createMockGain>[];

function installMockAudioContext() {
  oscInstances = [];
  gainInstances = [];
  mockContextInstance = null;
  constructorCalls = 0;
  class MockAudioContext {
    currentTime = 0;
    state: AudioContextState = "running";
    destination = {};
    createOscillator = vi.fn(() => {
      const o = createMockOscillator();
      oscInstances.push(o);
      return o;
    });
    createGain = vi.fn(() => {
      const g = createMockGain();
      gainInstances.push(g);
      return g;
    });
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    constructor() {
      constructorCalls++;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      mockContextInstance = this as never;
    }
  }
  vi.stubGlobal("AudioContext", MockAudioContext);
}

function atmosphere(partial: Partial<AtmosphereState> = {}): AtmosphereState {
  return {
    intensity: 0,
    danger: 0,
    momentum: 0,
    events: [],
    ...partial,
  };
}

describe("MusicEngine", () => {
  beforeEach(() => {
    installMockAudioContext();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not create AudioContext on construction", () => {
    new MusicEngine("ambient");
    expect(constructorCalls).toBe(0);
  });

  it("creates AudioContext lazily on start()", () => {
    const eng = new MusicEngine("ambient");
    eng.start();
    expect(constructorCalls).toBe(1);
  });

  it("is idempotent on repeated start() calls", () => {
    const eng = new MusicEngine("ambient");
    eng.start();
    eng.start();
    expect(constructorCalls).toBe(1);
  });

  it("no-ops when AudioContext is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    const eng = new MusicEngine("ambient");
    expect(() => {
      eng.start();
      eng.sync(1, atmosphere({ intensity: 0.5 }));
      eng.stop();
      eng.dispose();
    }).not.toThrow();
  });

  it("readout reports genre and initial tempo", () => {
    const eng = new MusicEngine("synthwave");
    const r = eng.getReadout();
    expect(r.genreId).toBe("synthwave");
    expect(r.tempo).toBeCloseTo(110); // synthwave baseTempo at level 1
  });

  it("tempo increases with level via sync()", () => {
    const eng = new MusicEngine("synthwave");
    eng.sync(1, atmosphere());
    expect(eng.getReadout().tempo).toBeCloseTo(110);
    eng.sync(5, atmosphere());
    expect(eng.getReadout().tempo).toBeGreaterThan(110);
  });

  it("activeLayers grows with intensity", () => {
    const eng = new MusicEngine("ambient");
    eng.sync(1, atmosphere({ intensity: 0 }));
    const calm = eng.getReadout().activeLayers;
    eng.sync(1, atmosphere({ intensity: 0.9 }));
    const busy = eng.getReadout().activeLayers;
    expect(busy.length).toBeGreaterThanOrEqual(calm.length);
    expect(busy).toContain("bells");
  });

  it("mute/unmute ramps master gain without throwing", () => {
    const eng = new MusicEngine("ambient");
    eng.start();
    eng.setMuted(true);
    expect(eng.muted).toBe(true);
    eng.setMuted(false);
    expect(eng.muted).toBe(false);
  });

  it("setVolume clamps to [0,1]", () => {
    const eng = new MusicEngine("ambient");
    eng.setVolume(5);
    expect(eng.volume).toBe(1);
    eng.setVolume(-1);
    expect(eng.volume).toBe(0);
  });

  it("scheduler advances step count on timer tick", () => {
    const eng = new MusicEngine("ambient");
    eng.start();
    eng.sync(1, atmosphere({ intensity: 1 }));
    const before = eng.getReadout().stepCount;
    // Advance the lookahead timer several times. Also advance mock
    // ctx.currentTime so the schedule-ahead loop can progress.
    for (let i = 0; i < 20; i++) {
      if (mockContextInstance) mockContextInstance.currentTime += 0.05;
      vi.advanceTimersByTime(25);
    }
    const after = eng.getReadout().stepCount;
    expect(after).toBeGreaterThan(before);
  });

  it("levelUp event raises scaleRoot briefly", () => {
    const eng = new MusicEngine("ambient");
    eng.start();
    eng.sync(
      1,
      atmosphere({ intensity: 1, events: [{ type: "levelUp", magnitude: 2 }] }),
    );
    const lifted = eng.getReadout().scaleRoot;
    expect(lifted).toBe(60 + 7); // ambient root 60 + fifth
  });

  it("setGenre switches genre config", () => {
    const eng = new MusicEngine("ambient");
    eng.setGenre("chiptune");
    expect(eng.getReadout().genreId).toBe("chiptune");
  });

  it("dispose closes AudioContext", () => {
    const eng = new MusicEngine("ambient");
    eng.start();
    eng.dispose();
    expect(mockContextInstance?.close).toHaveBeenCalled();
  });
});
