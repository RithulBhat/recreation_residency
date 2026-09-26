/**
 * Date maths for the Daily screen. Everything works on local `YYYY-MM-DD` keys so it matches
 * `todayISO()` and the keys in `useStatsStore().daily`.
 */
import { todayISO } from '@/game/challenge';

/** Parse a `YYYY-MM-DD` key as a local-midnight Date. */
export function parseISODate(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(dateISO: string, delta: number): string {
  const date = parseISODate(dateISO);
  date.setDate(date.getDate() + delta);
  return todayISO(date);
}

/** The `n` dates ending on `today`, oldest first. */
export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

/**
 * Consecutive dailies ending today — or ending yesterday when today's isn't played yet
 * (the streak is still alive, just pending).
 */
export function dailyStreak(played: ReadonlySet<string>, today: string): number {
  let cursor = played.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (played.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

/** `HH:MM:SS`, zero-padded. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** `Friday 26 September 2026` style heading. */
export function formatLongDate(dateISO: string, locale?: string): string {
  return parseISODate(dateISO).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** `Sat, Sep 26, 2026` — fits a phone-width eyebrow. */
export function formatShortDate(dateISO: string, locale?: string): string {
  return parseISODate(dateISO).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** `M`, `T`, `W`… single-letter weekday for the calendar strip. */
export function weekdayLetter(dateISO: string, locale?: string): string {
  return parseISODate(dateISO).toLocaleDateString(locale, { weekday: 'narrow' });
}

export function dayOfMonth(dateISO: string): number {
  return parseISODate(dateISO).getDate();
}
