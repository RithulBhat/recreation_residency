/**
 * Helpers that turn an AnalyserNode into render-ready arrays, plus an idle animation for when
 * nothing is playing. Scratch buffers are cached per analyser so a 60 fps loop allocates nothing.
 */

interface Scratch {
  freq?: Uint8Array<ArrayBuffer>;
  time?: Uint8Array<ArrayBuffer>;
}
const scratch = new WeakMap<AnalyserNode, Scratch>();

function scratchFor(analyser: AnalyserNode): Scratch {
  let s = scratch.get(analyser);
  if (!s) {
    s = {};
    scratch.set(analyser, s);
  }
  return s;
}

const edgeCache = new Map<string, Uint16Array>();

/**
 * `barCount + 1` bin indices, log-spaced from bin 1 (skipping DC) to `binCount`, strictly increasing
 * so no two bars read the same bin (the lowest bars end up one bin wide, the highest many bins wide).
 */
export function bandEdges(binCount: number, barCount: number): Uint16Array {
  const key = `${binCount}:${barCount}`;
  const hit = edgeCache.get(key);
  if (hit) return hit;
  const edges = new Uint16Array(barCount + 1);
  const minBin = 1;
  const maxBin = Math.max(minBin + 1, binCount);
  const ratio = maxBin / minBin;
  edges[0] = minBin;
  for (let i = 1; i <= barCount; i++) {
    const ideal = Math.round(minBin * Math.pow(ratio, i / barCount));
    edges[i] = Math.min(maxBin, Math.max(edges[i - 1] + 1, ideal));
  }
  edgeCache.set(key, edges);
  return edges;
}

export interface ReadBarsOptions {
  /** 0..1 extra gain applied progressively to the high bars (music has far less energy up there). */
  tilt?: number;
  /** Reuse an output array of length `barCount`. */
  out?: Float32Array;
}

/** Peak byte magnitude of each log-spaced band, normalized to 0..1. */
export function readBars(analyser: AnalyserNode, barCount: number, opts: ReadBarsOptions = {}): Float32Array {
  const count = Math.max(1, Math.floor(barCount));
  const out = opts.out && opts.out.length === count ? opts.out : new Float32Array(count);
  const bins = analyser.frequencyBinCount;
  const s = scratchFor(analyser);
  if (!s.freq || s.freq.length !== bins) s.freq = new Uint8Array(bins);
  analyser.getByteFrequencyData(s.freq);
  const data = s.freq;
  const edges = bandEdges(bins, count);
  const tilt = opts.tilt ?? 0;
  for (let i = 0; i < count; i++) {
    const lo = Math.min(edges[i], bins - 1);
    const hi = Math.max(lo + 1, Math.min(edges[i + 1], bins));
    let peak = 0;
    for (let b = lo; b < hi; b++) if (data[b] > peak) peak = data[b];
    const boost = 1 + tilt * (count > 1 ? i / (count - 1) : 0);
    out[i] = Math.min(1, (peak / 255) * boost);
  }
  return out;
}

/** `points` evenly spaced samples of the time-domain waveform, -1..1. */
export function readWave(analyser: AnalyserNode, points: number, out?: Float32Array): Float32Array {
  const n = Math.max(2, Math.floor(points));
  const result = out && out.length === n ? out : new Float32Array(n);
  const size = analyser.fftSize;
  const s = scratchFor(analyser);
  if (!s.time || s.time.length !== size) s.time = new Uint8Array(size);
  analyser.getByteTimeDomainData(s.time);
  const data = s.time;
  for (let i = 0; i < n; i++) {
    const idx = Math.min(size - 1, Math.round((i * (size - 1)) / (n - 1)));
    result[i] = (data[idx] - 128) / 128;
  }
  return result;
}

/**
 * Gentle "breathing" bars for the idle state. Deterministic in `t` (seconds), centre-weighted,
 * values in 0..1 — feed it `performance.now() / 1000`.
 */
export function idleBars(t: number, count: number, out?: Float32Array): Float32Array {
  const n = Math.max(1, Math.floor(count));
  const bars = out && out.length === n ? out : new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = n > 1 ? i / (n - 1) : 0.5;
    const centre = 1 - Math.abs(x * 2 - 1);
    const wave = 0.5 + 0.5 * Math.sin(t * 1.8 + i * 0.55) * Math.sin(t * 0.7 - i * 0.21);
    const ripple = 0.5 + 0.5 * Math.sin(t * 3.1 - i * 0.9);
    const v = 0.06 + 0.18 * wave * (0.4 + 0.6 * centre) + 0.08 * ripple * centre;
    bars[i] = Math.min(1, Math.max(0, v));
  }
  return bars;
}
