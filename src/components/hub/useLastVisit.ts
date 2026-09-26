/**
 * "Welcome back" — read straight out of `localStorage`, after mount.
 *
 * The hub deliberately does NOT import the stats store: `sg:stats` is written by a persisted
 * zustand slice whose module drags in the whole achievement engine, and nothing on the front door
 * is worth delaying first paint for. So this parses the persisted envelope itself, defensively, in
 * an effect — a first-time visitor pays nothing and sees nothing.
 *
 * `counts.test.ts` pins `STATS_KEY` to the store's own `STATS_STORAGE_KEY`, and the tests below pin
 * the shape, so the copy can only ever report something the store actually wrote.
 */

import { useEffect, useState } from 'react';
import type { GameMode } from '@/types/game';
import { rankFor, type Rank } from '@/stats/rank';
import { STATS_KEY } from './counts';

export interface LastGame {
  mode: GameMode;
  score: number;
  finishedAt: number;
  rounds: number;
  correct: number;
}

export interface LastVisit {
  /** XP rank, present once any game has been played. */
  rank: Rank;
  /** Lifetime games recorded. */
  games: number;
  /** The most recently finished game, when the record survived normalising. */
  last: LastGame | null;
}

const MODES: readonly GameMode[] = ['classic', 'fixed', 'blitz', 'survival', 'duel', 'party'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readLastGame(records: unknown): LastGame | null {
  if (!Array.isArray(records)) return null;
  // `records` is newest-first, but a hand-edited or imported file may not be — take the latest.
  let best: LastGame | null = null;
  for (const raw of records) {
    if (!isObj(raw)) continue;
    const finishedAt = num(raw.finishedAt);
    const score = num(raw.score);
    if (finishedAt === null || score === null) continue;
    if (typeof raw.mode !== 'string' || !MODES.includes(raw.mode as GameMode)) continue;
    if (best !== null && finishedAt <= best.finishedAt) continue;
    best = {
      mode: raw.mode as GameMode,
      score: Math.max(0, Math.round(score)),
      finishedAt,
      rounds: Math.max(0, Math.round(num(raw.rounds) ?? 0)),
      correct: Math.max(0, Math.round(num(raw.correct) ?? 0)),
    };
  }
  return best;
}

/**
 * Parse the persisted `sg:stats` envelope (`{ state, version }`). Returns `null` for anything that
 * is missing, unreadable or empty — the hub then shows nothing at all rather than an empty state.
 */
export function parseLastVisit(json: string | null): LastVisit | null {
  if (json === null || json === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObj(parsed)) return null;
  // zustand's persist middleware wraps the slice; tolerate a bare slice too.
  const state = isObj(parsed.state) ? parsed.state : parsed;
  const totals = isObj(state.totals) ? state.totals : null;
  const games = num(totals?.games) ?? 0;
  const xp = num(totals?.xp) ?? 0;
  if (games <= 0) return null;
  return { rank: rankFor(xp), games: Math.round(games), last: readLastGame(state.records) };
}

/** `null` until read, and `null` forever for anyone who has not finished a game on this device. */
export function useLastVisit(): LastVisit | null {
  const [visit, setVisit] = useState<LastVisit | null>(null);
  useEffect(() => {
    try {
      setVisit(parseLastVisit(localStorage.getItem(STATS_KEY)));
    } catch {
      /* Safari private mode / storage disabled — the line simply never appears. */
    }
  }, []);
  return visit;
}

/** "just now" · "3h ago" · "2 days ago" — coarse on purpose, so it never looks like a clock. */
export function relativeTime(then: number, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 90) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? 'last month' : `${months} months ago`;
}
