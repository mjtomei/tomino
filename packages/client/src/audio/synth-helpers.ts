/**
 * Synth helpers — small building blocks for profile-driven SFX.
 *
 * These helpers construct one-shot Web Audio node graphs. Every function
 * is defensive against partial mock contexts (used in unit tests) and
 * against missing optional node factories.
 */

export interface EnvelopeShape {
  attack: number;
  decay: number;
  sustain: number; // 0..1
  release: number;
  peak: number; // peak gain
}

export interface FreqRamp {
  /** Target frequency in Hz. */
  target: number;
  /** Seconds from start at which the ramp should complete. */
  at: number;
  /** Ramp curve — linear is safe for frequency; exponential cannot cross zero. */
  curve?: "linear" | "exponential";
}

export interface OscLayer {
  type: OscillatorType;
  frequency: number;
  /** Detune in cents applied at start. */
  detune?: number;
  /** Optional pitch glides. */
  ramps?: FreqRamp[];
  /** Relative gain multiplier vs the patch's master gain. */
  gainMul?: number;
}

export interface FilterConfig {
  type: BiquadFilterType;
  /** Starting cutoff frequency. */
  frequency: number;
  q?: number;
  /** Optional cutoff envelope — expressed as frequency ramps over the event duration. */
  envelope?: FreqRamp[];
}

export type FxKind = "delay" | "bitcrusher" | "none";

export interface FxConfig {
  kind: FxKind;
  /** delay time in seconds (for delay). */
  delayTime?: number;
  /** feedback 0..1 (for delay). */
  feedback?: number;
  /** dry/wet mix 0..1. */
  mix?: number;
  /** bitcrusher bit depth 1..16. */
  bits?: number;
}

/**
 * Build the effects tail once per SfxPatch play and return an input node to
 * feed source gain into, plus the output node to connect to destination.
 */
export interface FxChain {
  input: AudioNode;
  output: AudioNode;
}

function createBitcrusherCurve(bits: number): Float32Array<ArrayBuffer> {
  const steps = Math.pow(2, Math.max(1, Math.min(16, Math.floor(bits))));
  const n = 1024;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1; // -1..1
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

export function buildFxChain(ctx: AudioContext, fx: FxConfig | undefined): FxChain {
  if (!fx || fx.kind === "none") {
    const pass = ctx.createGain();
    pass.gain.value = 1;
    return { input: pass, output: pass };
  }

  if (fx.kind === "delay" && typeof ctx.createDelay === "function") {
    const input = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const mix = fx.mix ?? 0.3;
    dry.gain.value = 1 - mix;
    wet.gain.value = mix;

    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = fx.delayTime ?? 0.18;

    const fb = ctx.createGain();
    fb.gain.value = Math.min(0.85, Math.max(0, fx.feedback ?? 0.35));

    const out = ctx.createGain();
    input.connect(dry);
    input.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    dry.connect(out);
    wet.connect(out);
    return { input, output: out };
  }

  if (fx.kind === "bitcrusher" && typeof ctx.createWaveShaper === "function") {
    const input = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    shaper.curve = createBitcrusherCurve(fx.bits ?? 6);
    shaper.oversample = "none";
    const out = ctx.createGain();
    input.connect(shaper);
    shaper.connect(out);
    return { input, output: out };
  }

  // Fallback: pass-through (mock contexts without these factories).
  const pass = ctx.createGain();
  return { input: pass, output: pass };
}

/** Build a filter node with an optional cutoff envelope. */
export function buildFilter(
  ctx: AudioContext,
  cfg: FilterConfig | undefined,
  startTime: number,
  duration: number,
): BiquadFilterNode | null {
  if (!cfg || typeof ctx.createBiquadFilter !== "function") return null;
  const f = ctx.createBiquadFilter();
  f.type = cfg.type;
  f.frequency.setValueAtTime(cfg.frequency, startTime);
  if (cfg.q !== undefined) f.Q.setValueAtTime(cfg.q, startTime);
  if (cfg.envelope) {
    for (const ramp of cfg.envelope) {
      const t = startTime + Math.min(ramp.at, duration);
      // Biquad frequency cannot cross 0; clamp target.
      const target = Math.max(20, ramp.target);
      if (ramp.curve === "exponential") {
        f.frequency.exponentialRampToValueAtTime(target, t);
      } else {
        f.frequency.linearRampToValueAtTime(target, t);
      }
    }
  }
  return f;
}

/** Build a gain envelope node (ADSR). */
export function buildEnvelopeGain(
  ctx: AudioContext,
  env: EnvelopeShape,
  startTime: number,
  duration: number,
  master: number,
): GainNode {
  const g = ctx.createGain();
  const peak = Math.max(0.0001, env.peak * master);
  const sustain = Math.max(0.0001, peak * env.sustain);
  const atkEnd = startTime + env.attack;
  const decEnd = atkEnd + env.decay;
  const relStart = Math.max(decEnd, startTime + duration - env.release);
  const end = startTime + duration + env.release;

  g.gain.setValueAtTime(0.0001, startTime);
  g.gain.exponentialRampToValueAtTime(peak, Math.max(atkEnd, startTime + 0.001));
  g.gain.exponentialRampToValueAtTime(sustain, Math.max(decEnd, atkEnd + 0.001));
  g.gain.setValueAtTime(sustain, relStart);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  return g;
}

/** Build and start a single oscillator layer, returning its osc node. */
export function buildOscLayer(
  ctx: AudioContext,
  layer: OscLayer,
  startTime: number,
  duration: number,
  totalRelease: number,
): { osc: OscillatorNode; gain: GainNode } {
  const osc = ctx.createOscillator();
  osc.type = layer.type;
  osc.frequency.setValueAtTime(layer.frequency, startTime);
  if (layer.detune !== undefined && osc.detune) {
    osc.detune.setValueAtTime(layer.detune, startTime);
  }
  if (layer.ramps) {
    for (const ramp of layer.ramps) {
      const t = startTime + ramp.at;
      const target = Math.max(1, ramp.target);
      if (ramp.curve === "exponential") {
        osc.frequency.exponentialRampToValueAtTime(target, t);
      } else {
        osc.frequency.linearRampToValueAtTime(target, t);
      }
    }
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(layer.gainMul ?? 1, startTime);
  osc.connect(gain);

  osc.start(startTime);
  osc.stop(startTime + duration + totalRelease + 0.05);
  return { osc, gain };
}
