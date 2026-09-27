import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { createInitialScoutState, reduce } from './engine';
import { normalizeScoutSettings } from './presets';
import { buildPool, buildPlayerSubject } from './subjects';
import { fixtureBundle, findFixturePlayer, findFixtureTeam } from './fixtures';
import {
  accuracy,
  activePlayer,
  allGuesses,
  awaitingBuzz,
  blitzTimeLeftMs,
  buzzKeyFor,
  canGuess,
  canPlayerBuzz,
  canPlayerGuess,
  currentFormat,
  currentFormatInfo,
  formatProgress,
  franchiseBoard,
  franchisesCleared,
  franchisesTotal,
  handover,
  isLockedOut,
  isMultiplayerRun,
  isTie,
  leader,
  livesLeft,
  lockedOutPlayerIds,
  nextPlayer,
  playerById,
  roundRungs,
  runPlayers,
  standings,
  survivalTier,
  whoseTurn,
  completedRounds,
  currentRound,
  currentStage,
  elapsedMs,
  isFinished,
  isRoundOver,
  lastGuess,
  lastVerdict,
  newlyRevealedClues,
  progress,
  revealedClues,
  stageAt,
  timeLeftMs,
  triesLeft,
  visualLevel,
  wasClose,
  wonRounds,
} from './selectors';
import type { ScoutSettings, ScoutState } from './types';

const T0 = 500_000;

function start(over: Partial<ScoutSettings> = {}): ScoutState {
  const settings = normalizeScoutSettings(over);
  const subjects = buildPool(fixtureBundle(), settings, createRng('pool'));
  return reduce(createInitialScoutState(), { type: 'start', settings, subjects, now: T0 }, createRng('run'));
}

describe('selectors on an idle state', () => {
  const idle = createInitialScoutState();
  it('never throws and returns empty defaults', () => {
    expect(currentRound(idle)).toBeUndefined();
    expect(currentStage(idle)).toBeUndefined();
    expect(revealedClues(idle)).toEqual([]);
    expect(newlyRevealedClues(idle)).toEqual([]);
    expect(visualLevel(idle)).toBe(0);
    expect(triesLeft(idle)).toBe(0);
    expect(canGuess(idle)).toBe(false);
    expect(isRoundOver(idle)).toBe(false);
    expect(isFinished(idle)).toBe(false);
    expect(timeLeftMs(idle, T0)).toBeNull();
    expect(elapsedMs(idle, T0)).toBe(0);
    expect(lastGuess(idle)).toBeUndefined();
    expect(lastVerdict(idle)).toBeUndefined();
    expect(wasClose(idle)).toBe(false);
    expect(completedRounds(idle)).toEqual([]);
    expect(wonRounds(idle)).toBe(0);
    expect(accuracy(idle)).toBe(0);
    expect(allGuesses(idle)).toEqual([]);
    expect(progress(idle)).toEqual({ round: 0, total: 10 });
  });
});

describe('stage selectors', () => {
  it('reads the current rung and clamps out-of-range indices', () => {
    const st = start({ tries: 4 });
    const round = currentRound(st)!;
    expect(currentStage(st)).toBe(round.stages[0]);
    expect(stageAt(round, -5)).toBe(round.stages[0]);
    expect(stageAt(round, 99)).toBe(round.stages[3]);
    expect(stageAt({ ...round, stages: [] }, 0)).toBeUndefined();
  });

  it('accumulates clues and reports only what a rung added', () => {
    // six tries = exactly one new clue per rung for the silhouette ladder
    let st = start({ tries: 6 });
    expect(revealedClues(st)).toEqual([]);
    expect(newlyRevealedClues(st)).toEqual([]);
    st = reduce(st, { type: 'skip', now: T0 + 1 });
    expect(revealedClues(st)).toHaveLength(1);
    expect(newlyRevealedClues(st)).toHaveLength(1);
    st = reduce(st, { type: 'skip', now: T0 + 2 });
    expect(revealedClues(st)).toHaveLength(2);
    expect(newlyRevealedClues(st).map((c) => c.label)).toEqual(['Conference']);
    expect(visualLevel(st)).toBeGreaterThan(0);
  });
});

describe('verdict selectors', () => {
  it('surfaces the last guess and the close nudge', () => {
    const justin = buildPlayerSubject(findFixturePlayer('Justin Jefferson'), findFixtureTeam('MIN'));
    const van = buildPlayerSubject(findFixturePlayer('Van Jefferson'), findFixtureTeam('SEA'));
    const settings = normalizeScoutSettings({ tries: 4 });
    let st = reduce(
      createInitialScoutState(),
      { type: 'start', settings, subjects: [justin, van], now: T0 },
      createRng('r'),
    );
    st = reduce(st, { type: 'guess', text: 'jefferson', now: T0 + 1 });
    expect(lastVerdict(st)).toBe('close');
    expect(wasClose(st)).toBe(true);
    expect(lastGuess(st)?.text).toBe('jefferson');
    st = reduce(st, { type: 'guess', text: 'nobody at all', now: T0 + 2 });
    expect(lastVerdict(st)).toBe('wrong');
    expect(wasClose(st)).toBe(false);
  });
});

