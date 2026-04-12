/**
 * MusicEngine — layered procedural music over Web Audio API.
 *
 * Architecture: one master gain per layer + one global master; a
 * 16-step sequencer advances on a setInterval tick using a
 * schedule-ahead window so each note is scheduled with sample-accurate
 * timing via `ctx.currentTime`.
 *
 * Layers are driven by the current Genre. Each layer's target gain is
 * set from atmosphere intensity (via music-layers.ts::isLayerActive).
 * Layer activation crossfades over CROSSFADE_MS. Tempo is recomputed
 * each tick from the latest game level. Scale is shifted per-step by
 * the current danger value. Atmosphere events (lineClear, tetris,
 * levelUp) schedule one-shot accents.
 */

import {
  DEFAULT_GENRE_ID,
  getGenre,
  type Genre,
  type Instrument,
  type Layer,
} from "../atmosphere/genres.js";
import type { AtmosphereEvent, AtmosphereState } from "../atmosphere/types.js";
import {
  CROSSFADE_MS,
  STEPS_PER_BAR,
  activeLayers,
  computeTempo,
  fillPattern,
  isLayerActive,
  midiToHz,
  noteFromDegree,
  shiftScale,
  stepDurationMs,
  stepToDegree,
} from "./music-layers.js";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;
const MUTE_RAMP_S = 0.03;

export interface MusicEngineReadout {
  tempo: number;
  activeLayers: string[];
  scaleRoot: number;
  muted: boolean;
  volume: number;
  stepCount: number;
  genreId: string;
  running: boolean;
}

