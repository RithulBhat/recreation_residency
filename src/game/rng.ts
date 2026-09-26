/**
 * Seeded PRNG utilities: `xmur3` (string → 32-bit hash stream) feeding `mulberry32`.
 * `createRng(seed)` is deterministic for a given seed; without a seed it draws from
 * `crypto.getRandomValues` (falling back to Math.random) so unseeded games are unpredictable.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (both inclusive). */
  int(min: number, max: number): number;
  /** Random element. Throws on an empty array. */
  pick<T>(arr: readonly T[]): T;
  /** New shuffled copy (Fisher–Yates); the input is not mutated. */
  shuffle<T>(arr: readonly T[]): T[];
  /** 12-char base36 id. Deterministic when seeded. */
  id(): string;
  /** The seed this rng was created with (undefined when unseeded). */
  readonly seed: string | undefined;
}

/** xmur3 string hash. Returns a function producing successive 32-bit unsigned hashes. */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: tiny fast 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cryptoRandom(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

/** Deterministic float in [0, 1) derived from a string key (one-shot, no state). */
export function hashToUnit(key: string): number {
  return mulberry32(xmur3(key)())();
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function createRng(seed?: string): Rng {
  const seeded = seed !== undefined && seed !== '';
  const next = seeded ? mulberry32(xmur3(seed)()) : cryptoRandom;

  const rng: Rng = {
    seed: seeded ? seed : undefined,
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick(arr) {
      if (arr.length === 0) throw new RangeError('rng.pick: empty array');
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    id() {
      let s = '';
      for (let i = 0; i < 12; i++) s += ID_ALPHABET[Math.floor(next() * ID_ALPHABET.length)];
      return s;
    },
  };
  return rng;
}
