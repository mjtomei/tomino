/**
 * SFX profiles — per-genre synth patches for every SoundEvent.
 *
 * A profile is a dictionary keyed by SoundEvent; each entry (SfxPatch)
 * describes one or more oscillator layers, an optional filter with
 * envelope, a gain envelope, an optional effect, and a total duration.
 */

import type { SoundEvent } from "./sounds.js";
import type {
  EnvelopeShape,
  FilterConfig,
  FxConfig,
  OscLayer,
} from "./synth-helpers.js";

export interface SfxPatch {
  /** Total active duration (seconds) — not counting envelope release. */
  duration: number;
  /** Master gain multiplier for this patch. */
  gain: number;
  layers: OscLayer[];
  envelope: EnvelopeShape;
  filter?: FilterConfig;
  fx?: FxConfig;
}

export type SfxProfile = Record<SoundEvent, SfxPatch>;

// ---------------------------------------------------------------------------
// Shared envelope templates
// ---------------------------------------------------------------------------

const ENV_CLICK: EnvelopeShape = {
  attack: 0.002,
  decay: 0.02,
  sustain: 0.0,
  release: 0.02,
  peak: 1,
};

const ENV_PLUCK: EnvelopeShape = {
  attack: 0.003,
  decay: 0.08,
  sustain: 0.2,
  release: 0.05,
  peak: 1,
};

const ENV_TONE: EnvelopeShape = {
  attack: 0.01,
  decay: 0.1,
  sustain: 0.5,
  release: 0.08,
  peak: 1,
};

const ENV_PAD: EnvelopeShape = {
  attack: 0.05,
  decay: 0.2,
  sustain: 0.6,
  release: 0.4,
  peak: 1,
};

// ---------------------------------------------------------------------------
// Default profile — matches the original generic oscillator sounds.
// Used when no genre is set or an unknown genre is passed.
// ---------------------------------------------------------------------------

