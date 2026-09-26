/**
 * Shareable results: Wordle-style emoji grids + the Web Share / clipboard bridge.
 */

import type { GameMode, GameSettings, GameState, Round } from '@/types/game';
import { playedRounds, roundOutcome, summarizeGame } from './aggregate';
import type { DailyResult } from './types';

export const DEFAULT_APP_NAME = 'Songooner';

/** Grid legend — exported so the UI can render the same key. */
export const GRID_LEGEND: readonly { emoji: string; label: string }[] = [
  { emoji: '🟩', label: 'first try' },
  { emoji: '🟨', label: 'got it later' },
  { emoji: '🟧', label: 'artist only' },
  { emoji: '🟥', label: 'missed' },
  { emoji: '⬛', label: 'skipped' },
];

const MODE_LABEL: Record<GameMode, string> = {
  classic: 'Classic',
  fixed: 'Fixed',
  blitz: 'Blitz',
  survival: 'Survival',
  duel: 'Duel',
  party: 'Party',
};

/** `0.1` → `0.1s`, `1` → `1s`, `10` → `10s`. */
export function formatClip(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const rounded = Math.round(seconds * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toString().replace(/0+$/, '')}s`;
}

/** `6420` → `6,420`. Fixed locale so shared text is identical everywhere. */
export function formatScore(points: number): string {
  return Math.round(points).toLocaleString('en-US');
}

/** The emoji for one round. */
export function roundSymbol(round: Round, settings: GameSettings): string {
  const o = roundOutcome(round, settings);
  if (o.won) return o.wonFirstTry ? '🟩' : '🟨';
  if (round.status === 'skipped') return '⬛';
  if (o.hadPartial) return '🟧';
  if (round.status === 'lost') return '🟥';
  return '⬛';
}

/**
 * One line per played round: the outcome emoji plus the clip length that was on
 * the table when the round resolved.
 */
export function resultGrid(state: GameState): string {
  const settings = state.settings;
  return playedRounds(state)
    .map((round) => {
      const o = roundOutcome(round, settings);
      const clip = o.clipHeard > 0 ? o.clipHeard : startingClip(settings);
      return `${roundSymbol(round, settings)} ${formatClip(clip)}`;
    })
    .join('\n');
}

function startingClip(settings: GameSettings): number {
  if (settings.clipMode === 'escalating' && settings.stages.length > 0) {
    return settings.stages[0];
  }
  return settings.clipLength;
}

function headline(appName: string, label: string, correct: number, rounds: number, score: number) {
  return `${appName} · ${label} · ${correct}/${rounds} · ${formatScore(score)} pts`;
}

/** `7 songs in 60s` — a blitz is a race against the clock, not a set of rounds. */
export function blitzTally(correct: number, seconds: number, spaced = false): string {
  return `${correct} song${correct === 1 ? '' : 's'} in ${seconds}${spaced ? ' ' : ''}s`;
}

function headlineFor(appName: string, state: GameState, correct: number, rounds: number, score: number): string {
  const { settings } = state;
  if (settings.mode === 'blitz' && !settings.daily) {
    return `${appName} · Blitz · ${blitzTally(correct, settings.blitzDuration)} · ${formatScore(score)} pts`;
  }
  return headline(appName, modeLabel(state), correct, rounds, score);
}

/** Mode label for a game, e.g. `Classic` or `Daily 2026-09-26`. */
export function modeLabel(state: GameState): string {
  const daily = state.settings.daily;
  return daily ? `Daily ${daily}` : (MODE_LABEL[state.settings.mode] ?? state.settings.mode);
}

/**
 * Full share blob: headline, grid, optional link.
 * `Songooner · Classic · 8/10 · 6,420 pts`
 */
export function shareText(state: GameState, opts: { url?: string; appName?: string } = {}): string {
  const appName = opts.appName ?? DEFAULT_APP_NAME;
  const record = summarizeGame(state);
  const parts = [
    headlineFor(appName, state, record.correct, record.rounds, record.score),
    resultGrid(state),
  ].filter((p) => p.length > 0);
  if (record.players && record.players.length >= 2) {
    const scores = record.players
      .map((p) => `${p.name} ${formatScore(p.score)}`)
      .join('  ·  ');
    parts.push(record.winnerName ? `🏆 ${record.winnerName}\n${scores}` : scores);
  }
  if (opts.url) parts.push(opts.url);
  return parts.join('\n\n');
}

/** Share blob for a stored daily result. */
export function dailyShareText(
  result: DailyResult,
  dateISO?: string,
  url?: string,
  appName: string = DEFAULT_APP_NAME,
): string {
  const date = dateISO ?? result.date;
  const parts = [
    headline(appName, `Daily ${date}`, result.correct, result.rounds, result.score),
    result.grid,
  ].filter((p) => p.length > 0);
  if (url) parts.push(url);
  return parts.join('\n\n');
}

/** "Beat my score" blurb for challenge links. */
export function challengeShareText(name: string, score: number, url?: string): string {
  const who = name.trim().length > 0 ? name.trim() : 'Someone';
  const line = `🎯 ${who} scored ${formatScore(score)} on ${DEFAULT_APP_NAME}. Think you can beat that?`;
  return url ? `${line}\n\n${url}` : line;
}

function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError';
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', 'true');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Native share sheet when available, clipboard otherwise.
 * A dismissed share sheet counts as `'shared'` — nothing failed, the user just
 * changed their mind, so the UI should not show an error.
 */
export async function shareOrCopy(text: string): Promise<'shared' | 'copied' | 'failed'> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (err) {
      if (isAbortError(err)) return 'shared';
    }
  }
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return 'copied';
    } catch {
      // fall through to the legacy path
    }
  }
  return legacyCopy(text) ? 'copied' : 'failed';
}
