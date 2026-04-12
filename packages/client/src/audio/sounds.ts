/**
 * SoundManager — programmatic game sound effects using Web Audio API.
 *
 * All sounds are generated with oscillators (no audio files).
 * AudioContext is created lazily on first play to comply with browser
 * autoplay policy. Each public method is safe to call even when muted
 * or when Web Audio API is unavailable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SoundManager
// ---------------------------------------------------------------------------

export class SoundManager {
  private ctx: AudioContext | null = null;
  private _muted = false;

  /** Whether sound playback is muted. */
  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
  }

  /** Play a sound event. No-op if muted or Web Audio API is unavailable. */
  play(event: SoundEvent): void {
    if (this._muted) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    switch (event) {
      case "move":
        this.playMove(ctx);
        break;
      case "rotate":
        this.playRotate(ctx);
        break;
      case "lock":
        this.playLock(ctx);
        break;
      case "hardDrop":
        this.playHardDrop(ctx);
        break;
      case "lineClear1":
        this.playLineClear(ctx, 1);
        break;
      case "lineClear2":
        this.playLineClear(ctx, 2);
        break;
      case "lineClear3":
        this.playLineClear(ctx, 3);
        break;
      case "lineClear4":
        this.playLineClear(ctx, 4);
        break;
      case "tSpin":
        this.playTSpin(ctx);
        break;
      case "hold":
        this.playHold(ctx);
        break;
      case "levelUp":
        this.playLevelUp(ctx);
        break;
      case "gameOver":
        this.playGameOver(ctx);
        break;
      default: {
        const _exhaustive: never = event;
        void _exhaustive;
      }
    }
  }

  /** Dispose of the AudioContext. Call when the game is torn down. */
  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  // -------------------------------------------------------------------------
  // Internal: context management
  // -------------------------------------------------------------------------

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      // Resume if suspended (e.g. tab was backgrounded)
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

  // -------------------------------------------------------------------------
  // Internal: oscillator helpers
  // -------------------------------------------------------------------------

  /** Create an oscillator → gain → destination chain. */
  private osc(
    ctx: AudioContext,
    type: OscillatorType,
    frequency: number,
    gain: number,
    duration: number,
    startTime?: number,
  ): OscillatorNode {
    const t = startTime ?? ctx.currentTime;

    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, t);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain, t);
    // Fade out to avoid click
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(t);
    oscillator.stop(t + duration);

    return oscillator;
  }

  // -------------------------------------------------------------------------
  // Internal: individual sounds
  // -------------------------------------------------------------------------

  /** Short, soft click for piece movement. */
  private playMove(ctx: AudioContext): void {
    this.osc(ctx, "square", 300, 0.08, 0.05);
  }

  /** Quick ascending blip for rotation. */
  private playRotate(ctx: AudioContext): void {
    const t = ctx.currentTime;
    const oscillator = this.osc(ctx, "square", 400, 0.1, 0.08);
    oscillator.frequency.linearRampToValueAtTime(600, t + 0.08);
  }

  /** Dull thud for piece locking (no line clear). */
  private playLock(ctx: AudioContext): void {
    this.osc(ctx, "triangle", 150, 0.15, 0.12);
  }

  /** Impact slam for hard drop. */
  private playHardDrop(ctx: AudioContext): void {
    const t = ctx.currentTime;
    const oscillator = this.osc(ctx, "sawtooth", 200, 0.2, 0.15);
    oscillator.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    // Add a noise-like hit
    this.osc(ctx, "square", 80, 0.12, 0.08);
  }

  /** Ascending chime for line clears — pitch rises with line count. */
  private playLineClear(ctx: AudioContext, lines: number): void {
    const baseFreq = 400 + lines * 100;
    const t = ctx.currentTime;

    // Play a quick arpeggio
    for (let i = 0; i < lines; i++) {
      const freq = baseFreq + i * 80;
      this.osc(ctx, "sine", freq, 0.12, 0.15, t + i * 0.06);
    }

    // Tetris (4 lines) gets an extra shimmer
    if (lines === 4) {
      this.osc(ctx, "sine", 1200, 0.08, 0.3, t + 0.24);
    }
  }

  /** Distinctive warbling tone for T-spin. */
  private playTSpin(ctx: AudioContext): void {
    const t = ctx.currentTime;
    const oscillator = this.osc(ctx, "sine", 500, 0.15, 0.3);
    oscillator.frequency.linearRampToValueAtTime(800, t + 0.1);
    oscillator.frequency.linearRampToValueAtTime(600, t + 0.2);
    oscillator.frequency.linearRampToValueAtTime(900, t + 0.3);
  }

  /** Swap/whoosh sound for hold. */
  private playHold(ctx: AudioContext): void {
    const t = ctx.currentTime;
    const oscillator = this.osc(ctx, "sine", 600, 0.1, 0.1);
    oscillator.frequency.linearRampToValueAtTime(400, t + 0.1);
  }

  /** Triumphant ascending jingle for level up. */
  private playLevelUp(ctx: AudioContext): void {
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    for (let i = 0; i < notes.length; i++) {
      this.osc(ctx, "sine", notes[i]!, 0.1, 0.2, t + i * 0.1);
    }
  }

  /** Descending tone for game over. */
  private playGameOver(ctx: AudioContext): void {
    const t = ctx.currentTime;
    const notes = [400, 350, 300, 250, 200];
    for (let i = 0; i < notes.length; i++) {
      this.osc(ctx, "sawtooth", notes[i]!, 0.12, 0.3, t + i * 0.15);
    }
  }
}
