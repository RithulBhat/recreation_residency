/**
 * Highlight Scout's BROADCAST SCORE — an original American-sports-broadcast cue set, synthesized
 * from the same primitives as `./sfx.ts` on the same shared AudioContext. No assets, no network, no
 * library: stacked saw/square "brass" through a lowpass, a timpani-ish low hit, filtered-noise
 * transients, a touch of stereo spread, and a short feedback delay standing in for a hall.
 *
 * THE MUSIC IS OURS. It is written to the GENRE — brass stabs over a low hit, a rising fifth, a
 * confident major cadence (everything here is in D) — and deliberately not to any existing
 * broadcast theme. The pitch material, the voicings and the rhythm are original; nothing is
 * sampled, transcribed or modelled on a recording.
 *
 * Shape of the module:
 *   `createBroadcastRig(ctx)`  builds the per-context mix bus (spread branches, tail, bed sub-bus).
 *   `scheduleCue(rig, cue, t)` schedules one cue and returns the time it ends.
 *   `createBroadcast(...)`     the stateful façade (`Broadcast`), mirroring `createSfx`.
 * The first two take any context, which is how the cues get rendered offline to WAV for review; the
 * façade is what the game uses and it will not schedule a thing until a user gesture has put the
 * context into 'running' (see `runningContext`).
 */

import type { Broadcast, BroadcastCue } from '@/types';
import { getAudioEngine } from './engine';
import { FLOOR, filterNode, noise, releaseOnEnd, tone, type FilterOpts } from './sfx';

/** Master trim under the squared volume, so a cue never sits louder than the game's own sfx. */
const TRIM = 0.85;
const DEFAULT_VOLUME = 0.8;

/** Stereo spread of the wide branches (StereoPannerNode units, −1..1). */
const SPREAD = 0.4;
/** Feedback delay standing in for a hall: short, damped, and well under the dry signal. */
const TAIL_SEND = 0.3;
const TAIL_TIME = 0.135;
const TAIL_FEEDBACK = 0.32;
const TAIL_DAMP_HZ = 2600;

/** Bed levels: the pad sits this far under the bus, and ducks to this fraction of itself. */
export const BED_LEVEL = 0.13;
const DUCK_LEVEL = 0.22;
const BED_FADE_IN = 1.2;
const BED_FADE_OUT = 0.5;
/** One loop of the bed, in seconds. Every pitch in it completes a whole number of cycles per loop. */
const BED_LOOP = 4.8;
/** Beats per bed loop — a slow, even pulse rather than a groove. */
const BED_BEATS = 8;
const BED_CUTOFF = 700;

/** How long each cue occupies, tail excluded. Used for the duck window and by the offline render. */
export const CUE_SECONDS: Record<BroadcastCue, number> = {
  kickoff: 1.95,
  bigCall: 0.9,
  turnover: 0.72,
  halftime: 0.55,
};

// D major, because the cadence lands there: D2 73.42 · A2 110 · D3 146.83 · A3 220 · D4 293.66
// F#4 369.99 · A4 440 · D5 587.33 · F#5 739.99 · A5 880 · D6 1174.66
const D2 = 73.42;
const A2 = 110;
const D3 = 146.83;
const A3 = 220;
const D4 = 293.66;
const FS4 = 369.99;
const A4 = 440;
const D5 = 587.33;
const FS5 = 739.99;
const A5 = 880;
const D6 = 1174.66;

/**
 * One mix bus per context. `left` / `center` / `right` are where voices land — three permanent
 * branches rather than a panner per cue, so nothing has a lifetime to manage. Everything dry also
 * feeds the tail.
 */
export interface BroadcastRig {
  ctx: AudioContext;
  /** Master gain (volume², trimmed) → destination. */
  bus: GainNode;
  left: AudioNode;
  center: AudioNode;
  right: AudioNode;
  /** Bed sub-bus, silent at rest. */
  bed: GainNode;
}

interface BrassOpts {
  at: number;
  dur: number;
  freq: number;
  /** Peak gain per oscillator. */
  gain?: number;
  attack?: number;
  /** Lowpass at the attack → where it lands. A closing sweep bites; an opening one swells. */
  cutoff?: number;
  cutoffTo?: number;
  /** Detune between the two saws, in cents. */
  spread?: number;
  /** Add the square an octave down for body. Default true. */
  sub?: boolean;
}

interface HitOpts {
  at: number;
  dur: number;
  freq: number;
  freqTo: number;
  gain: number;
}

