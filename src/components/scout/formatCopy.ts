/**
 * Per-format copy and colour for the Highlight Scout play + results chrome.
 *
 * Pure on purpose: every sentence a format puts on screen ("14 in 90 seconds", "you got to round 23
 * before the deep cuts got you", "27 of 32 franchises") is a function of `ScoutState` and is
 * unit-tested in `formatCopy.test.ts`, so the screens only paint.
 *
 * Nothing here re-derives a rule. The numbers come from `@/scout/selectors` (`formatProgress`,
 * `franchisesCleared`, `standings`, …) and the constants from `@/scout/formats`.
 */

import {
  BLITZ_MISS_PENALTY_MS,
  SURVIVAL_TIER_STEP,
  SURVIVAL_TIERS,
  scoutBlitzDuration,
  scoutFormat,
  scoutFormatInfo,
  survivalTierFor,
  survivalTierIndex,
} from '@/scout/formats';
import { puzzleCards } from '@/scout/puzzles';
import {
  franchisesCleared,
  franchisesTotal,
  isTie,
  leader,
  standings,
  wonRounds,
} from '@/scout/selectors';
import type { ScoutDifficulty, ScoutFormat, ScoutRound, ScoutState } from '@/scout/types';

/** One colour per format, used for the format pill and the results hero wash. */
export const SCOUT_FORMAT_ACCENT: Readonly<Record<ScoutFormat, string>> = {
  standard: '#a855f7',
  blitz: '#fbbf24',
  survival: '#fb7185',
  gauntlet: '#22d3ee',
  duel: '#f472b6',
  party: '#34d399',
};

/** How the survival ladder's tiers read in a sentence. */
export const SURVIVAL_TIER_COPY: Readonly<Record<ScoutDifficulty, { short: string; long: string }>> = {
  any: { short: 'Everyone', long: 'the whole league' },
  star: { short: 'Stars', long: 'the household names' },
  starter: { short: 'Starters', long: 'the starters' },
  rotation: { short: 'Rotation', long: 'the rotation men' },
  deepCut: { short: 'Deep cuts', long: 'the deep cuts' },
};

/** The four tiers survival walks through, in order, as chips. */
export const SURVIVAL_TIER_CHIPS = SURVIVAL_TIERS.map((tier) => ({
  tier,
  label: SURVIVAL_TIER_COPY[tier].short,
}));

/** Seconds of clock a blitz miss costs — for the "−5s" badge and the copy that explains it. */
export const BLITZ_PENALTY_SECONDS = Math.round(BLITZ_MISS_PENALTY_MS / 1000);

// ---------------------------------------------------------------------------------------------
// Choice rounds
// ---------------------------------------------------------------------------------------------

/**
 * The cards this round has already been burned on, for `ScoutPuzzleStage`'s `pickedPlayerIds`.
 *
 * A choice round is answered by tapping, and the tap is dispatched as `guess(card.name)` — so the
 * guesses that came back anything but `correct` name exactly the cards that were tried and missed.
 */
