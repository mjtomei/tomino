/**
 * SoundManager — programmatic game sound effects using Web Audio API.
 *
 * SFX are rendered from profile data (see sfx-profiles.ts). Each genre
 * defines a full set of patches per SoundEvent; the manager is given a
 * genre id and looks up the matching profile on every play. When no
 * genre is set, the default profile reproduces the original generic
 * oscillator sounds.
 *
 * AudioContext is created lazily on first play to comply with browser
 * autoplay policy. Every public method is safe to call even when muted
 * or when Web Audio API is unavailable.
 */

import {
  DEFAULT_SFX_PROFILE,
  getSfxProfile,
  type SfxPatch,
  type SfxProfile,
} from "./sfx-profiles.js";
import {
  buildEnvelopeGain,
  buildFilter,
  buildFxChain,
  buildOscLayer,
} from "./synth-helpers.js";

/** All sound events the manager can play. */
export type SoundEvent =
  | "move"
  | "rotate"
  | "lock"
  | "hardDrop"
  | "lineClear1"
  | "lineClear2"
  | "lineClear3"
  | "lineClear4"
  | "tSpin"
  | "hold"
  | "levelUp"
  | "gameOver";

export class SoundManager {
  private ctx: AudioContext | null = null;
  private _muted = false;
  private _volume = 1;
  private _genreId: string | null;

  constructor(genreId?: string | null) {
    this._genreId = genreId ?? null;
  }

  /** Whether sound playback is muted. */
  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
  }

  /** Master SFX volume, 0..1. Applied as a multiplier on each rendered patch. */
  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    if (!Number.isFinite(value)) return;
    this._volume = Math.max(0, Math.min(1, value));
  }

  /** Current genre id, or null if default profile is in use. */
  get genreId(): string | null {
    return this._genreId;
  }

  /** Change the active genre. Takes effect on the next `play()`. */
  setGenreId(id: string | null | undefined): void {
    this._genreId = id ?? null;
  }

  /** Play a sound event. No-op if muted or Web Audio API is unavailable. */
  play(event: SoundEvent): void {
    if (this._muted || this._volume <= 0) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const profile: SfxProfile = this._genreId
      ? getSfxProfile(this._genreId)
      : DEFAULT_SFX_PROFILE;
    const patch = profile[event];
    if (!patch) return;

    this.renderPatch(ctx, patch);
  }

  /** Dispose of the AudioContext. Call when the game is torn down. */
  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        void this.ctx.resume();
      }
      return this.ctx;
    }

    if (typeof AudioContext === "undefined") return null;

    try {
      this.ctx = new AudioContext();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Build the node graph for a single patch and start it.
   *
   * Graph shape:
   *   osc₁ ┐
   *   osc₂ ┼→ [mixGain] → [filter?] → [envGain] → [fx?] → destination
   *   oscₙ ┘
   */
  private renderPatch(ctx: AudioContext, patch: SfxPatch): void {
    const t = ctx.currentTime;
    const { duration, envelope } = patch;

    // Mix bus for oscillator layers
    const mix = ctx.createGain();
    mix.gain.value = 1;

    for (const layer of patch.layers) {
      const { gain } = buildOscLayer(ctx, layer, t, duration, envelope.release);
      gain.connect(mix);
    }

    // Filter (optional)
    const filter = buildFilter(ctx, patch.filter, t, duration);

    // Envelope gain — master gain scaled by user volume
    const envGain = buildEnvelopeGain(ctx, envelope, t, duration, patch.gain * this._volume);

    // Effects chain (always present — pass-through if none)
    const fx = buildFxChain(ctx, patch.fx);

    if (filter) {
      mix.connect(filter);
      filter.connect(envGain);
    } else {
      mix.connect(envGain);
    }
    envGain.connect(fx.input);
    fx.output.connect(ctx.destination);
  }
}