type CueVoice = (rig: BroadcastRig, t: number) => void;

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

interface HeldOpts {
  type: OscillatorType;
  freq: number;
  /** Glide to this pitch across `dur`. */
  freqTo?: number;
  at: number;
  dur: number;
  gain: number;
  attack?: number;
  /** Fraction of the peak the note settles back to and HOLDS at. */
  sustain?: number;
  /** Release inside `dur`. */
  release?: number;
  filter?: FilterOpts;
}

/**
 * A note that is actually HELD: attack, a gentle settle to a sustain level, a flat hold, then a
 * release. `tone`'s envelope is attack + one exponential decay, which is right for a stab but makes
 * a long chord collapse in its first 150 ms — a cadence voiced that way has no body to ring on.
 */
function heldTone(ctx: AudioContext, out: AudioNode, o: HeldOpts): void {
  const attack = o.attack ?? 0.012;
  const release = Math.min(o.release ?? 0.3, o.dur * 0.6);
  const settle = Math.min(o.dur - release, attack + 0.12);
  const sustain = o.gain * (o.sustain ?? 0.72);
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, o.at);
  if (o.freqTo !== undefined) osc.frequency.exponentialRampToValueAtTime(o.freqTo, o.at + o.dur);
  const amp = ctx.createGain();
  const g = amp.gain;
  g.setValueAtTime(0, o.at);
  g.linearRampToValueAtTime(o.gain, o.at + attack);
  g.linearRampToValueAtTime(sustain, o.at + settle);
  g.setValueAtTime(sustain, o.at + o.dur - release);
  g.exponentialRampToValueAtTime(FLOOR, o.at + o.dur);
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

/** The held counterpart of `brass` — the same two detuned saws plus sub, but they ring. */
function heldBrass(ctx: AudioContext, out: AudioNode, o: BrassOpts & { sustain?: number; release?: number }): void {
  const gain = o.gain ?? 0.1;
  const attack = o.attack ?? 0.014;
  const cutoff = o.cutoff ?? 4600;
  const cutoffTo = o.cutoffTo ?? 1700;
  const k = Math.pow(2, (o.spread ?? 7) / 1200);
  const filter: FilterOpts = { type: 'lowpass', freq: cutoff, freqTo: cutoffTo, q: 0.9 };
  for (const freq of [o.freq / k, o.freq * k]) {
    heldTone(ctx, out, {
      type: 'sawtooth',
      freq,
      at: o.at,
      dur: o.dur,
      gain,
      attack,
      sustain: o.sustain,
      release: o.release,
      filter,
    });
  }
  if (o.sub !== false) {
    heldTone(ctx, out, {
      type: 'square',
      freq: o.freq / 2,
      at: o.at,
      dur: o.dur,
      gain: gain * 0.45,
      attack,
      sustain: o.sustain,
      release: o.release,
      filter: { type: 'lowpass', freq: Math.min(cutoff, 1500), freqTo: 620, q: 0.7 },
    });
  }
}

/**
 * A brass-ish voice: two saws detuned against each other through a swept lowpass, plus an optional
 * square an octave down for weight. Synthesized brass is all in the filter sweep — a fast attack
 * with the lowpass wide then shutting reads as a stab; opening it instead reads as a swell.
 */
function brass(ctx: AudioContext, out: AudioNode, o: BrassOpts): void {
  const gain = o.gain ?? 0.1;
  const attack = o.attack ?? 0.008;
  const cutoff = o.cutoff ?? 4600;
  const cutoffTo = o.cutoffTo ?? 1700;
  const k = Math.pow(2, (o.spread ?? 7) / 1200);
  const filter: FilterOpts = { type: 'lowpass', freq: cutoff, freqTo: cutoffTo, q: 0.9 };
  for (const freq of [o.freq / k, o.freq * k]) {
    tone(ctx, out, { type: 'sawtooth', freq, at: o.at, dur: o.dur, gain, attack, filter });
  }
  if (o.sub !== false) {
    tone(ctx, out, {
      type: 'square',
      freq: o.freq / 2,
      at: o.at,
      dur: o.dur,
      gain: gain * 0.45,
      attack,
      filter: { type: 'lowpass', freq: Math.min(cutoff, 1500), freqTo: 620, q: 0.7 },
    });
  }
}

