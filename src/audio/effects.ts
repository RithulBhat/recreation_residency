/**
 * Modifier effect chain (lofi / bitcrush) and the reversed-buffer cache.
 * Everything here is a pure function of (AudioContext, Modifiers) so it is testable with a fake context.
 */
import type { Modifiers } from '@/types';

export const DEFAULT_MODIFIERS: Readonly<Modifiers> = Object.freeze({
  speed: 1,
  reverse: false,
  lofi: false,
  bitcrush: false,
  pitch: 0,
});

export interface EffectChain {
  /** connect the source here */
  input: AudioNode;
  /** connect this to the clip gain — identical to `input` when nothing is enabled */
  output: AudioNode;
}

/** Telephone / old-radio band-limit. Makeup gain compensates for the energy the filters remove. */
export const LOFI = { highpassHz: 180, lowpassHz: 1100, lowpassQ: 1, makeupGain: 1.35 } as const;
/** ~5-bit amplitude staircase, then a lowpass to tame aliasing, then a trim (the staircase adds RMS). */
export const BITCRUSH = { bits: 5, lowpassHz: 4000, gain: 0.6, curveSize: 4096 } as const;

/**
 * WaveShaper curve that quantises amplitude to 2^bits levels. Sample i maps input
 * x = -1..1 to the nearest step — a classic bit-depth reduction.
 */
export function staircaseCurve(bits: number = BITCRUSH.bits, size: number = BITCRUSH.curveSize): Float32Array<ArrayBuffer> {
  const steps = Math.pow(2, Math.max(1, bits)) / 2; // levels per polarity
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

let sharedBitcrushCurve: Float32Array<ArrayBuffer> | null = null;

/**
 * Build `input → [lofi] → [bitcrush] → output`. Disabled stages are not created at all
 * (true bypass); with nothing enabled input === output (a unity gain node).
 */
export function createEffectChain(ctx: AudioContext, modifiers: Modifiers): EffectChain {
  const input = ctx.createGain();
  let tail: AudioNode = input;

  if (modifiers.lofi) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = LOFI.highpassHz;
    hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = LOFI.lowpassHz;
    lp.Q.value = LOFI.lowpassQ;
    const makeup = ctx.createGain();
    makeup.gain.value = LOFI.makeupGain;
    tail.connect(hp);
    hp.connect(lp);
    lp.connect(makeup);
    tail = makeup;
  }

  if (modifiers.bitcrush) {
    const shaper = ctx.createWaveShaper();
    sharedBitcrushCurve ??= staircaseCurve();
    shaper.curve = sharedBitcrushCurve; // WaveShaperNode copies the array, sharing is safe
    shaper.oversample = 'none'; // keep the crunchy aliasing; the lowpass below tames the worst of it
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = BITCRUSH.lowpassHz;
    lp.Q.value = 0.9;
    const trim = ctx.createGain();
    trim.gain.value = BITCRUSH.gain;
    tail.connect(shaper);
    shaper.connect(lp);
    lp.connect(trim);
    tail = trim;
  }

  return { input, output: tail };
}

const reversedBuffers = new WeakMap<AudioBuffer, AudioBuffer>();

/**
 * A sample-reversed copy of `buffer`, cached per buffer (WeakMap, so it is collected with the
 * original when the LRU evicts it). Uses getChannelData on both sides — works on every engine.
 */
export function reverseBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const hit = reversedBuffers.get(buffer);
  if (hit) return hit;
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    const n = src.length;
    for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
  }
  reversedBuffers.set(buffer, out);
  return out;
}