interface LayerNodes {
  layer: Layer;
  gain: GainNode;
  targetGain: number;
}

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers = new Map<string, LayerNodes>();

  private genre: Genre;
  private _volume = 0.8;
  private _muted = false;

  private running = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private currentStep = 0;
  private nextNoteTime = 0;
  private stepCount = 0;

  // Sync inputs (written every frame by use-music).
  private level = 1;
  private intensity = 0;
  private danger = 0;
  private momentum = 0;

  // Level-up flourish: remaining steps to use a lifted root.
  private flourishStepsLeft = 0;

  constructor(genreId?: string | null) {
    this.genre = getGenre(genreId ?? DEFAULT_GENRE_ID);
  }

  // ---------- public API ----------

  get muted(): boolean {
    return this._muted;
  }

  get volume(): number {
    return this._volume;
  }

  get genreId(): string {
    return this.genre.id;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    this.applyMasterGain();
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    this.applyMasterGain();
  }

  setGenre(genreId: string): void {
    if (genreId === this.genre.id) return;
    this.genre = getGenre(genreId);
    // Rebuild layer gain nodes lazily on next schedule.
    this.teardownLayers();
  }

  /** Feed the latest atmosphere state + game level. Called every frame. */
  sync(level: number, atmosphere: AtmosphereState): void {
    this.level = level;
    this.intensity = atmosphere.intensity;
    this.danger = atmosphere.danger;
    this.momentum = atmosphere.momentum;

    for (const ev of atmosphere.events) {
      this.onEvent(ev);
    }
    this.updateLayerTargets();
  }

  /** Begin scheduling. Idempotent. */
  start(): void {
    if (this.running) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.running = true;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.intervalId = setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }

  /** Stop scheduling. In-flight notes continue to their natural release. */
  stop(): void {
    this.running = false;
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.teardownLayers();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }

  getReadout(): MusicEngineReadout {
    return {
      tempo: computeTempo(this.genre.baseTempo, this.level),
      activeLayers: activeLayers(this.genre, this.intensity).map((l) => l.name),
      scaleRoot: this.currentRoot(),
      muted: this._muted,
      volume: this._volume,
      stepCount: this.stepCount,
      genreId: this.genre.id,
      running: this.running,
    };
  }

  // ---------- internals ----------

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    if (typeof AudioContext === "undefined") return null;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : this._volume;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.master) return;
    const target = this._muted ? 0 : this._volume;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(target, t + MUTE_RAMP_S);
  }

  private ensureLayerNodes(): void {
    if (!this.ctx || !this.master) return;
    for (const layer of this.genre.layers) {
      if (this.layers.has(layer.name)) continue;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      this.layers.set(layer.name, { layer, gain, targetGain: 0 });
    }
  }

  private teardownLayers(): void {
    for (const nodes of this.layers.values()) {
      try {
        nodes.gain.disconnect();
      } catch {
        // mock gain nodes may lack disconnect; safe to ignore.
      }
    }
    this.layers.clear();
  }

  private updateLayerTargets(): void {
    if (!this.ctx) return;
    this.ensureLayerNodes();
    const t = this.ctx.currentTime;
    for (const nodes of this.layers.values()) {
      const active = isLayerActive(nodes.layer, this.intensity);
      const target = active ? nodes.layer.instrument.gain : 0;
      if (Math.abs(target - nodes.targetGain) < 1e-6) continue;
      nodes.targetGain = target;
      nodes.gain.gain.cancelScheduledValues(t);
      nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, t);
      nodes.gain.gain.linearRampToValueAtTime(target, t + CROSSFADE_MS / 1000);
    }
  }

  private currentRoot(): number {
    return this.genre.rootNote + (this.flourishStepsLeft > 0 ? 7 : 0);
  }

  private onEvent(ev: AtmosphereEvent): void {
    if (ev.type === "levelUp") {
      this.flourishStepsLeft = STEPS_PER_BAR;
    } else if (ev.type === "lineClear" || ev.type === "tetris") {
      this.pendingAccentMagnitude = Math.max(
        this.pendingAccentMagnitude,
        ev.magnitude,
      );
    }
  }

  private pendingAccentMagnitude = 0;

  private scheduler(): void {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    const tempo = computeTempo(this.genre.baseTempo, this.level);
    const stepSec = stepDurationMs(tempo) / 1000;

    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.scheduleStep(this.nextNoteTime);
      this.nextNoteTime += stepSec;
      this.currentStep = (this.currentStep + 1) % STEPS_PER_BAR;
      this.stepCount++;
      if (this.flourishStepsLeft > 0) this.flourishStepsLeft--;
    }
  }

  private scheduleStep(when: number): void {
    if (!this.ctx) return;
    const scale = shiftScale(this.genre.scaleDegrees, this.danger);
    const root = this.currentRoot();
    const useFills = this.momentum > 0.5;

    for (const nodes of this.layers.values()) {
      if (nodes.targetGain <= 0) continue;
      const pattern = useFills
        ? fillPattern(nodes.layer.pattern.steps)
        : nodes.layer.pattern.steps;
      const velocity = pattern[this.currentStep] ?? 0;
      if (velocity <= 0) continue;

      // Note choice: first layer plays root drone; later layers use
      // step-derived degrees for melodic variety.
      const degreeIdx =
        nodes.layer === this.genre.layers[0]
          ? 0
          : stepToDegree(this.currentStep, velocity);
      const midi = noteFromDegree(root, scale, degreeIdx);
      this.playNote(nodes, midi, velocity, when);
    }

    // Harmonic accent from line-clear events.
    if (this.pendingAccentMagnitude > 0 && this.currentStep % 4 === 0) {
      this.playAccent(scale, root, this.pendingAccentMagnitude, when);
      this.pendingAccentMagnitude = 0;
    }
  }

  private playNote(
    nodes: LayerNodes,
    midi: number,
    velocity: number,
    when: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { instrument } = nodes.layer;
    const osc = ctx.createOscillator();
    osc.type = instrument.timbre;
    osc.frequency.value = midiToHz(midi);

    const noteGain = ctx.createGain();
    noteGain.gain.value = 0;
    osc.connect(noteGain);
    noteGain.connect(nodes.gain);

    applyEnvelope(noteGain.gain, instrument, velocity, when);

    const { attack, decay, release } = instrument.envelope;
    const endTime = when + attack + decay + Math.max(0.05, release);
    osc.start(when);
    osc.stop(endTime + 0.05);
  }

  private playAccent(
    scale: readonly number[],
    root: number,
    magnitude: number,
    when: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    // Root + 3rd + 5th triad for a harmonic stab.
    const degrees = [0, 2, 4];
    const gain = Math.min(0.25, 0.1 + magnitude * 0.05);
    const accentGain = ctx.createGain();
    accentGain.gain.value = 0;
    accentGain.connect(this.master);
    accentGain.gain.setValueAtTime(0, when);
    accentGain.gain.linearRampToValueAtTime(gain, when + 0.01);
    accentGain.gain.linearRampToValueAtTime(0, when + 0.6);
    for (const d of degrees) {
      const midi = noteFromDegree(root, scale, d);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = midiToHz(midi);
      osc.connect(accentGain);
      osc.start(when);
      osc.stop(when + 0.65);
    }
  }
}

function applyEnvelope(
  gainParam: AudioParam,
  instrument: Instrument,
  velocity: number,
  when: number,
): void {
  const { attack, decay, sustain, release } = instrument.envelope;
  const peak = velocity;
  const sustainLevel = peak * sustain;
  gainParam.setValueAtTime(0, when);
  gainParam.linearRampToValueAtTime(peak, when + Math.max(0.001, attack));
  gainParam.linearRampToValueAtTime(
    sustainLevel,
    when + attack + Math.max(0.001, decay),
  );
  gainParam.linearRampToValueAtTime(
    0,
    when + attack + decay + Math.max(0.01, release),
  );
}
