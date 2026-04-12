/**
 * Pure helpers for the adaptive music engine.
 *
 * No Web Audio API, no React — just math so the logic is trivially
 * testable in vitest without any AudioContext mock.
 */

import type { Genre, Layer } from "../atmosphere/genres.js";

export const STEPS_PER_BAR = 16;
export const CROSSFADE_MS = 400;

/**
 * Activation threshold for a layer, expressed in intensity [0..1].
 *
 * Genre data stores `activationThreshold` as a level (0..10+). We divide
 * by 10 so the existing genre configs map cleanly onto the intensity
 * scale — a layer flagged at level 3 activates once intensity ≥ 0.3.
 */
export function layerIntensityThreshold(layer: Layer): number {
  return Math.max(0, Math.min(1, layer.activationThreshold / 10));
}

/** Whether a layer should be audible at the given intensity. */
export function isLayerActive(layer: Layer, intensity: number): boolean {
  return intensity >= layerIntensityThreshold(layer);
}

/** Which of a genre's layers are active at this intensity (preserves order). */
export function activeLayers(genre: Genre, intensity: number): Layer[] {
  return genre.layers.filter((l) => isLayerActive(l, intensity));
}

/**
 * Tempo in BPM derived from game level.
 *
 * baseTempo at level 1, climbing ~4% per level, capped at 2× baseTempo so
 * fast levels don't overshoot into unlistenable territory.
 */
export function computeTempo(baseTempo: number, level: number): number {
  const lv = Math.max(1, level);
  const scaled = baseTempo * (1 + (lv - 1) * 0.04);
  return Math.min(baseTempo * 2, scaled);
}

/** Milliseconds per 16th-note step at a given tempo. */
export function stepDurationMs(bpm: number): number {
  const beatMs = 60_000 / bpm;
  return beatMs / 4;
}

/**
 * Adjust scale degrees based on current danger.
 *
 * When danger > 0.6 we flatten the 3rd (brightens → darkens). When
 * danger > 0.85 we also flatten the 5th, producing a diminished flavor.
 *
 * Scales without an identifiable 3rd (pentatonic, chromatic) pass
 * through unchanged — there is no "minor pentatonic by index" that
 * works uniformly.
 */
export function shiftScale(
  scaleDegrees: readonly number[],
  danger: number,
): number[] {
  if (scaleDegrees.length < 5) return [...scaleDegrees];
  const out = [...scaleDegrees];
  if (danger > 0.6 && out[2] != null) {
    out[2] = out[2] - 1;
  }
  if (danger > 0.85 && out[4] != null) {
    out[4] = out[4] - 1;
  }
  return out;
}

/**
 * Map a scale-degree index (can be negative or > length) to an absolute
 * MIDI note, wrapping octaves.
 */
export function noteFromDegree(
  rootNote: number,
  scaleDegrees: readonly number[],
  degreeIndex: number,
): number {
  const n = scaleDegrees.length;
  if (n === 0) return rootNote;
  const octave = Math.floor(degreeIndex / n);
  let mod = degreeIndex % n;
  if (mod < 0) mod += n;
  return rootNote + (scaleDegrees[mod] ?? 0) + octave * 12;
}

/** Standard MIDI → Hz. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Build a "fill" variant of a pattern that adds off-beat hits when
 * momentum is high. We add low-velocity hits on every empty step.
 */
export function fillPattern(steps: readonly number[]): number[] {
  return steps.map((v) => (v > 0 ? v : 0.4));
}

/**
 * Return the note degree for a given step, used by melodic/arp layers.
 * Pattern velocity picks which scale degree to play — a simple motif
 * derived entirely from the 16-step pattern.
 */
export function stepToDegree(step: number, velocity: number): number {
  if (velocity <= 0) return 0;
  // Motif: even steps climb, odd steps alternate — enough variety to
  // sound "composed" without needing a separate melody table per genre.
  const climb = (step % 8) >> 1; // 0,0,1,1,2,2,3,3
  const accent = step % 4 === 0 ? 0 : 2;
  return climb + accent;
}
