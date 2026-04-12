export type ScaleMode =
  | "major"
  | "minor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "pentatonic"
  | "chromatic";

export type Timbre = OscillatorType;

export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface Instrument {
  name: string;
  timbre: Timbre;
  envelope: Envelope;
  gain: number;
}

export interface RhythmPattern {
  /** 16-step pattern; non-zero = hit velocity (0..1). */
  steps: number[];
}

export interface Layer {
  name: string;
  instrument: Instrument;
  pattern: RhythmPattern;
  /** Activates once player level >= threshold. */
  activationThreshold: number;
}

export interface Genre {
  id: string;
  name: string;
  scale: ScaleMode;
  /** Semitone offsets from root defining the scale degrees. */
  scaleDegrees: number[];
  rootNote: number; // MIDI number
  baseTempo: number; // BPM
  layers: Layer[];
}

const SCALE_DEGREES: Record<ScaleMode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export function getScaleDegrees(mode: ScaleMode): number[] {
  return SCALE_DEGREES[mode];
}

export const GENRES: Record<string, Genre> = {
  ambient: {
    id: "ambient",
    name: "Ambient",
    scale: "lydian",
    scaleDegrees: SCALE_DEGREES.lydian,
    rootNote: 60,
    baseTempo: 70,
    layers: [
      {
        name: "pad",
        instrument: {
          name: "pad",
          timbre: "sine",
          envelope: { attack: 1.2, decay: 0.5, sustain: 0.7, release: 2.0 },
          gain: 0.15,
        },
        pattern: { steps: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
        activationThreshold: 0,
      },
      {
        name: "bells",
        instrument: {
          name: "bells",
          timbre: "triangle",
          envelope: { attack: 0.01, decay: 1.0, sustain: 0.0, release: 1.5 },
          gain: 0.1,
        },
        pattern: { steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
        activationThreshold: 3,
      },
    ],
  },
  synthwave: {
    id: "synthwave",
    name: "Synthwave",
    scale: "minor",
    scaleDegrees: SCALE_DEGREES.minor,
    rootNote: 57,
    baseTempo: 110,
    layers: [
      {
        name: "bass",
        instrument: {
          name: "bass",
          timbre: "sawtooth",
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.1 },
          gain: 0.2,
        },
        pattern: { steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] },
        activationThreshold: 0,
      },
      {
        name: "lead",
        instrument: {
          name: "lead",
          timbre: "square",
          envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.2 },
          gain: 0.12,
        },
        pattern: { steps: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0] },
        activationThreshold: 2,
      },
    ],
  },
  "minimal-techno": {
    id: "minimal-techno",
    name: "Minimal Techno",
    scale: "phrygian",
    scaleDegrees: SCALE_DEGREES.phrygian,
    rootNote: 48,
    baseTempo: 128,
    layers: [
      {
        name: "kick",
        instrument: {
          name: "kick",
          timbre: "sine",
          envelope: { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.05 },
          gain: 0.3,
        },
        pattern: { steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] },
        activationThreshold: 0,
      },
      {
        name: "stab",
        instrument: {
          name: "stab",
          timbre: "sawtooth",
          envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.1 },
          gain: 0.1,
        },
        pattern: { steps: [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
        activationThreshold: 4,
      },
    ],
  },
  chiptune: {
    id: "chiptune",
    name: "Chiptune",
    scale: "pentatonic",
    scaleDegrees: SCALE_DEGREES.pentatonic,
    rootNote: 60,
    baseTempo: 140,
    layers: [
      {
        name: "pulse",
        instrument: {
          name: "pulse",
          timbre: "square",
          envelope: { attack: 0.005, decay: 0.05, sustain: 0.6, release: 0.05 },
          gain: 0.15,
        },
        pattern: { steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
        activationThreshold: 0,
      },
      {
        name: "arp",
        instrument: {
          name: "arp",
          timbre: "triangle",
          envelope: { attack: 0.001, decay: 0.05, sustain: 0.3, release: 0.05 },
          gain: 0.1,
        },
        pattern: { steps: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1] },
        activationThreshold: 2,
      },
    ],
  },
};

export const DEFAULT_GENRE_ID = "ambient";

export function getGenre(id: string): Genre {
  return GENRES[id] ?? (GENRES[DEFAULT_GENRE_ID] as Genre);
}

export function validateGenre(genre: Genre): string[] {
  const errors: string[] = [];
  if (!genre.id) errors.push("missing id");
  if (!genre.name) errors.push("missing name");
  if (genre.scaleDegrees.length === 0) errors.push("empty scale");
  if (genre.baseTempo <= 0) errors.push("invalid tempo");
  if (genre.layers.length === 0) errors.push("no layers");
  for (const layer of genre.layers) {
    if (layer.pattern.steps.length !== 16)
      errors.push(`layer ${layer.name}: pattern must be 16 steps`);
    if (layer.instrument.gain < 0 || layer.instrument.gain > 1)
      errors.push(`layer ${layer.name}: gain out of range`);
    const env = layer.instrument.envelope;
    if (env.attack < 0 || env.decay < 0 || env.release < 0)
      errors.push(`layer ${layer.name}: negative envelope`);
  }
  return errors;
}
