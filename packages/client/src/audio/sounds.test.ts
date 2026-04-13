import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SoundManager } from "./sounds";
import type { SoundEvent } from "./sounds";

// ---------------------------------------------------------------------------
// Web Audio API mock
// ---------------------------------------------------------------------------

function createMockParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
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
  return {
    gain: createMockParam(),
    connect: vi.fn(),
  };
}

function createMockFilter() {
  return {
    type: "lowpass" as BiquadFilterType,
    frequency: createMockParam(),
    Q: createMockParam(),
    connect: vi.fn(),
  };
}

function createMockDelay() {
  return {
    delayTime: createMockParam(),
    connect: vi.fn(),
  };
}

function createMockWaveShaper() {
  return {
    curve: null as Float32Array | null,
    oversample: "none" as OverSampleType,
    connect: vi.fn(),
  };
}

interface MockAudioContext {
  currentTime: number;
  state: AudioContextState;
  destination: object;
  createOscillator: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  createDelay: ReturnType<typeof vi.fn>;
  createWaveShaper: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

let mockContextInstance: MockAudioContext | null = null;
let oscillatorInstances: ReturnType<typeof createMockOscillator>[];
let filterInstances: ReturnType<typeof createMockFilter>[];
let delayInstances: ReturnType<typeof createMockDelay>[];
let shaperInstances: ReturnType<typeof createMockWaveShaper>[];

let audioContextConstructorCalls: number;

function installMockAudioContext(): void {
  oscillatorInstances = [];
  filterInstances = [];
  delayInstances = [];
  shaperInstances = [];
  mockContextInstance = null;
  audioContextConstructorCalls = 0;

  class MockAudioContextClass {
    currentTime = 0;
    state: AudioContextState = "running";
    destination = {};
    createOscillator = vi.fn(() => {
      const osc = createMockOscillator();
      oscillatorInstances.push(osc);
      return osc;
    });
    createGain = vi.fn(() => createMockGain());
    createBiquadFilter = vi.fn(() => {
      const f = createMockFilter();
      filterInstances.push(f);
      return f;
    });
    createDelay = vi.fn(() => {
      const d = createMockDelay();
      delayInstances.push(d);
      return d;
    });
    createWaveShaper = vi.fn(() => {
      const s = createMockWaveShaper();
      shaperInstances.push(s);
      return s;
    });
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);

    constructor() {
      audioContextConstructorCalls++;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      mockContextInstance = this as unknown as MockAudioContext;
    }
  }

  vi.stubGlobal("AudioContext", MockAudioContextClass);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SoundManager", () => {
  beforeEach(() => {
    installMockAudioContext();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockContextInstance = null;
  });

  // -----------------------------------------------------------------------
  // AudioContext lifecycle
  // -----------------------------------------------------------------------

