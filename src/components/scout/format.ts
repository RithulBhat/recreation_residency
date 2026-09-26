/**
 * Small label helpers shared by the Highlight Scout play + results components.
 *
 * `points` / `clock` are reused from Songooner's formatter so both games print numbers identically.
 * Everything else is Scout-specific: verdict wording, the per-rung price list, and the split of a
 * rung's clues between the stage (which OWNS the puzzle text of a text mode) and the clue rail.
 */

import type { BadgeTone } from '@/components/ui/Badge';
import { clock, points } from '@/components/play/format';
import { GROUP_LABELS } from '@/scout/stages';
import { BASE_POINTS, modeWeight, tryFactor } from '@/scout/scoring';
import type {
  NflPlayer,
  NflTeam,
  ScoutClue,
  ScoutClueKind,
  ScoutMode,
  ScoutRound,
  ScoutSubject,
  ScoutVerdict,
} from '@/scout/types';

export { clock, points };

export const VERDICT_LABEL: Record<ScoutVerdict, string> = {
  correct: 'Correct',
  close: 'So close',
  wrong: 'Wrong',
  skipped: 'Skipped',
  timeout: 'Timed out',
};

export const VERDICT_TONE: Record<ScoutVerdict, BadgeTone> = {
  correct: 'success',
  close: 'warn',
  wrong: 'danger',
  skipped: 'neutral',
  timeout: 'danger',
};

/** The verdict of a round as a whole (a `close` guess that ran out of tries still lost). */
export function roundVerdict(round: ScoutRound): ScoutVerdict {
  if (round.status === 'won') return 'correct';
  const last = round.guesses[round.guesses.length - 1];
  if (last?.verdict === 'timeout') return 'timeout';
  if (round.guesses.length > 0 && round.guesses.every((g) => g.verdict === 'skipped')) return 'skipped';
  if (round.guesses.some((g) => g.verdict === 'close')) return 'close';
  if (round.status === 'skipped') return 'skipped';
  return 'wrong';
}

/** Tries actually consumed (a win on rung 0 = 1 try). */
export function triesUsed(round: ScoutRound): number {
  const win = round.guesses.find((g) => g.verdict === 'correct');
  if (win) return win.tryIndex + 1;
  return Math.max(round.tryIndex, round.guesses.length > 0 ? 1 : 0);
}

/** What solving on rung `tryIndex` is worth before bonuses — the TryLadder's price list. */
export function rungValue(mode: ScoutMode, tryIndex: number): number {
  return Math.round(BASE_POINTS * tryFactor(tryIndex) * modeWeight(mode));
}

/** `4,140` → `4.1k` for the tight pills on a 320 px phone. */
export function shortPoints(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  if (v < 1000) return String(v);
  const k = v / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}

// ---------------------------------------------------------------------------------------------
// Clue routing
// ---------------------------------------------------------------------------------------------

/**
 * Which clue kinds the STAGE renders for a mode. The rest go to the clue rail.
 *
 * For a text mode the puzzle itself arrives as a clue (the redacted play, the stat pairs, the
 * franchise facts, the draft paperwork) — those belong in the stage, typeset large. The supporting
 * facts (position, team, first initial…) are rail chips in every mode.
 */
const STAGE_CLUES: Readonly<Record<ScoutMode, readonly ScoutClueKind[] | 'all' | 'none'>> = {
  silhouette: 'none',
  faceZoom: 'none',
  logoZoom: 'none',
  highlight: ['play'],
  statLine: ['stat'],
  teamTrivia: 'all',
  careerPath: 'all',
};

export function stageOwnsAll(mode: ScoutMode): boolean {
  return STAGE_CLUES[mode] === 'all';
}

/** The clues the stage renders at this rung, in ladder order. */
export function stageClues(mode: ScoutMode, clues: readonly ScoutClue[]): ScoutClue[] {
  const own = STAGE_CLUES[mode];
  if (own === 'none') return [];
  if (own === 'all') return clues.slice();
  return clues.filter((c) => own.includes(c.kind));
}

/** The clues the rail renders at this rung — everything the stage did not take. */
export function railClues(mode: ScoutMode, clues: readonly ScoutClue[]): ScoutClue[] {
  const own = STAGE_CLUES[mode];
  if (own === 'none') return clues.slice();
  if (own === 'all') return [];
  return clues.filter((c) => !own.includes(c.kind));
}

// ---------------------------------------------------------------------------------------------
// Subject copy
// ---------------------------------------------------------------------------------------------

/** 'Quarterback · #15' — the one-liner under a player's name. */
export function playerLine(player: NflPlayer): string {
  const parts = [GROUP_LABELS[player.group] ?? player.pos];
  if (player.pos && GROUP_LABELS[player.group] !== player.pos) parts[0] = `${GROUP_LABELS[player.group]} (${player.pos})`;
  if (player.jersey) parts.push(`#${player.jersey}`);
  return parts.join(' · ');
}

/** `6'3", 225 lb` — empty when the dataset has neither. */
export function buildLine(player: NflPlayer): string {
  const h = player.heightIn;
  const parts: string[] = [];
  if (typeof h === 'number' && h > 0) parts.push(`${Math.floor(h / 12)}'${h % 12}"`);
  if (typeof player.weightLb === 'number' && player.weightLb > 0) parts.push(`${player.weightLb} lb`);
  return parts.join(', ');
}

/** 'Round 1, pick 10 · 2017 · Texas Tech' or 'Undrafted · Texas Tech'. */
export function draftLine(player: NflPlayer): string {
  const parts: string[] = [];
  if (player.draft) parts.push(`${player.draft.year} · Round ${player.draft.round}, pick ${player.draft.pick}`);
  else parts.push('Undrafted');
  if (player.college) parts.push(player.college);
  return parts.join(' · ');
}

/** 'AFC West · Arrowhead Stadium'. */
export function teamLine(team: NflTeam): string {
  return [`${team.conference} ${team.division}`, team.venue].filter((s) => s !== '').join(' · ');
}

export function superBowlLine(team: NflTeam): string {
  const n = team.superBowls.length;
  if (n === 0) return 'No Super Bowl titles';
  if (n === 1) return `1 Super Bowl (${team.superBowls[0]})`;
  return `${n} Super Bowls · ${team.superBowls.join(', ')}`;
}

/** ESPN's public player page — the fallback when a player has no verified highlight clip. */
export function espnPlayerUrl(playerId: string): string {
  return `https://www.espn.com/nfl/player/_/id/${encodeURIComponent(playerId)}`;
}

export function espnTeamUrl(abbr: string): string {
  return `https://www.espn.com/nfl/team/_/name/${encodeURIComponent(abbr.toLowerCase())}`;
}

/** What the player is naming this round, for placeholders and empty states. */
export function subjectNoun(subject: Pick<ScoutSubject, 'kind'>): string {
  return subject.kind === 'team' ? 'team' : 'player';
}
