/** Small label helpers shared by the Play + Results components. */

import type { Verdict } from '@/types';
import type { BadgeTone } from '@/components/ui/Badge';

/** `0.1` → `0.1s`, `1` → `1s`, `2.5` → `2.5s`. */
export function clipLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  return `${seconds.toFixed(2).replace(/\.?0+$/, '')}s`;
}

/** `6420` → `6,420`. */
export function points(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US');
}

/** `65000` → `1:05`, `9000` → `0:09`. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  correct: 'Correct',
  partial: 'Artist only',
  wrong: 'Wrong',
  skipped: 'Skipped',
  timeout: 'Timed out',
};

export const VERDICT_TONE: Record<Verdict, BadgeTone> = {
  correct: 'success',
  partial: 'warn',
  wrong: 'danger',
  skipped: 'neutral',
  timeout: 'danger',
};
