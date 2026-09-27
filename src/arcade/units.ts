/**
 * Value formatting for both new games.
 *
 * Two renderings per value, and the distinction matters to the games:
 *   `formatValue`  exact, grouped  — "$1,299", "340,003,797 people". The reveal lands here.
 *   `formatCompact` short          — "$1.3K", "340M". Cards, chips and tight mobile rows.
 *
 * Higher or Lower counts a value up on reveal, so `formatValue` must be stable in width as the
 * number climbs (no switching between "1.2M" and "1,234,567" mid-animation) — the count-up
 * animates the number and formats every frame with the same function.
 *
 * Framework-free and pure: no Intl locale surprises across the four themes or in jsdom tests.
 */

import type { UnitId } from './types';

interface UnitSpec {
  /** Rendered before the number. */
  prefix: string;
  /** Rendered after the number, with a leading space unless it is a symbol. */
  suffix: string;
  /** Decimal places for the exact rendering. Money and counts are whole here. */
  decimals: number;
  /** Compact rendering uses K/M/B/T steps. Years never do. */
  compactable: boolean;
}

const UNITS: Record<UnitId, UnitSpec> = {
  usd: { prefix: '$', suffix: '', decimals: 0, compactable: true },
  gbp: { prefix: '£', suffix: '', decimals: 0, compactable: true },
  eur: { prefix: '€', suffix: '', decimals: 0, compactable: true },
  people: { prefix: '', suffix: ' people', decimals: 0, compactable: true },
  sqkm: { prefix: '', suffix: ' km²', decimals: 0, compactable: true },
  year: { prefix: '', suffix: '', decimals: 0, compactable: false },
  pounds: { prefix: '', suffix: ' lb', decimals: 0, compactable: false },
  inches: { prefix: '', suffix: '"', decimals: 0, compactable: false },
  rank: { prefix: '', suffix: '', decimals: 0, compactable: true },
  count: { prefix: '', suffix: '', decimals: 0, compactable: true },
};

export function unitSpec(unit: UnitId): UnitSpec {
  return UNITS[unit];
}

/** Thousands separators, no locale dependency. `1234567 → "1,234,567"`. */
export function group(n: number): string {
  const neg = n < 0;
  const [whole, frac] = Math.abs(n).toFixed(countDecimals(n)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

function countDecimals(n: number): number {
  if (Number.isInteger(n)) return 0;
  const s = String(Math.abs(n));
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : Math.min(2, s.length - dot - 1);
}

/**
 * Exact, human rendering. This is what a reveal settles on and what a correct answer is
 * compared against in the results breakdown.
 */
export function formatValue(value: number, unit: UnitId): string {
  if (!Number.isFinite(value)) return '—';
  const spec = UNITS[unit];
  const rounded = spec.decimals === 0 ? Math.round(value) : value;
  return `${spec.prefix}${group(rounded)}${spec.suffix}`;
}

const STEPS: readonly { at: number; sfx: string }[] = [
  { at: 1e12, sfx: 'T' },
  { at: 1e9, sfx: 'B' },
  { at: 1e6, sfx: 'M' },
  { at: 1e3, sfx: 'K' },
];

/** Short rendering for cards and chips. Years and small units fall back to exact. */
export function formatCompact(value: number, unit: UnitId): string {
  if (!Number.isFinite(value)) return '—';
  const spec = UNITS[unit];
  if (!spec.compactable) return formatValue(value, unit);
  const abs = Math.abs(value);
  for (const step of STEPS) {
    if (abs >= step.at) {
      const scaled = value / step.at;
      // one decimal below 100 so 1.3K stays informative; none above, where it is noise
      const text = Math.abs(scaled) < 100 ? trimZero(scaled.toFixed(1)) : String(Math.round(scaled));
      return `${spec.prefix}${text}${step.sfx}${spec.suffix}`;
    }
  }
  return formatValue(value, unit);
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/**
 * Signed percentage error of a guess against the truth, as a ratio (0.05 = 5% out).
 * `Infinity` when the answer is zero and the guess is not — no scale to be wrong against.
 */
export function relativeError(guess: number, answer: number): number {
  if (!Number.isFinite(guess) || !Number.isFinite(answer)) return Infinity;
  if (answer === 0) return guess === 0 ? 0 : Infinity;
  return Math.abs(guess - answer) / Math.abs(answer);
}