/** The low percussive hit under a stab: a pitched-down sine with an octave ghost and a soft thud. */
function lowHit(ctx: AudioContext, out: AudioNode, o: HitOpts): void {
  tone(ctx, out, { type: 'sine', freq: o.freq, freqTo: o.freqTo, at: o.at, dur: o.dur, gain: o.gain, attack: 0.004 });
  tone(ctx, out, {
    type: 'triangle',
    freq: o.freq * 2,
    freqTo: o.freqTo * 2,
    at: o.at,
    dur: o.dur * 0.45,
    gain: o.gain * 0.22,
    attack: 0.003,
  });
  noise(ctx, out, {
    at: o.at,
    dur: 0.06,
    gain: o.gain * 0.45,
    attack: 0.002,
    filter: { type: 'lowpass', freq: 420, freqTo: 140, q: 0.8 },
  });
}

/** The breath in front of a brass stab. Tiny, but it is what stops a saw sounding like a synth. */
function chiff(ctx: AudioContext, out: AudioNode, at: number, gain = 0.05): void {
  noise(ctx, out, {
    at,
    dur: 0.05,
    gain,
    attack: 0.002,
    filter: { type: 'bandpass', freq: 2200, freqTo: 800, q: 1.1 },
  });
}

const CUES: Record<BroadcastCue, CueVoice> = {
  /**
   * The opening sting. Two even root stabs over the low hit, a leap up to the fifth, then a D major
   * stack that lands on a second hit and swells (the filter OPENS on the cadence) into the tail.
   */
  kickoff: ({ ctx, left, center, right }, t) => {
    lowHit(ctx, center, { at: t, dur: 0.5, freq: D2, freqTo: 46, gain: 0.34 });
    for (const at of [t, t + 0.2]) {
      brass(ctx, center, { at, dur: 0.16, freq: D4, gain: 0.1, cutoff: 5200, cutoffTo: 1900 });
      brass(ctx, left, { at, dur: 0.16, freq: D3, gain: 0.07, cutoff: 3200, cutoffTo: 1300 });
      chiff(ctx, center, at);
    }
    // The rising fifth.
    brass(ctx, center, { at: t + 0.4, dur: 0.28, freq: A4, gain: 0.1, cutoff: 5600, cutoffTo: 2100 });
    brass(ctx, right, { at: t + 0.4, dur: 0.28, freq: A3, gain: 0.07, cutoff: 3400, cutoffTo: 1400 });
    chiff(ctx, right, t + 0.4, 0.04);
    lowHit(ctx, center, { at: t + 0.4, dur: 0.22, freq: 98, freqTo: 55, gain: 0.16 });
    // The cadence: the triad across the stereo field, opening up as it holds.
    const land = t + 0.72;
    const hold = { sustain: 0.68, release: 0.45 };
    heldBrass(ctx, left, { at: land, dur: 1.15, freq: D4, gain: 0.085, attack: 0.02, cutoff: 2600, cutoffTo: 5200, ...hold });
    heldBrass(ctx, center, { at: land, dur: 1.15, freq: FS4, gain: 0.07, attack: 0.024, cutoff: 2600, cutoffTo: 5000, ...hold });
    heldBrass(ctx, right, { at: land, dur: 1.15, freq: A4, gain: 0.085, attack: 0.02, cutoff: 2600, cutoffTo: 5200, ...hold });
    heldBrass(ctx, center, {
      at: land,
      dur: 1.05,
      freq: D5,
      gain: 0.055,
      attack: 0.03,
      cutoff: 3000,
      cutoffTo: 6000,
      sub: false,
      ...hold,
    });
    lowHit(ctx, center, { at: land, dur: 0.7, freq: D2, freqTo: 44, gain: 0.34 });
    tone(ctx, center, { type: 'sine', freq: D6, at: land + 0.04, dur: 0.85, gain: 0.035, attack: 0.09 });
    tone(ctx, right, { type: 'sine', freq: A5, at: land + 0.04, dur: 0.8, gain: 0.03, attack: 0.11 });
  },

  /** One triumphant stab: a grace note into the full triad, hit underneath, bright and done. */
  bigCall: ({ ctx, left, center, right }, t) => {
    brass(ctx, center, { at: t, dur: 0.09, freq: A3, gain: 0.075, cutoff: 4200, cutoffTo: 1600 });
    chiff(ctx, center, t);
    const hit = t + 0.1;
    const ring = { sustain: 0.6, release: 0.34 };
    heldBrass(ctx, left, { at: hit, dur: 0.78, freq: D4, gain: 0.1, attack: 0.01, cutoff: 5600, cutoffTo: 2200, ...ring });
    heldBrass(ctx, center, { at: hit, dur: 0.78, freq: FS4, gain: 0.08, attack: 0.012, cutoff: 5400, cutoffTo: 2100, ...ring });
    heldBrass(ctx, right, { at: hit, dur: 0.78, freq: A4, gain: 0.1, attack: 0.01, cutoff: 5600, cutoffTo: 2200, ...ring });
    heldBrass(ctx, center, {
      at: hit,
      dur: 0.72,
      freq: D5,
      gain: 0.06,
      attack: 0.014,
      cutoff: 6000,
      cutoffTo: 2600,
      sub: false,
      ...ring,
    });
    lowHit(ctx, center, { at: hit, dur: 0.5, freq: 78, freqTo: 48, gain: 0.3 });
    tone(ctx, right, { type: 'sine', freq: FS5, at: hit + 0.03, dur: 0.5, gain: 0.03, attack: 0.05 });
  },

  /** A lost round: the stack slides down and the filter shuts with it, landing on a dull thud. */
  turnover: ({ ctx, left, center, right }, t) => {
    const fall: FilterOpts = { type: 'lowpass', freq: 4200, freqTo: 700, q: 0.9 };
    // Held, not decaying: the glide has to stay audible all the way down or it is just a blip.
    const slide = { sustain: 0.8, release: 0.2, attack: 0.014 };
    heldTone(ctx, center, { type: 'sawtooth', freq: D4, freqTo: 98, at: t, dur: 0.5, gain: 0.13, filter: fall, ...slide });
    heldTone(ctx, left, {
      type: 'sawtooth',
      freq: D4 * 1.004,
      freqTo: 98 * 1.004,
      at: t,
      dur: 0.5,
      gain: 0.1,
      filter: fall,
      ...slide,
    });
    heldTone(ctx, center, {
      type: 'square',
      freq: D3,
      freqTo: 49,
      at: t,
      dur: 0.5,
      gain: 0.055,
      filter: { type: 'lowpass', freq: 1600, freqTo: 420, q: 0.7 },
      ...slide,
    });
    noise(ctx, right, {
      at: t,
      dur: 0.42,
      gain: 0.05,
      attack: 0.02,
      filter: { type: 'bandpass', freq: 2200, freqTo: 320, q: 1.1 },
    });
    lowHit(ctx, center, { at: t + 0.4, dur: 0.3, freq: 62, freqTo: 38, gain: 0.15 });
  },

  /** Between rounds: two muted notes a fourth apart. Neutral on purpose — it settles nothing. */
  halftime: ({ ctx, left, center, right }, t) => {
    // The first note runs INTO the second: a gap here reads as two unrelated blips, not a bumper.
    heldBrass(ctx, center, {
      at: t,
      dur: 0.21,
      freq: A4,
      gain: 0.095,
      attack: 0.012,
      cutoff: 2800,
      cutoffTo: 1500,
      sustain: 0.8,
      release: 0.07,
    });
    heldBrass(ctx, center, {
      at: t + 0.18,
      dur: 0.34,
      freq: D5,
      gain: 0.105,
      attack: 0.012,
      cutoff: 3200,
      cutoffTo: 1700,
      sustain: 0.72,
      release: 0.2,
    });
    tone(ctx, right, { type: 'sine', freq: A5, at: t + 0.18, dur: 0.3, gain: 0.03, attack: 0.02 });
    noise(ctx, left, {
      at: t,
      dur: 0.04,
      gain: 0.03,
      attack: 0.002,
      filter: { type: 'bandpass', freq: 3000, freqTo: 1200, q: 1.2 },
    });
  },
};

