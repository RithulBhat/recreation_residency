/**
 * Fully synthesized UI / game sound effects — oscillators, filtered noise and gain envelopes on the
 * engine's shared AudioContext. No audio assets. Sounds bypass the music master/analyser so the
 * visualizer only shows the track.
 */
import type { Sfx, SfxName } from '@/types';
import { getAudioEngine } from './engine';

/** Hover sounds are dropped if another one played more recently than this. */
export const HOVER_MIN_GAP_MS = 70;
/** Exponential ramps cannot reach 0; this is "silent". */
const FLOOR = 0.0001;
const DEFAULT_VOLUME = 0.8;

interface FilterOpts {
  type: BiquadFilterType;
  freq: number;
  freqTo?: number;
  q?: number;
}
interface ToneOpts {
  type: OscillatorType;
  freq: number;
  freqTo?: number;
  at: number;
  dur: number;
  gain?: number;
  attack?: number;
  filter?: FilterOpts;
}
interface NoiseOpts {
  at: number;
  dur: number;
  gain?: number;
  attack?: number;
  filter: FilterOpts;
}
type Voice = (ctx: AudioContext, out: AudioNode, t: number) => void;

/** Linear attack to the peak, then an exponential decay that lands at silence when the voice stops. */
function envelope(param: AudioParam, at: number, dur: number, peak: number, attack: number): void {
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(peak, at + attack);
  param.exponentialRampToValueAtTime(FLOOR, at + dur);
}

function releaseOnEnd(source: AudioScheduledSourceNode, ...others: AudioNode[]): void {
  source.onended = () => {
    try {
      source.disconnect();
      for (const node of others) node.disconnect();
    } catch {
      /* already released */
    }
  };
}

function filterNode(ctx: AudioContext, f: FilterOpts, at: number, dur: number): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = f.type;
  node.frequency.setValueAtTime(f.freq, at);
  if (f.freqTo !== undefined) node.frequency.exponentialRampToValueAtTime(f.freqTo, at + dur);
  node.Q.value = f.q ?? 1;
  return node;
}

function tone(ctx: AudioContext, out: AudioNode, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, o.at);
  if (o.freqTo !== undefined) osc.frequency.exponentialRampToValueAtTime(o.freqTo, o.at + o.dur);
  const amp = ctx.createGain();
  envelope(amp.gain, o.at, o.dur, o.gain ?? 0.15, o.attack ?? 0.005);
  const extras: AudioNode[] = [amp];
  let head: AudioNode = osc;
  if (o.filter) {
    const f = filterNode(ctx, o.filter, o.at, o.dur);
    head.connect(f);
    head = f;
    extras.push(f);
  }
  head.connect(amp);
  amp.connect(out);
  osc.start(o.at);
  osc.stop(o.at + o.dur + 0.02);
  releaseOnEnd(osc, ...extras);
}

const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