export function pickedCardIds(round: ScoutRound): string[] {
  const puzzle = round.subject.puzzle;
  if (!puzzle) return [];
  const cards = puzzleCards(puzzle);
  const out: string[] = [];
  for (const guess of round.guesses) {
    if (guess.verdict === 'correct' || guess.text.trim() === '') continue;
    const hit = cards.find((c) => c.name.toLowerCase() === guess.text.trim().toLowerCase());
    if (hit && !out.includes(hit.playerId)) out.push(hit.playerId);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The end of a run, in words
// ---------------------------------------------------------------------------------------------

export interface ScoutOutcome {
  format: ScoutFormat;
  /** 'Blitz' */
  name: string;
  emoji: string;
  /** The headline: '14 in 90 seconds'. Standard runs have none — the verdict is the headline. */
  headline: string | null;
  /** One line on what ended it. */
  detail: string;
  /** The big number and its caption, for the format's own result tile. */
  stat: string;
  statLabel: string;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Rounds that actually finished. */
function playedRounds(state: ScoutState): number {
  return state.rounds.filter((r) => r.status !== 'playing').length;
}

function blitzOutcome(state: ScoutState): Pick<ScoutOutcome, 'headline' | 'detail' | 'stat' | 'statLabel'> {
  const seconds = scoutBlitzDuration(state.settings);
  const correct = wonRounds(state);
  const missed = Math.max(0, playedRounds(state) - correct);
  const ran = state.endReason === 'queue-empty';
  return {
    headline: `${correct} in ${seconds} seconds`,
    detail: ran
      ? 'You emptied the pool before the clock ran out.'
      : state.endReason === 'quit'
        ? `Called it early with ${plural(correct, 'name')} on the board.`
        : missed === 0
          ? 'The clock ran out and you never missed one.'
          : `The clock ran out. ${plural(missed, 'miss', 'misses')} at ${BLITZ_PENALTY_SECONDS}s each cost you ${missed * BLITZ_PENALTY_SECONDS}s.`,
    stat: `${correct}`,
    statLabel: `named in ${seconds}s`,
  };
}

function survivalOutcome(state: ScoutState): Pick<ScoutOutcome, 'headline' | 'detail' | 'stat' | 'statLabel'> {
  const rounds = playedRounds(state);
  const correct = wonRounds(state);
  const tier = survivalTierFor(correct);
  const steps = survivalTierIndex(correct) + 1;
  const quit = state.endReason === 'quit';
  return {
    headline: quit
      ? `You walked away on round ${Math.max(1, rounds)}`
      : `You got to round ${Math.max(1, rounds)} before ${SURVIVAL_TIER_COPY[tier].long} got you`,
    detail: `${plural(correct, 'call')} right, ${plural(steps, 'tier')} deep — the league steps down every ${SURVIVAL_TIER_STEP} you get.`,
    stat: `${Math.max(1, rounds)}`,
    statLabel: 'rounds survived',
  };
}

function gauntletOutcome(state: ScoutState): Pick<ScoutOutcome, 'headline' | 'detail' | 'stat' | 'statLabel'> {
  const cleared = franchisesCleared(state).length;
  const total = franchisesTotal(state);
  const left = Math.max(0, total - cleared);
  return {
    headline: `${cleared} of ${total} franchises`,
    detail:
      cleared === total && total > 0
        ? 'The whole board. Every club in the league, cleared.'
        : state.endReason === 'quit'
          ? `Left the board with ${plural(left, 'club')} still open.`
          : `${plural(left, 'club')} beat you.`,
    stat: `${cleared}/${total}`,
    statLabel: 'franchises cleared',
  };
}

function seatOutcome(state: ScoutState): Pick<ScoutOutcome, 'headline' | 'detail' | 'stat' | 'statLabel'> {
  const board = standings(state);
  const top = leader(state);
  const tied = isTie(state);
  const scores = board.map((p) => p.score.toLocaleString('en-US')).join(' – ');
  if (!top) {
    return { headline: 'Nobody scored', detail: 'No rounds were played.', stat: '0', statLabel: 'points' };
  }
  if (tied) {
    return {
      headline: `Dead level at ${top.score.toLocaleString('en-US')}`,
      detail: `${board.length} seats, nothing between the top two. Play a decider.`,
      stat: scores,
      statLabel: 'final scores',
    };
  }
  const runnerUp = board[1];
  const margin = runnerUp ? top.score - runnerUp.score : top.score;
  return {
    headline: `${top.name} wins it`,
    detail:
      board.length > 2
        ? `${plural(top.correct, 'call')} right across ${plural(board.length, 'seat')}, ${margin.toLocaleString('en-US')} clear.`
        : `${margin.toLocaleString('en-US')} clear — ${scores}.`,
    stat: scores,
    statLabel: board.length > 2 ? 'final scores' : 'head to head',
  };
}

/**
 * What this run's format has to say about how it ended. `standard` deliberately returns no headline:
 * its hero keeps the accuracy verdict it always had.
 */
export function scoutOutcome(state: ScoutState): ScoutOutcome {
  const format = scoutFormat(state.settings);
  const info = scoutFormatInfo(format);
  const base = { format, name: info?.name ?? format, emoji: info?.emoji ?? '🏈' };
  switch (format) {
    case 'blitz':
      return { ...base, ...blitzOutcome(state) };
    case 'survival':
      return { ...base, ...survivalOutcome(state) };
    case 'gauntlet':
      return { ...base, ...gauntletOutcome(state) };
    case 'duel':
    case 'party':
      return { ...base, ...seatOutcome(state) };
    default: {
      const correct = wonRounds(state);
      const played = playedRounds(state);
      return {
        ...base,
        headline: null,
        detail: info?.ends ?? '',
        stat: `${correct}/${played}`,
        statLabel: 'named',
      };
    }
  }
}