export const DEFAULT_SFX_PROFILE: SfxProfile = {
  move: {
    duration: 0.05,
    gain: 0.08,
    envelope: ENV_CLICK,
    layers: [{ type: "square", frequency: 300 }],
  },
  rotate: {
    duration: 0.08,
    gain: 0.1,
    envelope: ENV_CLICK,
    layers: [
      { type: "square", frequency: 400, ramps: [{ target: 600, at: 0.08 }] },
    ],
  },
  lock: {
    duration: 0.12,
    gain: 0.15,
    envelope: ENV_PLUCK,
    layers: [{ type: "triangle", frequency: 150 }],
  },
  hardDrop: {
    duration: 0.15,
    gain: 0.2,
    envelope: ENV_PLUCK,
    layers: [
      {
        type: "sawtooth",
        frequency: 200,
        ramps: [{ target: 60, at: 0.15, curve: "exponential" }],
      },
      { type: "square", frequency: 80, gainMul: 0.6 },
    ],
  },
  lineClear1: {
    duration: 0.2,
    gain: 0.12,
    envelope: ENV_TONE,
    layers: [{ type: "sine", frequency: 500 }],
  },
  lineClear2: {
    duration: 0.24,
    gain: 0.12,
    envelope: ENV_TONE,
    layers: [
      { type: "sine", frequency: 600 },
      { type: "sine", frequency: 680, gainMul: 0.7 },
    ],
  },
  lineClear3: {
    duration: 0.28,
    gain: 0.13,
    envelope: ENV_TONE,
    layers: [
      { type: "sine", frequency: 700 },
      { type: "sine", frequency: 780, gainMul: 0.7 },
      { type: "sine", frequency: 860, gainMul: 0.5 },
    ],
  },
  lineClear4: {
    duration: 0.5,
    gain: 0.14,
    envelope: ENV_PAD,
    layers: [
      { type: "sine", frequency: 800 },
      { type: "sine", frequency: 880, gainMul: 0.7 },
      { type: "sine", frequency: 960, gainMul: 0.5 },
      { type: "sine", frequency: 1200, gainMul: 0.4 },
    ],
  },
  tSpin: {
    duration: 0.3,
    gain: 0.15,
    envelope: ENV_TONE,
    layers: [
      {
        type: "sine",
        frequency: 500,
        ramps: [
          { target: 800, at: 0.1 },
          { target: 600, at: 0.2 },
          { target: 900, at: 0.3 },
        ],
      },
    ],
  },
  hold: {
    duration: 0.1,
    gain: 0.1,
    envelope: ENV_PLUCK,
    layers: [
      { type: "sine", frequency: 600, ramps: [{ target: 400, at: 0.1 }] },
    ],
  },
  levelUp: {
    duration: 0.5,
    gain: 0.12,
    envelope: ENV_TONE,
    layers: [
      { type: "sine", frequency: 523 },
      { type: "sine", frequency: 659, gainMul: 0.8 },
      { type: "sine", frequency: 784, gainMul: 0.7 },
      { type: "sine", frequency: 1047, gainMul: 0.6 },
    ],
  },
  gameOver: {
    duration: 0.8,
    gain: 0.12,
    envelope: ENV_PAD,
    layers: [
      {
        type: "sawtooth",
        frequency: 400,
        ramps: [{ target: 100, at: 0.8, curve: "exponential" }],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Chiptune — 8-bit bleeps; square/triangle, bitcrusher FX
// ---------------------------------------------------------------------------

const CHIPTUNE_FX: FxConfig = { kind: "bitcrusher", bits: 5, mix: 1 };

export const CHIPTUNE_SFX_PROFILE: SfxProfile = {
  move: {
    duration: 0.04,
    gain: 0.1,
    envelope: ENV_CLICK,
    layers: [{ type: "square", frequency: 660 }],
    fx: CHIPTUNE_FX,
  },
  rotate: {
    duration: 0.06,
    gain: 0.11,
    envelope: ENV_CLICK,
    layers: [
      { type: "square", frequency: 520, ramps: [{ target: 880, at: 0.06 }] },
    ],
    fx: CHIPTUNE_FX,
  },
  lock: {
    duration: 0.08,
    gain: 0.14,
    envelope: ENV_CLICK,
    layers: [
      { type: "square", frequency: 180, ramps: [{ target: 90, at: 0.08 }] },
    ],
    fx: CHIPTUNE_FX,
  },
  hardDrop: {
    duration: 0.12,
    gain: 0.18,
    envelope: ENV_PLUCK,
    layers: [
      {
        type: "square",
        frequency: 300,
        ramps: [{ target: 40, at: 0.12, curve: "exponential" }],
      },
      { type: "triangle", frequency: 60, gainMul: 0.5 },
    ],
    fx: CHIPTUNE_FX,
  },
  lineClear1: {
    duration: 0.15,
    gain: 0.12,
    envelope: ENV_PLUCK,
    layers: [{ type: "square", frequency: 880 }],
    fx: CHIPTUNE_FX,
  },
  lineClear2: {
    duration: 0.2,
    gain: 0.13,
    envelope: ENV_PLUCK,
    layers: [
      { type: "square", frequency: 880 },
      { type: "square", frequency: 1175, gainMul: 0.7 },
    ],
    fx: CHIPTUNE_FX,
  },
  lineClear3: {
    duration: 0.25,
    gain: 0.13,
    envelope: ENV_PLUCK,
    layers: [
      { type: "square", frequency: 880 },
      { type: "square", frequency: 1175, gainMul: 0.7 },
      { type: "square", frequency: 1760, gainMul: 0.5 },
    ],
    fx: CHIPTUNE_FX,
  },
  lineClear4: {
    duration: 0.45,
    gain: 0.15,
    envelope: ENV_PLUCK,
    layers: [
      { type: "square", frequency: 880 },
      { type: "square", frequency: 1318, gainMul: 0.7 },
      { type: "square", frequency: 1760, gainMul: 0.6 },
      { type: "triangle", frequency: 2637, gainMul: 0.4 },
    ],
    fx: CHIPTUNE_FX,
  },
  tSpin: {
    duration: 0.25,
    gain: 0.14,
    envelope: ENV_PLUCK,
    layers: [
      {
        type: "square",
        frequency: 660,
        ramps: [
          { target: 990, at: 0.08 },
          { target: 770, at: 0.16 },
          { target: 1175, at: 0.25 },
        ],
      },
    ],
    fx: CHIPTUNE_FX,
  },
  hold: {
    duration: 0.08,
    gain: 0.1,
    envelope: ENV_CLICK,
    layers: [
      { type: "square", frequency: 700, ramps: [{ target: 440, at: 0.08 }] },
    ],
    fx: CHIPTUNE_FX,
  },
  levelUp: {
    duration: 0.45,
    gain: 0.14,
    envelope: ENV_PLUCK,
    layers: [
      { type: "square", frequency: 523 },
      { type: "square", frequency: 659, gainMul: 0.8 },
      { type: "square", frequency: 784, gainMul: 0.7 },
      { type: "square", frequency: 1047, gainMul: 0.6 },
    ],
    fx: CHIPTUNE_FX,
  },
  gameOver: {
    duration: 0.8,
    gain: 0.14,
    envelope: ENV_PLUCK,
    layers: [
      {
        type: "square",
        frequency: 440,
        ramps: [{ target: 55, at: 0.8, curve: "exponential" }],
      },
    ],
    fx: CHIPTUNE_FX,
  },
};

// ---------------------------------------------------------------------------
// Synthwave — filtered sawtooth with delay
// ---------------------------------------------------------------------------

const SYNTHWAVE_FX: FxConfig = {
  kind: "delay",
  delayTime: 0.19,
  feedback: 0.35,
  mix: 0.22,
};

function swFilter(freq: number, env?: FilterConfig["envelope"]): FilterConfig {
  return { type: "lowpass", frequency: freq, q: 4, envelope: env };
}

export const SYNTHWAVE_SFX_PROFILE: SfxProfile = {
  move: {
    duration: 0.06,
    gain: 0.09,
    envelope: ENV_CLICK,
    layers: [
      { type: "sawtooth", frequency: 280 },
      { type: "sawtooth", frequency: 280, detune: 8, gainMul: 0.6 },
    ],
    filter: swFilter(1400, [{ target: 400, at: 0.06 }]),
    fx: SYNTHWAVE_FX,
  },
  rotate: {
    duration: 0.08,
    gain: 0.1,
    envelope: ENV_CLICK,
    layers: [
      {
        type: "sawtooth",
        frequency: 360,
        ramps: [{ target: 540, at: 0.08 }],
      },
      {
        type: "sawtooth",
        frequency: 360,
        detune: -10,
        ramps: [{ target: 540, at: 0.08 }],
        gainMul: 0.6,
      },
    ],
    filter: swFilter(2000, [{ target: 600, at: 0.08 }]),
    fx: SYNTHWAVE_FX,
  },
  lock: {
    duration: 0.14,
    gain: 0.16,
    envelope: ENV_PLUCK,
    layers: [
      { type: "sawtooth", frequency: 130 },
      { type: "sine", frequency: 65, gainMul: 0.6 },
    ],
    filter: swFilter(900, [{ target: 200, at: 0.14 }]),
    fx: SYNTHWAVE_FX,
  },
  hardDrop: {
    duration: 0.18,
    gain: 0.22,
    envelope: ENV_PLUCK,
    layers: [
      {
        type: "sawtooth",
        frequency: 180,
        ramps: [{ target: 45, at: 0.18, curve: "exponential" }],
      },
      { type: "sawtooth", frequency: 180, detune: 12, gainMul: 0.6 },
      { type: "sine", frequency: 60, gainMul: 0.5 },
    ],
    filter: swFilter(1800, [{ target: 300, at: 0.18 }]),
    fx: SYNTHWAVE_FX,
  },
  lineClear1: {
    duration: 0.28,
    gain: 0.13,
    envelope: ENV_TONE,
    layers: [
      { type: "sawtooth", frequency: 523 },
      { type: "sawtooth", frequency: 523, detune: 7, gainMul: 0.7 },
    ],
    filter: swFilter(2400, [{ target: 800, at: 0.28 }]),
    fx: SYNTHWAVE_FX,
  },
  lineClear2: {
    duration: 0.32,
    gain: 0.13,
    envelope: ENV_TONE,
    layers: [
      { type: "sawtooth", frequency: 523 },
      { type: "sawtooth", frequency: 659, detune: 5, gainMul: 0.8 },
    ],
    filter: swFilter(2600, [{ target: 800, at: 0.32 }]),
    fx: SYNTHWAVE_FX,
  },
  lineClear3: {
    duration: 0.4,
    gain: 0.14,
    envelope: ENV_TONE,
    layers: [
      { type: "sawtooth", frequency: 523 },
      { type: "sawtooth", frequency: 659, gainMul: 0.8 },
      { type: "sawtooth", frequency: 784, detune: 6, gainMul: 0.7 },
    ],
    filter: swFilter(3000, [{ target: 900, at: 0.4 }]),
    fx: SYNTHWAVE_FX,
  },
  lineClear4: {
    duration: 0.6,
    gain: 0.16,
    envelope: ENV_PAD,
    layers: [
      { type: "sawtooth", frequency: 523 },
      { type: "sawtooth", frequency: 659, gainMul: 0.8 },
      { type: "sawtooth", frequency: 784, detune: 6, gainMul: 0.7 },
      { type: "sawtooth", frequency: 1047, detune: -4, gainMul: 0.6 },
    ],
    filter: swFilter(4000, [{ target: 1000, at: 0.6 }]),
    fx: SYNTHWAVE_FX,
  },
  tSpin: {
    duration: 0.35,
    gain: 0.15,
    envelope: ENV_TONE,
    layers: [
      {
        type: "sawtooth",
        frequency: 440,
        ramps: [
          { target: 660, at: 0.12 },
          { target: 550, at: 0.22 },
          { target: 880, at: 0.35 },
        ],
      },
      {
        type: "sawtooth",
        frequency: 220,
        detune: 8,
        gainMul: 0.5,
      },
    ],
    filter: swFilter(2400, [{ target: 600, at: 0.35 }]),
    fx: SYNTHWAVE_FX,
  },
  hold: {
    duration: 0.12,
    gain: 0.1,
    envelope: ENV_PLUCK,
    layers: [
      {
        type: "sawtooth",
        frequency: 660,
        ramps: [{ target: 330, at: 0.12 }],
      },
      {
        type: "sawtooth",
        frequency: 660,
        detune: 10,
        ramps: [{ target: 330, at: 0.12 }],
        gainMul: 0.6,
      },
    ],
    filter: swFilter(2200, [{ target: 500, at: 0.12 }]),
    fx: SYNTHWAVE_FX,
  },
  levelUp: {
    duration: 0.6,
    gain: 0.14,
    envelope: ENV_TONE,
    layers: [
      { type: "sawtooth", frequency: 523 },
      { type: "sawtooth", frequency: 659, detune: 6, gainMul: 0.8 },
      { type: "sawtooth", frequency: 784, detune: -4, gainMul: 0.7 },
      { type: "sawtooth", frequency: 1047, gainMul: 0.6 },
    ],
    filter: swFilter(3500, [{ target: 1200, at: 0.6 }]),
    fx: SYNTHWAVE_FX,
  },
  gameOver: {
    duration: 1.0,
    gain: 0.14,
    envelope: ENV_PAD,
    layers: [
      {
        type: "sawtooth",
        frequency: 330,
        ramps: [{ target: 60, at: 1.0, curve: "exponential" }],
      },
      {
        type: "sawtooth",
        frequency: 165,
        detune: 8,
        ramps: [{ target: 40, at: 1.0, curve: "exponential" }],
        gainMul: 0.6,
      },
    ],
    filter: swFilter(1800, [{ target: 200, at: 1.0 }]),
    fx: SYNTHWAVE_FX,
  },
};

// ---------------------------------------------------------------------------
// Ambient — soft bells / triangles with long delay tail
// ---------------------------------------------------------------------------

const AMBIENT_FX: FxConfig = {
  kind: "delay",
  delayTime: 0.32,
  feedback: 0.5,
  mix: 0.35,
};

export const AMBIENT_SFX_PROFILE: SfxProfile = {
  move: {
    duration: 0.08,
    gain: 0.08,
    envelope: ENV_PLUCK,
    layers: [
      { type: "triangle", frequency: 660 },
      { type: "sine", frequency: 1320, gainMul: 0.35 },
    ],
    fx: AMBIENT_FX,
  },
  rotate: {
    duration: 0.12,
    gain: 0.09,
    envelope: ENV_PLUCK,
    layers: [
      { type: "triangle", frequency: 784 },
      { type: "sine", frequency: 1568, gainMul: 0.35 },
    ],
    fx: AMBIENT_FX,
  },
  lock: {
    duration: 0.18,
    gain: 0.12,
    envelope: ENV_PLUCK,
    layers: [
      { type: "triangle", frequency: 220 },
      { type: "sine", frequency: 440, gainMul: 0.5 },
    ],
    fx: AMBIENT_FX,
  },
  hardDrop: {
    duration: 0.25,
    gain: 0.16,
    envelope: ENV_PLUCK,
    layers: [
      { type: "triangle", frequency: 110 },
      { type: "sine", frequency: 220, gainMul: 0.6 },
      { type: "sine", frequency: 55, gainMul: 0.5 },
    ],
    fx: AMBIENT_FX,
  },
  lineClear1: {
    duration: 0.4,
    gain: 0.11,
    envelope: ENV_PAD,
    layers: [
      { type: "triangle", frequency: 523 },
      { type: "sine", frequency: 1047, gainMul: 0.4 },
    ],
    fx: AMBIENT_FX,
  },
  lineClear2: {
    duration: 0.5,
    gain: 0.11,
    envelope: ENV_PAD,
    layers: [
      { type: "triangle", frequency: 523 },
      { type: "triangle", frequency: 659, gainMul: 0.8 },
      { type: "sine", frequency: 1319, gainMul: 0.4 },
    ],
    fx: AMBIENT_FX,
  },
  lineClear3: {
    duration: 0.6,
    gain: 0.12,
    envelope: ENV_PAD,
    layers: [
      { type: "triangle", frequency: 523 },
      { type: "triangle", frequency: 659, gainMul: 0.8 },
      { type: "triangle", frequency: 784, gainMul: 0.7 },
      { type: "sine", frequency: 1568, gainMul: 0.4 },
    ],
    fx: AMBIENT_FX,
  },
  lineClear4: {
    duration: 0.9,
    gain: 0.13,
    envelope: ENV_PAD,
    layers: [
      { type: "triangle", frequency: 523 },
      { type: "triangle", frequency: 659, gainMul: 0.8 },
      { type: "triangle", frequency: 784, gainMul: 0.7 },
      { type: "triangle", frequency: 1047, gainMul: 0.6 },
      { type: "sine", frequency: 2093, gainMul: 0.35 },
    ],
    fx: AMBIENT_FX,
  },
  tSpin: {
    duration: 0.5,
    gain: 0.13,
    envelope: ENV_PAD,
    layers: [
      {
        type: "triangle",
        frequency: 440,
        ramps: [
          { target: 660, at: 0.18 },
          { target: 550, at: 0.32 },
          { target: 880, at: 0.5 },
        ],
      },
      { type: "sine", frequency: 880, gainMul: 0.3 },
    ],
    fx: AMBIENT_FX,
  },
  hold: {
    duration: 0.18,
    gain: 0.09,
    envelope: ENV_PLUCK,
    layers: [
      {
        type: "triangle",
        frequency: 660,
        ramps: [{ target: 440, at: 0.18 }],
      },
      { type: "sine", frequency: 1320, gainMul: 0.3 },
    ],
    fx: AMBIENT_FX,
  },
  levelUp: {
    duration: 0.9,
    gain: 0.13,
    envelope: ENV_PAD,
    layers: [
      { type: "triangle", frequency: 523 },
      { type: "triangle", frequency: 659, gainMul: 0.8 },
      { type: "triangle", frequency: 784, gainMul: 0.7 },
      { type: "triangle", frequency: 1047, gainMul: 0.6 },
      { type: "sine", frequency: 2093, gainMul: 0.35 },
    ],
    fx: AMBIENT_FX,
  },
  gameOver: {
    duration: 1.4,
    gain: 0.13,
    envelope: ENV_PAD,
    layers: [
      {
        type: "triangle",
        frequency: 220,
        ramps: [{ target: 55, at: 1.4, curve: "exponential" }],
      },
      {
        type: "sine",
        frequency: 110,
        ramps: [{ target: 30, at: 1.4, curve: "exponential" }],
        gainMul: 0.6,
      },
    ],
    fx: AMBIENT_FX,
  },
};

// ---------------------------------------------------------------------------
// Minimal techno — dry, crisp, clicky, no FX
// ---------------------------------------------------------------------------

export const MINIMAL_TECHNO_SFX_PROFILE: SfxProfile = {
  move: {
    duration: 0.03,
    gain: 0.1,
    envelope: ENV_CLICK,
    layers: [
      { type: "triangle", frequency: 1200 },
      { type: "square", frequency: 2400, gainMul: 0.3 },
    ],
    filter: { type: "highpass", frequency: 800 },
  },
  rotate: {
    duration: 0.04,
    gain: 0.11,
    envelope: ENV_CLICK,
    layers: [
      { type: "triangle", frequency: 1500, ramps: [{ target: 2000, at: 0.04 }] },
    ],
    filter: { type: "highpass", frequency: 1000 },
  },
  lock: {
    duration: 0.07,
    gain: 0.18,
    envelope: ENV_CLICK,
    layers: [
      {
        type: "sine",
        frequency: 120,
        ramps: [{ target: 45, at: 0.07, curve: "exponential" }],
      },
      { type: "square", frequency: 80, gainMul: 0.3 },
    ],
  },
  hardDrop: {
    duration: 0.1,
    gain: 0.25,
    envelope: ENV_CLICK,
    layers: [
      {
        type: "sine",
        frequency: 180,
        ramps: [{ target: 35, at: 0.1, curve: "exponential" }],
      },
      { type: "sawtooth", frequency: 55, gainMul: 0.4 },
    ],
  },
  lineClear1: {
    duration: 0.1,
    gain: 0.14,
    envelope: ENV_CLICK,
    layers: [{ type: "sine", frequency: 800 }],
    filter: { type: "bandpass", frequency: 1200, q: 5 },
  },
  lineClear2: {
    duration: 0.14,
    gain: 0.15,
    envelope: ENV_CLICK,
    layers: [
      { type: "sine", frequency: 800 },
      { type: "sine", frequency: 1200, gainMul: 0.7 },
    ],
    filter: { type: "bandpass", frequency: 1400, q: 4 },
  },
  lineClear3: {
    duration: 0.18,
    gain: 0.15,
    envelope: ENV_CLICK,
    layers: [
      { type: "sine", frequency: 800 },
      { type: "sine", frequency: 1200, gainMul: 0.7 },
      { type: "sine", frequency: 1800, gainMul: 0.5 },
    ],
    filter: { type: "bandpass", frequency: 1600, q: 4 },
  },
  lineClear4: {
    duration: 0.35,
    gain: 0.18,
    envelope: ENV_PLUCK,
    layers: [
      { type: "sine", frequency: 800 },
      { type: "sine", frequency: 1200, gainMul: 0.7 },
      { type: "sine", frequency: 1800, gainMul: 0.6 },
      { type: "triangle", frequency: 2400, gainMul: 0.4 },
    ],
    filter: { type: "bandpass", frequency: 2000, q: 3 },
  },
  tSpin: {
    duration: 0.22,
    gain: 0.15,
    envelope: ENV_PLUCK,
    layers: [
      {
        type: "sine",
        frequency: 600,
        ramps: [
          { target: 900, at: 0.08 },
          { target: 750, at: 0.15 },
          { target: 1100, at: 0.22 },
        ],
      },
    ],
    filter: { type: "bandpass", frequency: 1500, q: 6 },
  },
  hold: {
    duration: 0.06,
    gain: 0.1,
    envelope: ENV_CLICK,
    layers: [
      { type: "triangle", frequency: 900, ramps: [{ target: 600, at: 0.06 }] },
    ],
    filter: { type: "highpass", frequency: 500 },
  },
  levelUp: {
    duration: 0.4,
    gain: 0.15,
    envelope: ENV_PLUCK,
    layers: [
      { type: "sine", frequency: 523 },
      { type: "sine", frequency: 659, gainMul: 0.8 },
      { type: "sine", frequency: 784, gainMul: 0.7 },
      { type: "sine", frequency: 1047, gainMul: 0.6 },
    ],
    filter: { type: "highpass", frequency: 300 },
  },
  gameOver: {
    duration: 0.9,
    gain: 0.14,
    envelope: ENV_PLUCK,
    layers: [
      {
        type: "sine",
        frequency: 300,
        ramps: [{ target: 40, at: 0.9, curve: "exponential" }],
      },
      {
        type: "sawtooth",
        frequency: 150,
        gainMul: 0.4,
        ramps: [{ target: 30, at: 0.9, curve: "exponential" }],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Registry + lookup
// ---------------------------------------------------------------------------

export const SFX_PROFILES: Record<string, SfxProfile> = {
  ambient: AMBIENT_SFX_PROFILE,
  synthwave: SYNTHWAVE_SFX_PROFILE,
  "minimal-techno": MINIMAL_TECHNO_SFX_PROFILE,
  chiptune: CHIPTUNE_SFX_PROFILE,
};

export function getSfxProfile(genreId: string | null | undefined): SfxProfile {
  if (!genreId) return DEFAULT_SFX_PROFILE;
  return SFX_PROFILES[genreId] ?? DEFAULT_SFX_PROFILE;
}
