import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SoundManager } from "./sounds";
import type { SoundEvent } from "./sounds";

// ---------------------------------------------------------------------------
// Web Audio API mock
// ---------------------------------------------------------------------------

function createMockOscillator() {
  return {
    type: "sine" as OscillatorType,
    frequency: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockGain() {
  return {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
}

interface MockAudioContext {
  currentTime: number;
  state: AudioContextState;
  destination: {};
  createOscillator: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

let mockContextInstance: MockAudioContext | null = null;
let oscillatorInstances: ReturnType<typeof createMockOscillator>[];

let audioContextConstructorCalls: number;

function installMockAudioContext(): void {
  oscillatorInstances = [];
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

    it("plays more oscillators for tetris (4 lines) than single", () => {
      const sm1 = new SoundManager();
      sm1.play("lineClear1");
      const singleCount = oscillatorInstances.length;

      // Reset
      installMockAudioContext();

      const sm2 = new SoundManager();
      sm2.play("lineClear4");
      const tetrisCount = oscillatorInstances.length;

      expect(tetrisCount).toBeGreaterThan(singleCount);
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