/** One second of white noise per context, looped by the noise voices. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    const n = Math.max(1, Math.round(ctx.sampleRate));
    buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

function noise(ctx: AudioContext, out: AudioNode, o: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = filterNode(ctx, o.filter, o.at, o.dur);
  const amp = ctx.createGain();
  envelope(amp.gain, o.at, o.dur, o.gain ?? 0.2, o.attack ?? 0.01);
  src.connect(f);
  f.connect(amp);
  amp.connect(out);
  src.start(o.at);
  src.stop(o.at + o.dur + 0.02);
  releaseOnEnd(src, f, amp);
}

function chord(
  ctx: AudioContext,
  out: AudioNode,
  freqs: number[],
  at: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  filter?: FilterOpts,
): void {
  for (const freq of freqs) tone(ctx, out, { type, freq, at, dur, gain, attack: 0.01, filter });
}

// Note names for readability: C5 523.25, E5 659.25, G5 783.99, B5 987.77, D6 1174.66, G6 1567.98, C6 1046.5
const VOICES: Record<SfxName, Voice> = {
  click: (ctx, out, t) => tone(ctx, out, { type: 'sine', freq: 1700, freqTo: 900, at: t, dur: 0.045, gain: 0.16, attack: 0.002 }),

  hover: (ctx, out, t) => tone(ctx, out, { type: 'sine', freq: 2300, at: t, dur: 0.03, gain: 0.04, attack: 0.003 }),

  correct: (ctx, out, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const at = t + i * 0.075;
      tone(ctx, out, { type: 'triangle', freq, at, dur: 0.24, gain: 0.16 });
      tone(ctx, out, { type: 'sine', freq: freq * 2, at, dur: 0.18, gain: 0.04 }); // sparkle
    });
  },

  partial: (ctx, out, t) => {
    tone(ctx, out, { type: 'triangle', freq: 523.25, at: t, dur: 0.2, gain: 0.14 });
    tone(ctx, out, { type: 'triangle', freq: 659.25, at: t + 0.13, dur: 0.24, gain: 0.14 });
  },

  wrong: (ctx, out, t) => {
    tone(ctx, out, { type: 'sawtooth', freq: 240, freqTo: 80, at: t, dur: 0.4, gain: 0.15, attack: 0.01, filter: { type: 'lowpass', freq: 900 } });
    tone(ctx, out, { type: 'square', freq: 121, freqTo: 41, at: t, dur: 0.4, gain: 0.06, attack: 0.01, filter: { type: 'lowpass', freq: 600 } });
  },

  skip: (ctx, out, t) => {
    noise(ctx, out, { at: t, dur: 0.22, gain: 0.28, attack: 0.01, filter: { type: 'bandpass', freq: 3500, freqTo: 250, q: 1.2 } });
    tone(ctx, out, { type: 'sine', freq: 700, freqTo: 180, at: t, dur: 0.18, gain: 0.07 });
  },

  tick: (ctx, out, t) => {
    tone(ctx, out, { type: 'sine', freq: 1250, at: t, dur: 0.035, gain: 0.14, attack: 0.001 });
    noise(ctx, out, { at: t, dur: 0.02, gain: 0.08, attack: 0.001, filter: { type: 'highpass', freq: 4000 } });
  },

  buzz: (ctx, out, t) => {
    // Two squares a couple of Hz apart beat against each other — the classic game-show "EHH".
    tone(ctx, out, { type: 'square', freq: 150, at: t, dur: 0.55, gain: 0.13, filter: { type: 'lowpass', freq: 1200, q: 0.8 } });
    tone(ctx, out, { type: 'square', freq: 152.5, at: t, dur: 0.55, gain: 0.11, filter: { type: 'lowpass', freq: 1200, q: 0.8 } });
  },

  fanfare: (ctx, out, t) => {
    const riff = [392, 523.25, 659.25, 783.99];
    riff.forEach((freq, i) => {
      const at = t + i * 0.09;
      tone(ctx, out, { type: 'triangle', freq, at, dur: 0.2, gain: 0.14 });
      tone(ctx, out, { type: 'square', freq, at, dur: 0.18, gain: 0.05, filter: { type: 'lowpass', freq: 2500 } });
    });
    const hold = t + riff.length * 0.09;
    tone(ctx, out, { type: 'triangle', freq: 1046.5, at: hold, dur: 0.6, gain: 0.16 });
    tone(ctx, out, { type: 'square', freq: 1046.5, at: hold, dur: 0.55, gain: 0.05, filter: { type: 'lowpass', freq: 2500 } });
    tone(ctx, out, { type: 'sine', freq: 1567.98, at: hold, dur: 0.5, gain: 0.05, attack: 0.03 });
  },

  reveal: (ctx, out, t) => {
    [1318.5, 1760, 2093, 2637, 3136, 3520].forEach((freq, i) =>
      tone(ctx, out, { type: 'sine', freq, at: t + i * 0.05, dur: 0.55, gain: 0.045, attack: 0.04 }),
    );
    noise(ctx, out, { at: t, dur: 0.6, gain: 0.05, attack: 0.15, filter: { type: 'highpass', freq: 6000, freqTo: 9000 } });
  },

  whoosh: (ctx, out, t) => {
    // Band-passed noise whose centre sweeps up then back down.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.16);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.4);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.35, t + 0.14);
    amp.gain.exponentialRampToValueAtTime(FLOOR, t + 0.4);
    src.connect(f);
    f.connect(amp);
    amp.connect(out);
    src.start(t);
    src.stop(t + 0.42);
    releaseOnEnd(src, f, amp);
  },

  // The "go" beep at the end of a countdown; callers play 'tick' for the three counts before it.
  countdown: (ctx, out, t) => {
    tone(ctx, out, { type: 'sine', freq: 1318.5, at: t, dur: 0.35, gain: 0.18, attack: 0.004 });
    tone(ctx, out, { type: 'triangle', freq: 1318.5, at: t, dur: 0.3, gain: 0.06, attack: 0.004 });
  },

  gameover: (ctx, out, t) => {
    // Am → E → Am (low): a small minor cadence.
    const lp: FilterOpts = { type: 'lowpass', freq: 1800 };
    chord(ctx, out, [220, 261.63, 329.63], t, 0.38, 'triangle', 0.09, lp);
    chord(ctx, out, [164.81, 207.65, 246.94], t + 0.36, 0.38, 'triangle', 0.09, lp);
    chord(ctx, out, [110, 130.81, 164.81, 220], t + 0.72, 0.8, 'triangle', 0.08, lp);
  },

  streak: (ctx, out, t) => {
    [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98].forEach((freq, i) => {
      const at = t + i * 0.055;
      tone(ctx, out, { type: 'triangle', freq, at, dur: 0.17, gain: 0.12 });
      tone(ctx, out, { type: 'sine', freq: freq * 2, at, dur: 0.14, gain: 0.035 });
    });
  },
};

class SfxImpl implements Sfx {
  private enabled = true;
  private volume = DEFAULT_VOLUME;
  private bus: GainNode | null = null;
  private busCtx: AudioContext | null = null;
  private lastHoverAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly getContext: () => AudioContext | null,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  play(name: SfxName): void {
    if (!this.enabled) return;
    if (name === 'hover') {
      const t = this.clock();
      if (t - this.lastHoverAt < HOVER_MIN_GAP_MS) return;
      this.lastHoverAt = t;
    }
    const ctx = this.getContext();
    if (!ctx) return;
    // Sfx are triggered from gestures, so a resume here is allowed; the sound is scheduled regardless
    // and simply starts once the context runs.
    if ((ctx.state as string) !== 'running') ctx.resume().catch(() => undefined);
    const bus = this.ensureBus(ctx);
    try {
      VOICES[name](ctx, bus, ctx.currentTime + 0.005);
    } catch {
      /* a sound effect must never break the game */
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(v: number): void {
    this.volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    if (this.bus && this.busCtx) {
      const g = this.bus.gain;
      const t = this.busCtx.currentTime;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(this.volume * this.volume, t, 0.01);
    }
  }

  private ensureBus(ctx: AudioContext): GainNode {
    if (this.bus && this.busCtx === ctx) return this.bus;
    const bus = ctx.createGain();
    bus.gain.value = this.volume * this.volume;
    bus.connect(ctx.destination);
    this.bus = bus;
    this.busCtx = ctx;
    return bus;
  }
}

/** Build an Sfx bound to a context factory (tests inject a fake context and clock). */
export function createSfx(getContext: () => AudioContext | null, clock?: () => number): Sfx {
  return new SfxImpl(getContext, clock);
}

let singleton: Sfx | null = null;

/** App-wide sfx, sharing the engine's AudioContext. */
export function getSfx(): Sfx {
  singleton ??= createSfx(() => getAudioEngine().getContext());
  return singleton;
}