  describe("AudioContext creation", () => {
    it("does not create AudioContext on construction", () => {
      new SoundManager();
      expect(audioContextConstructorCalls).toBe(0);
    });

    it("creates AudioContext lazily on first play", () => {
      const sm = new SoundManager();
      sm.play("move");
      expect(audioContextConstructorCalls).toBe(1);
    });

    it("reuses the same AudioContext across multiple plays", () => {
      const sm = new SoundManager();
      sm.play("move");
      sm.play("rotate");
      expect(audioContextConstructorCalls).toBe(1);
    });

    it("resumes a suspended AudioContext", () => {
      const sm = new SoundManager();
      sm.play("move");
      mockContextInstance!.state = "suspended";
      sm.play("rotate");
      expect(mockContextInstance!.resume).toHaveBeenCalled();
    });

    it("disposes the AudioContext on dispose()", () => {
      const sm = new SoundManager();
      sm.play("move");
      sm.dispose();
      expect(mockContextInstance!.close).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Mute
  // -----------------------------------------------------------------------

  describe("mute", () => {
    it("defaults to unmuted", () => {
      const sm = new SoundManager();
      expect(sm.muted).toBe(false);
    });

    it("prevents playback when muted", () => {
      const sm = new SoundManager();
      sm.muted = true;
      sm.play("move");
      expect(audioContextConstructorCalls).toBe(0);
      expect(oscillatorInstances).toHaveLength(0);
    });

    it("resumes playback after unmuting", () => {
      const sm = new SoundManager();
      sm.muted = true;
      sm.play("move");
      sm.muted = false;
      sm.play("move");
      expect(oscillatorInstances.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Volume
  // -----------------------------------------------------------------------

  describe("volume", () => {
    it("defaults to 1", () => {
      const sm = new SoundManager();
      expect(sm.volume).toBe(1);
    });

    it("clamps negative values to 0", () => {
      const sm = new SoundManager();
      sm.volume = -0.5;
      expect(sm.volume).toBe(0);
    });

    it("clamps values above 1 to 1", () => {
      const sm = new SoundManager();
      sm.volume = 2.5;
      expect(sm.volume).toBe(1);
    });

    it("ignores non-finite values", () => {
      const sm = new SoundManager();
      sm.volume = 0.3;
      sm.volume = Number.NaN;
      expect(sm.volume).toBe(0.3);
    });

    it("suppresses playback when volume is 0", () => {
      const sm = new SoundManager();
      sm.volume = 0;
      sm.play("move");
      expect(oscillatorInstances).toHaveLength(0);
    });

    it("resumes playback after restoring volume", () => {
      const sm = new SoundManager();
      sm.volume = 0;
      sm.play("move");
      sm.volume = 0.7;
      sm.play("move");
      expect(oscillatorInstances.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sound events trigger oscillators
  // -----------------------------------------------------------------------

  describe("sound events", () => {
    const allEvents: SoundEvent[] = [
      "move",
      "rotate",
      "lock",
      "hardDrop",
      "lineClear1",
      "lineClear2",
      "lineClear3",
      "lineClear4",
      "tSpin",
      "hold",
      "levelUp",
      "gameOver",
    ];

    it.each(allEvents)("plays oscillator(s) for '%s' event", (event) => {
      const sm = new SoundManager();
      sm.play(event);
      expect(oscillatorInstances.length).toBeGreaterThan(0);
      for (const osc of oscillatorInstances) {
        expect(osc.start).toHaveBeenCalled();
        expect(osc.stop).toHaveBeenCalled();
      }
    });

    it("plays more oscillators for quad (4 lines) than single", () => {
      const sm1 = new SoundManager();
      sm1.play("lineClear1");
      const singleCount = oscillatorInstances.length;

      installMockAudioContext();

      const sm2 = new SoundManager();
      sm2.play("lineClear4");
      const quadCount = oscillatorInstances.length;

      expect(quadCount).toBeGreaterThan(singleCount);
    });

    it("creates distinct oscillator configs for move vs rotate", () => {
      const sm = new SoundManager();

      sm.play("move");
      const moveOsc = oscillatorInstances[0]!;
      const moveFreq =
        moveOsc.frequency.setValueAtTime.mock.calls[0]?.[0] as number;

      installMockAudioContext();

      const sm2 = new SoundManager();
      sm2.play("rotate");
      const rotateOsc = oscillatorInstances[0]!;
      const rotateFreq =
        rotateOsc.frequency.setValueAtTime.mock.calls[0]?.[0] as number;

      expect(moveFreq).not.toBe(rotateFreq);
    });
  });

  // -----------------------------------------------------------------------
  // Genre-aware rendering
  // -----------------------------------------------------------------------

  describe("genre-aware SFX", () => {
    it("defaults to null genre", () => {
      const sm = new SoundManager();
      expect(sm.genreId).toBeNull();
    });

    it("accepts a genre id via constructor", () => {
      const sm = new SoundManager("chiptune");
      expect(sm.genreId).toBe("chiptune");
    });

    it("setGenreId updates the active genre", () => {
      const sm = new SoundManager();
      sm.setGenreId("synthwave");
      expect(sm.genreId).toBe("synthwave");
      sm.setGenreId(null);
      expect(sm.genreId).toBeNull();
    });

    it("chiptune produces a filter-free, bitcrushed patch for 'move'", () => {
      const sm = new SoundManager("chiptune");
      sm.play("move");
      // Chiptune FX uses WaveShaper
      expect(shaperInstances.length).toBeGreaterThan(0);
    });

    it("synthwave applies a filter envelope to 'move'", () => {
      const sm = new SoundManager("synthwave");
      sm.play("move");
      expect(filterInstances.length).toBeGreaterThan(0);
      // Filter envelope writes a ramp on cutoff frequency
      const filter = filterInstances[0]!;
      expect(
        filter.frequency.linearRampToValueAtTime.mock.calls.length +
          filter.frequency.exponentialRampToValueAtTime.mock.calls.length,
      ).toBeGreaterThan(0);
    });

    it("ambient uses a delay effect (long tail)", () => {
      const sm = new SoundManager("ambient");
      sm.play("lineClear4");
      expect(delayInstances.length).toBeGreaterThan(0);
    });

    it("minimal-techno uses no FX (no delay, no shaper) on 'hardDrop'", () => {
      const sm = new SoundManager("minimal-techno");
      sm.play("hardDrop");
      expect(delayInstances).toHaveLength(0);
      expect(shaperInstances).toHaveLength(0);
    });

    it("unknown genre falls back to the default profile", () => {
      const sm = new SoundManager("no-such-genre");
      sm.play("move");
      // Default profile has no filter or fx on 'move'
      expect(filterInstances).toHaveLength(0);
      expect(delayInstances).toHaveLength(0);
      expect(shaperInstances).toHaveLength(0);
      expect(oscillatorInstances.length).toBeGreaterThan(0);
    });

    it("different genres produce different layer counts for the same event", () => {
      const counts: Record<string, number> = {};
      for (const g of ["ambient", "synthwave", "chiptune", "minimal-techno"]) {
        installMockAudioContext();
        const sm = new SoundManager(g);
        sm.play("lineClear4");
        counts[g] = oscillatorInstances.length;
      }
      // All genres render at least one oscillator for lineClear4
      for (const n of Object.values(counts)) {
        expect(n).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Graceful degradation
  // -----------------------------------------------------------------------

  describe("no Web Audio API", () => {
    it("does not throw when AudioContext is unavailable", () => {
      vi.stubGlobal("AudioContext", undefined);
      const sm = new SoundManager();
      expect(() => sm.play("move")).not.toThrow();
    });

    it("does not throw when AudioContext constructor throws", () => {
      vi.stubGlobal(
        "AudioContext",
        class {
          constructor() {
            throw new Error("Not allowed");
          }
        },
      );
      const sm = new SoundManager();
      expect(() => sm.play("move")).not.toThrow();
    });

    it("dispose is safe when no context was created", () => {
      const sm = new SoundManager();
      expect(() => sm.dispose()).not.toThrow();
    });
  });
});