/**
 * A wide branch, or the dry bus itself where StereoPannerNode is missing (older Safari, and the
 * fake context the unit tests drive). The cue is then mono, never silent.
 */
function panBranch(ctx: AudioContext, dry: AudioNode, pan: number): AudioNode {
  if (pan === 0 || typeof ctx.createStereoPanner !== 'function') return dry;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(dry);
  return panner;
}

/** Damped feedback delay off the dry bus. Skipped (dry only) where DelayNode is unavailable. */
function attachTail(ctx: AudioContext, dry: AudioNode, bus: GainNode): void {
  if (typeof ctx.createDelay !== 'function') return;
  const send = ctx.createGain();
  send.gain.value = TAIL_SEND;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = TAIL_TIME;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = TAIL_DAMP_HZ;
  const feedback = ctx.createGain();
  feedback.gain.value = TAIL_FEEDBACK;
  dry.connect(send);
  send.connect(delay);
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay); // the cycle is legal: it contains a DelayNode
  damp.connect(bus);
}

/** Build the mix bus for one context. Cheap; `createBroadcast` keeps one per context. */
export function createBroadcastRig(ctx: AudioContext, volume = DEFAULT_VOLUME): BroadcastRig {
  const bus = ctx.createGain();
  bus.gain.value = clamp01(volume) ** 2 * TRIM;
  bus.connect(ctx.destination);
  const dry = ctx.createGain();
  dry.gain.value = 1;
  dry.connect(bus);
  attachTail(ctx, dry, bus);
  const bed = ctx.createGain();
  bed.gain.value = 0;
  bed.connect(bus);
  return {
    ctx,
    bus,
    bed,
    left: panBranch(ctx, dry, -SPREAD),
    center: dry,
    right: panBranch(ctx, dry, SPREAD),
  };
}

