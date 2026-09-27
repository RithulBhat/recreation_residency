/**
 * Daily runs.
 *
 * One run per game per day, the same for everyone, playable once. The seed reuses Songooner's
 * `dailySeed` so all four games agree on what "today" means, namespaced per game so the two do
 * not draw the same shuffle.
 *
 * "Played today" is kept in `localStorage`, which is a convenience and not a guard: anyone can
 * clear it. That is deliberate — the alternative is a backend, and this site does not have one.
 */

import { dailySeed, todayISO } from '@/game/challenge';

export type DailyGame = 'price' | 'hilo';

export function dailySeedFor(game: DailyGame, dateISO: string = todayISO()): string {
  return `${game}-${dailySeed(dateISO)}`;
}

const KEY = (game: DailyGame) => `rr:${game}:daily`;

export interface DailyRecord {
  date: string;
  score: number;
  /** The share grid, so a finished daily can be re-shared without replaying it. */
  marks: string;
}

export function readDaily(game: DailyGame): DailyRecord | null {
  try {
    const raw = localStorage.getItem(KEY(game));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const r = parsed as Partial<DailyRecord>;
    if (typeof r.date !== 'string' || typeof r.score !== 'number') return null;
    return { date: r.date, score: r.score, marks: typeof r.marks === 'string' ? r.marks : '' };
  } catch {
    return null;
  }
}

export function writeDaily(game: DailyGame, record: DailyRecord): void {
  try {
    localStorage.setItem(KEY(game), JSON.stringify(record));
  } catch {
    /* storage can be full or blocked; a daily that cannot be remembered is not a failure */
  }
}

/** Whether today's run is already done. */
export function playedToday(game: DailyGame, dateISO: string = todayISO()): boolean {
  return readDaily(game)?.date === dateISO;
}

/** Seconds until the next daily unlocks, for a countdown. */
export function secondsUntilTomorrow(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, Math.round((next.getTime() - now.getTime()) / 1000));
}