describe('progress and totals', () => {
  it('counts rounds against the limit, or the pool when endless', () => {
    const limited = start({ rounds: 3 });
    expect(progress(limited).total).toBe(3);
    const endless = start({ rounds: 0 });
    expect(progress(endless).total).toBe(0);
    const pool = endless.rounds.length + endless.queue.length;
    const capped = start({ rounds: 500 });
    expect(progress(capped).total).toBeLessThanOrEqual(pool);
  });

  it('tracks wins, accuracy and every guess', () => {
    let st = start({ rounds: 3, tries: 3 });
    const target = currentRound(st)!.subject.name;
    st = reduce(st, { type: 'guess', text: 'wrong one', now: T0 + 1 });
    st = reduce(st, { type: 'guess', text: target, now: T0 + 2 });
    expect(wonRounds(st)).toBe(1);
    expect(accuracy(st)).toBe(1);
    expect(allGuesses(st)).toHaveLength(2);
    st = reduce(st, { type: 'next', now: T0 + 3 });
    st = reduce(st, { type: 'giveUp', now: T0 + 4 });
    expect(wonRounds(st)).toBe(1);
    expect(accuracy(st)).toBe(0.5);
    expect(completedRounds(st)).toHaveLength(2);
    expect(isRoundOver(st)).toBe(true);
  });

  it('elapsedMs measures from the first tick and freezes when the round ends', () => {
    let st = start({ roundTimer: 60 });
    expect(elapsedMs(st, T0 + 9_000)).toBe(9_000);
    st = reduce(st, { type: 'tick', now: T0 + 30_000 });
    expect(elapsedMs(st, T0 + 31_000)).toBe(1_000);
    st = reduce(st, { type: 'giveUp', now: T0 + 32_000 });
    expect(elapsedMs(st, T0 + 99_000)).toBe(2_000);
  });

  it('timeLeftMs stops once the run is over', () => {
    const st = reduce(start({ roundTimer: 30 }), { type: 'quit', now: T0 + 1 });
    expect(timeLeftMs(st, T0 + 2)).toBeNull();
    expect(isFinished(st)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Session-format selectors
// ---------------------------------------------------------------------------------------------

describe('format selectors on an idle state', () => {
  const idle = createInitialScoutState();

  it('read as standard, empty and safe', () => {
    expect(currentFormat(idle)).toBe('standard');
    expect(currentFormatInfo(idle)?.id).toBe('standard');
    expect(isMultiplayerRun(idle)).toBe(false);
    expect(runPlayers(idle)).toEqual([]);
    expect(playerById(idle, 'you')).toBeUndefined();
    expect(activePlayer(idle)).toBeUndefined();
    expect(whoseTurn(idle)).toBeUndefined();
    expect(nextPlayer(idle)).toBeUndefined();
    expect(handover(idle)).toBeNull();
    expect(standings(idle)).toEqual([]);
    expect(leader(idle)).toBeUndefined();
    expect(isTie(idle)).toBe(false);
    expect(lockedOutPlayerIds(idle)).toEqual([]);
    expect(isLockedOut(idle, 'p1')).toBe(false);
    expect(awaitingBuzz(idle)).toBe(false);
    expect(canPlayerBuzz(idle, 'p1')).toBe(false);
    expect(canPlayerGuess(idle, 'p1')).toBe(false);
    expect(buzzKeyFor(idle, 'p1')).toBeUndefined();
    expect(livesLeft(idle)).toBeNull();
    expect(survivalTier(idle)).toBeNull();
    expect(franchisesCleared(idle)).toEqual([]);
    expect(franchisesTotal(idle)).toBe(0);
    expect(franchiseBoard(idle)).toEqual([]);
    expect(blitzTimeLeftMs(idle, 1)).toBeNull();
  });

  it('formatProgress is renderable before anything has started', () => {
    const p = formatProgress(idle, 0);
    expect(p).toMatchObject({
      format: 'standard',
      round: 0,
      correct: 0,
      livesLeft: null,
      timeLeftMs: null,
      franchisesCleared: 0,
      franchisesTotal: 0,
      awaitingBuzz: false,
    });
    expect(p.activePlayerId).toBeUndefined();
    expect(p.label.length).toBeGreaterThan(0);
  });

  it('tolerates a state that predates formats entirely', () => {
    // no `players`, no `activePlayerIndex`, no `format` — exactly a v1 persisted run
    const legacy = { ...createInitialScoutState(), status: 'playing' as const };
    delete (legacy as { players?: unknown }).players;
    delete (legacy as { activePlayerIndex?: unknown }).activePlayerIndex;
    delete (legacy.settings as { format?: unknown }).format;
    expect(currentFormat(legacy)).toBe('standard');
    expect(runPlayers(legacy)).toEqual([]);
    expect(activePlayer(legacy)).toBeUndefined();
    expect(livesLeft(legacy)).toBeNull();
    expect(() => formatProgress(legacy, 0)).not.toThrow();
  });
});

describe('roundRungs and buzz keys', () => {
  it('reads the ladder off the round, not off settings.tries', () => {
    const st = start({ tries: 4 });
    const r = currentRound(st)!;
    expect(roundRungs(r)).toBe(4);
    expect(roundRungs({ ...r, stages: [] })).toBe(1);
  });

  it('maps the first two seats to A and L', () => {
    const settings = normalizeScoutSettings({
      format: 'duel',
      players: [
        { id: 'a1', name: 'One', emoji: '1️⃣', color: '#a855f7' },
        { id: 'b2', name: 'Two', emoji: '2️⃣', color: '#22d3ee' },
      ],
    });
    const subjects = buildPool(fixtureBundle(), settings, createRng('pool'));
    const st = reduce(createInitialScoutState(), { type: 'start', settings, subjects, now: T0 }, createRng('run'));
    expect(buzzKeyFor(st, 'a1')).toBe('a');
    expect(buzzKeyFor(st, 'b2')).toBe('l');
    expect(buzzKeyFor(st, 'nobody')).toBeUndefined();
    expect(playerById(st, 'a1')?.name).toBe('One');
    expect(isMultiplayerRun(st)).toBe(true);
  });
});