/** Schedule one cue at `at` (context time). Returns the time the cue's last voice ends. */
export function scheduleCue(rig: BroadcastRig, cue: BroadcastCue, at: number): number {
  CUES[cue](rig, at);
  return at + CUE_SECONDS[cue];
}

const bedBuffers = new WeakMap<AudioContext, AudioBuffer>();

/**
 * The bed, baked into one seamlessly looping buffer: a band-limited low drone that breathes, and a
 * slow pulse on top of it. Everything is computed here rather than played by oscillators so the
 * loop needs no LFO, no timer and no rescheduling — and so every pitch can be snapped to a whole
 * number of cycles per loop, which is what makes the loop point inaudible.
 */
export function bedBuffer(ctx: AudioContext): AudioBuffer {
  const cached = bedBuffers.get(ctx);
  if (cached) return cached;
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.round(BED_LOOP * sr));
  const buffer = ctx.createBuffer(1, n, sr);
  const data = buffer.getChannelData(0);

  /** Snap a pitch so it completes a whole number of cycles in one loop. */
  const snap = (f: number): number => Math.max(1, Math.round(f * BED_LOOP)) / BED_LOOP;
  // A saw summed harmonic by harmonic: band-limited by construction, so no aliasing at any rate.
  const voices: Array<{ freq: number; partials: number; gain: number }> = [
    { freq: snap(D2), partials: 10, gain: 0.3 },
    { freq: snap(D2 * 1.004), partials: 8, gain: 0.22 },
    { freq: snap(A2), partials: 6, gain: 0.16 },
    { freq: snap(D3), partials: 5, gain: 0.1 },
  ];
  const breathe = 1 / BED_LOOP; // one slow swell per loop

  for (let i = 0; i < n; i++) {
    const x = i / sr;
    let v = 0;
    for (const voice of voices) {
      let s = 0;
      for (let h = 1; h <= voice.partials; h++) s += Math.sin(2 * Math.PI * voice.freq * h * x) / h;
      v += s * voice.gain;
    }
    // ±18% swell, so the pad moves without ever pulling focus.
    data[i] = v * (0.82 + 0.18 * Math.sin(2 * Math.PI * breathe * x));
  }

  const beat = BED_LOOP / BED_BEATS;
  for (let b = 0; b < BED_BEATS; b++) {
    // A soft low thump that sags in pitch as it decays — a heartbeat, not a kick drum.
    const start = Math.round(b * beat * sr);
    const len = Math.round(0.26 * sr);
    for (let i = 0; i < len && start + i < n; i++) {
      const x = i / sr;
      data[start + i] += Math.sin(2 * Math.PI * (54 - 9 * x) * x) * Math.exp(-x * 15) * 0.55;
    }
    // A very quiet off-beat tick, so the pulse does not read as a metronome.
    const off = Math.round((b * beat + beat / 2) * sr);
    const tick = Math.round(0.03 * sr);
    for (let i = 0; i < tick && off + i < n; i++) {
      data[off + i] += (Math.random() * 2 - 1) * Math.exp(-(i / sr) * 190) * 0.045;
    }
  }

  // Normalize so the bed's level is set by `BED_LEVEL` alone, whatever the voicing adds up to.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) {
    const k = 0.8 / peak;
    for (let i = 0; i < n; i++) data[i] *= k;
  }
  bedBuffers.set(ctx, buffer);
  return buffer;
}

export interface BedNodes {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
}

/**
 * Start the bed looping on a rig and fade it in to `level`. Paired with `scheduleCue` so the whole
 * sounding surface of the module can be driven from an OfflineAudioContext as well as from the game.
 */
export function scheduleBed(rig: BroadcastRig, level = BED_LEVEL, fadeIn = BED_FADE_IN): BedNodes {
  const { ctx, bed } = rig;
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = BED_CUTOFF;
  filter.Q.value = 0.7;
  filter.connect(bed);
  const source = ctx.createBufferSource();
  source.buffer = bedBuffer(ctx);
  source.loop = true;
  source.connect(filter);
  source.start(t);
  const g = bed.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(FLOOR, t);
  g.linearRampToValueAtTime(level, t + Math.max(0.01, fadeIn));
  return { source, filter };
}

class BroadcastImpl implements Broadcast {
  private enabled = true;
  private bedEnabled = false;
  private volume = DEFAULT_VOLUME;
  private rig: BroadcastRig | null = null;
  private bed: BedNodes | null = null;

  constructor(private readonly getContext: () => AudioContext | null) {}

  play(cue: BroadcastCue): void {
    if (!this.enabled) return;
    const ctx = this.runningContext();
    if (!ctx) return;
    const rig = this.ensureRig(ctx);
    try {
      scheduleCue(rig, cue, ctx.currentTime + 0.005);
      // The bed exists to sit under things; a cue is one of them.
      this.duck(CUE_SECONDS[cue] + 0.25);
    } catch {
      /* a cue must never break the game */
    }
  }

  startBed(): void {
    if (!this.enabled || !this.bedEnabled || this.bed) return;
    const ctx = this.runningContext();
    if (!ctx) return;
    const rig = this.ensureRig(ctx);
    try {
      this.bed = scheduleBed(rig, this.bedLevel());
    } catch {
      this.bed = null;
    }
  }

  stopBed(): void {
    const bed = this.bed;
    const rig = this.rig;
    this.bed = null;
    if (!bed || !rig) return;
    try {
      const t = rig.ctx.currentTime;
      const g = rig.bed.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(FLOOR, g.value), t);
      g.exponentialRampToValueAtTime(FLOOR, t + BED_FADE_OUT);
      bed.source.stop(t + BED_FADE_OUT + 0.05);
      releaseOnEnd(bed.source, bed.filter);
    } catch {
      /* the context went away underneath us */
    }
  }

  isBedRunning(): boolean {
    return this.bed !== null;
  }

  duck(seconds = 0.9): void {
    const rig = this.rig;
    if (!rig || !this.bed) return;
    const g = rig.bed.gain;
    const t = rig.ctx.currentTime;
    const level = this.bedLevel();
    g.cancelScheduledValues(t);
    g.setTargetAtTime(level * DUCK_LEVEL, t, 0.04);
    g.setTargetAtTime(level, t + Math.max(0.1, seconds), 0.3);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stopBed();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setBedEnabled(on: boolean): void {
    this.bedEnabled = on;
    if (!on) this.stopBed();
  }

  isBedEnabled(): boolean {
    return this.bedEnabled;
  }

  setVolume(v: number): void {
    this.volume = clamp01(v);
    const rig = this.rig;
    if (!rig) return;
    const t = rig.ctx.currentTime;
    const g = rig.bus.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.volume ** 2 * TRIM, t, 0.01);
    if (this.bed) rig.bed.gain.setTargetAtTime(this.bedLevel(), t, 0.05);
  }

  private bedLevel(): number {
    return BED_LEVEL;
  }

  /**
   * The context, but only once a user gesture has actually unlocked it. Deliberately does NOT
   * resume: the broadcast score is atmosphere, so unlike an sfx (which always answers a tap) it has
   * no gesture of its own to spend, and a cue that cannot be heard is simply not scheduled.
   */
  private runningContext(): AudioContext | null {
    const ctx = this.getContext();
    if (!ctx) return null;
    if ((ctx.state as string) !== 'running') return null;
    if (this.rig && this.rig.ctx !== ctx) {
      this.bed = null;
      this.rig = null;
    }
    return ctx;
  }

  private ensureRig(ctx: AudioContext): BroadcastRig {
    if (this.rig && this.rig.ctx === ctx) return this.rig;
    this.rig = createBroadcastRig(ctx, this.volume);
    return this.rig;
  }
}

/** Build a Broadcast bound to a context factory (tests inject a fake context). */
export function createBroadcast(getContext: () => AudioContext | null): Broadcast {
  return new BroadcastImpl(getContext);
}

let singleton: Broadcast | null = null;

/** App-wide broadcast score, sharing the engine's AudioContext. Highlight Scout only. */
export function getBroadcast(): Broadcast {
  singleton ??= createBroadcast(() => getAudioEngine().getContext());
  return singleton;
}
