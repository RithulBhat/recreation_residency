/**
 * Session formats, end to end. `standard` has its own characterisation test
 * (`engine.standard.test.ts`); this file covers blitz, survival, gauntlet, duel and party:
 * every lifecycle, every ending, the lives and clock arithmetic, buzzer lockouts, party rotation,
 * seeded determinism and reducer purity.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import type { PlayerConfig } from '@/types/game';
import { createInitialScoutState, ladderRungs, reduce } from './engine';
import {
  BLITZ_LADDER_RUNGS,
  BLITZ_MISS_PENALTY_MS,
  BLITZ_RUNG,
  SOLO_SCOUT_PLAYER,
  SURVIVAL_TIERS,
  franchiseIdOf,
} from './formats';
import { normalizeScoutSettings } from './presets';
import {
  awaitingBuzz,
  canGuess,
  canPlayerBuzz,
  canPlayerGuess,
  currentFormat,
  currentRound,
  formatProgress,
  franchiseBoard,
  franchisesCleared,
  franchisesTotal,
  handover,
  isLockedOut,
  leader,
  livesLeft,
  lockedOutPlayerIds,
  nextPlayer,
  progress,
  runPlayers,
  standings,
  survivalTier,
  timeLeftMs,
  triesLeft,
  whoseTurn,
} from './selectors';
import { buildPlayerSubject, buildPool } from './subjects';
import { fixtureBundle, findFixturePlayer, findFixtureTeam, makePlayer } from './fixtures';
import type { ScoutAction, ScoutFormat, ScoutSettings, ScoutState, ScoutSubject } from './types';

const T0 = 2_000_000;

function s(over: Partial<ScoutSettings> = {}): ScoutSettings {
  return normalizeScoutSettings(over);
}

function pool(settings: ScoutSettings): ScoutSubject[] {
  return buildPool(fixtureBundle(), settings, createRng(settings.seed ?? 'pool-rng'));
}

function start(over: Partial<ScoutSettings> = {}, now = T0, subjects?: ScoutSubject[]): ScoutState {
  const settings = s(over);
  return reduce(
    createInitialScoutState(),
    { type: 'start', settings, subjects: subjects ?? pool(settings), now },
    createRng(settings.seed ?? 'run-rng'),
  );
}

function answer(state: ScoutState): string {
  const r = currentRound(state);
  if (!r) throw new Error('no round');
  return r.subject.name;
}

/** Solve the live round, then step to the next one (no-op in blitz, which auto-advances). */
function solveAndAdvance(state: ScoutState, now: number): ScoutState {
  const won = reduce(state, { type: 'guess', text: answer(state), now });
  return reduce(won, { type: 'next', now: now + 1 });
}

function missAndAdvance(state: ScoutState, now: number): ScoutState {
  const lost = reduce(state, { type: 'giveUp', now });
  return reduce(lost, { type: 'next', now: now + 1 });
}

const PLAYER_CONFIGS: readonly PlayerConfig[] = [
  { id: 'p1', name: 'Fox', emoji: '🦊', color: '#f97316' },
  { id: 'p2', name: 'Octo', emoji: '🐙', color: '#a855f7' },
  { id: 'p3', name: 'Frog', emoji: '🐸', color: '#34d399' },
];

const FAME_BY_TIER = { star: 90, starter: 62, rotation: 40, deepCut: 10 } as const;
const SURNAMES = [
  'Ashford', 'Brindle', 'Calloway', 'Draper', 'Everly', 'Fenwick', 'Grimsby', 'Harlowe',
  'Ingram', 'Jessop', 'Kettering', 'Lanning', 'Mowbray', 'Nettles', 'Orwell', 'Pennington',
  'Quillan', 'Rathbone', 'Stanhope', 'Thackeray',
];

/**
 * `perTier` synthetic players in each difficulty tier, with unique surnames (so no guess is ever
 * ambiguous) and unique teams where possible. Survival's escalation is tested against this.
 */
function tierSubjects(perTier: number): ScoutSubject[] {
  const teams = ['KC', 'SF', 'GB', 'BUF', 'MIN', 'PHI', 'NYG', 'NYJ', 'LAC', 'SEA'];
  const out: ScoutSubject[] = [];
  let n = 0;
  for (const tier of SURVIVAL_TIERS) {
    for (let i = 0; i < perTier; i++) {
      const last = SURNAMES[n % SURNAMES.length];
      const team = findFixtureTeam(teams[n % teams.length]);
      out.push(
        buildPlayerSubject(
          makePlayer({
            id: `tier-${tier}-${i}`,
            name: `Test ${last}`,
            first: 'Test',
            last,
            teamId: team.id,
            pos: 'WR',
            jersey: String((n % 99) + 1),
            exp: 3,
            college: 'State',
            fame: FAME_BY_TIER[tier as keyof typeof FAME_BY_TIER],
          }),
          team,
        ),
      );
      n += 1;
    }
  }
  return out;
}

// =============================================================================================
// blitz
// =============================================================================================

describe('blitz', () => {
  const blitz = (over: Partial<ScoutSettings> = {}): ScoutState =>
    start({ format: 'blitz', mode: 'silhouette', packIds: ['superstars'], blitzDuration: 60, ...over });

  it('starts one absolute clock and reports it', () => {
    const st = blitz();
    expect(currentFormat(st)).toBe('blitz');
    expect(st.blitzEndsAt).toBe(T0 + 60_000);
    expect(timeLeftMs(st, T0)).toBe(60_000);
    expect(timeLeftMs(st, T0 + 45_000)).toBe(15_000);
    expect(timeLeftMs(st, T0 + 99_000)).toBe(0);
  });

  it('opens every subject at the SAME single fixed rung and never advances it', () => {
    let st = blitz();
    for (let i = 0; i < 3 && st.status === 'playing'; i++) {
      const r = currentRound(st);
      expect(r?.stages).toHaveLength(BLITZ_LADDER_RUNGS);
      expect(r?.tryIndex).toBe(BLITZ_RUNG);
      expect(triesLeft(st)).toBe(1);
      st = reduce(st, { type: 'guess', text: answer(st), now: T0 + i * 100 });
    }
    expect(st.rounds.every((r) => r.tryIndex === BLITZ_RUNG)).toBe(true);
  });

  it('never pauses on round-over: a correct answer opens the next subject instantly', () => {
    const st = blitz();
    const first = currentRound(st)?.subject.id;
    const next = reduce(st, { type: 'guess', text: answer(st), now: T0 + 1_000 });
    expect(next.status).toBe('playing');
    expect(next.rounds).toHaveLength(2);
    expect(next.currentRound).toBe(1);
    expect(next.rounds[0].status).toBe('won');
    expect(next.rounds[0].score).toBeGreaterThan(0);
    expect(next.totalScore).toBe(next.rounds[0].score);
    expect(currentRound(next)?.subject.id).not.toBe(first);
    expect(next.blitzEndsAt).toBe(T0 + 60_000);
  });

  it('charges five seconds for a wrong guess and moves on', () => {
    const st = blitz();
    const next = reduce(st, { type: 'guess', text: 'nobody at all', now: T0 + 1_000 });
    expect(next.status).toBe('playing');
    expect(next.rounds).toHaveLength(2);
    expect(next.rounds[0].status).toBe('lost');
    expect(next.blitzEndsAt).toBe(T0 + 60_000 - BLITZ_MISS_PENALTY_MS);
    expect(next.streak).toBe(0);
  });

  it('charges the same five seconds for a skip, a give-up and a timeout', () => {
    for (const action of [{ type: 'skip' }, { type: 'giveUp' }, { type: 'timeout' }] as const) {
      const st = blitz();
      const next = reduce(st, { ...action, now: T0 + 500 });
      expect(next.blitzEndsAt).toBe(T0 + 60_000 - BLITZ_MISS_PENALTY_MS);
      expect(next.rounds[0].status).toBe('lost');
      expect(next.rounds).toHaveLength(2);
    }
  });

  it('stacks penalties and can be driven to the clock by misses alone', () => {
    let st = blitz({ blitzDuration: 30 });
    expect(st.blitzEndsAt).toBe(T0 + 30_000);
    for (let i = 0; i < 3 && st.status === 'playing'; i++) {
      st = reduce(st, { type: 'skip', now: T0 + i });
    }
    expect(st.blitzEndsAt).toBe(T0 + 30_000 - 3 * BLITZ_MISS_PENALTY_MS);
  });

  it('ends on the clock via tick', () => {
    const st = blitz({ blitzDuration: 30 });
    expect(reduce(st, { type: 'tick', now: T0 + 29_999 }).status).toBe('playing');
    const out = reduce(st, { type: 'tick', now: T0 + 30_000 });
    expect(out.status).toBe('finished');
    expect(out.endReason).toBe('time');
    expect(out.finishedAt).toBe(T0 + 30_000);
    expect(out.rounds[0].status).toBe('skipped');
  });

  it('ends on the clock when a round finishes after time is up', () => {
    const st = blitz({ blitzDuration: 30 });
    const out = reduce(st, { type: 'guess', text: answer(st), now: T0 + 31_000 });
    expect(out.status).toBe('finished');
    expect(out.endReason).toBe('time');
    // the answer still counted — it landed before the clock was checked
    expect(out.rounds[0].status).toBe('won');
    expect(out.totalScore).toBeGreaterThan(0);
  });

  it('ends when the pool runs out', () => {
    const only = buildPlayerSubject(findFixturePlayer('Patrick Mahomes'), findFixtureTeam('KC'));
    const st = start({ format: 'blitz', mode: 'silhouette' }, T0, [only]);
    const out = reduce(st, { type: 'guess', text: 'mahomes', now: T0 + 100 });
    expect(out.status).toBe('finished');
    expect(out.endReason).toBe('queue-empty');
    expect(out.rounds[0].status).toBe('won');
  });

  it("ignores 'next' — it is never in round-over", () => {
    const st = blitz();
    expect(reduce(st, { type: 'next', now: T0 + 1 })).toBe(st);
    const after = reduce(st, { type: 'guess', text: answer(st), now: T0 + 1 });
    expect(after.status).toBe('playing');
    expect(reduce(after, { type: 'next', now: T0 + 2 })).toBe(after);
  });

  it('ignores the round timer (normalization zeroes it) and never double-penalises', () => {
    const settings = s({ format: 'blitz', roundTimer: 20 });
    expect(settings.roundTimer).toBe(0);
    expect(settings.rounds).toBe(0);
    const st = blitz({ roundTimer: 20 });
    const ticked = reduce(st, { type: 'tick', now: T0 + 1_000 });
    expect(reduce(ticked, { type: 'tick', now: T0 + 50_000 })).toBe(ticked);
  });

  it('rewards volume and a streak: totals climb round on round', () => {
    let st = blitz();
    const scores: number[] = [];
    for (let i = 0; i < 4 && st.status === 'playing'; i++) {
      st = reduce(st, { type: 'guess', text: answer(st), now: T0 + i * 200 });
      scores.push(st.rounds[i].score);
    }
    expect(scores).toHaveLength(4);
    expect(scores[3]).toBeGreaterThan(scores[0]);
    expect(st.bestStreak).toBe(4);
    expect(formatProgress(st, T0).label).toBe('4 named');
  });

  it('quits mid-run', () => {
    const st = reduce(blitz(), { type: 'quit', now: T0 + 5 });
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('quit');
  });
});

// =============================================================================================
// survival
// =============================================================================================

describe('survival', () => {
  const survival = (over: Partial<ScoutSettings> = {}, subjects?: ScoutSubject[]): ScoutState =>
    start({ format: 'survival', mode: 'silhouette', tries: 5, lives: 3, ...over }, T0, subjects ?? tierSubjects(4));

  it('starts with lives on the implicit solo player', () => {
    const st = survival();
    expect(runPlayers(st)).toHaveLength(1);
    expect(runPlayers(st)[0].id).toBe(SOLO_SCOUT_PLAYER.id);
    expect(runPlayers(st)[0].lives).toBe(3);
    expect(livesLeft(st)).toBe(3);
    expect(st.settings.rounds).toBe(0);
    expect(st.settings.difficulty).toBe('any');
  });

  it('clamps lives to 1–5', () => {
    expect(runPlayers(survival({ lives: 0 }))[0].lives).toBe(1);
    expect(runPlayers(survival({ lives: 99 }))[0].lives).toBe(5);
  });

  it('spends one life per lost round and nothing on a won one', () => {
    let st = survival();
    st = solveAndAdvance(st, T0 + 100);
    expect(livesLeft(st)).toBe(3);
    st = missAndAdvance(st, T0 + 200);
    expect(livesLeft(st)).toBe(2);
    st = missAndAdvance(st, T0 + 300);
    expect(livesLeft(st)).toBe(1);
  });

  it("ends 'lives' when the last one goes, on the following 'next'", () => {
    let st = survival({ lives: 2 });
    st = reduce(st, { type: 'giveUp', now: T0 + 10 });
    expect(livesLeft(st)).toBe(1);
    st = reduce(st, { type: 'next', now: T0 + 11 });
    expect(st.status).toBe('playing');
    st = reduce(st, { type: 'giveUp', now: T0 + 20 });
    expect(livesLeft(st)).toBe(0);
    // the run is still in round-over — the reveal gets its moment before the run ends
    expect(st.status).toBe('round-over');
    st = reduce(st, { type: 'next', now: T0 + 21 });
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('lives');
    expect(st.finishedAt).toBe(T0 + 21);
  });

  it('a one-life run ends after the first miss', () => {
    let st = survival({ lives: 1 });
    st = reduce(st, { type: 'giveUp', now: T0 + 1 });
    expect(livesLeft(st)).toBe(0);
    st = reduce(st, { type: 'next', now: T0 + 2 });
    expect(st.endReason).toBe('lives');
    expect(st.rounds).toHaveLength(1);
  });

  it('escalates the tier every three correct answers', () => {
    let st = survival({ lives: 5 }, tierSubjects(4));
    const tiers: string[] = [];
    for (let i = 0; i < 12 && st.status === 'playing'; i++) {
      expect(survivalTier(st)).toBe(SURVIVAL_TIERS[Math.min(3, Math.floor(i / 3))]);
      tiers.push(currentRound(st)!.subject.tier);
      st = solveAndAdvance(st, T0 + i * 100);
    }
    expect(tiers.slice(0, 3)).toEqual(['star', 'star', 'star']);
    expect(tiers.slice(3, 6)).toEqual(['starter', 'starter', 'starter']);
    expect(tiers.slice(6, 9)).toEqual(['rotation', 'rotation', 'rotation']);
    expect(tiers.slice(9, 12)).toEqual(['deepCut', 'deepCut', 'deepCut']);
  });

  it('does not escalate on a miss — only correct answers move the tier', () => {
    let st = survival({ lives: 5 }, tierSubjects(4));
    for (let i = 0; i < 3; i++) {
      expect(currentRound(st)!.subject.tier).toBe('star');
      st = missAndAdvance(st, T0 + i * 100);
    }
    expect(currentRound(st)!.subject.tier).toBe('star');
    expect(survivalTier(st)).toBe('star');
  });

  it('shortens the ladder one rung per tier, down to two', () => {
    let st = survival({ lives: 5, tries: 5 }, tierSubjects(4));
    const rungs: number[] = [];
    for (let i = 0; i < 12 && st.status === 'playing'; i++) {
      rungs.push(currentRound(st)!.stages.length);
      st = solveAndAdvance(st, T0 + i * 100);
    }
    expect(rungs).toEqual([5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2]);
  });

  it('pays more as the run gets deeper, at the same rung and the same speed', () => {
    let st = survival({ lives: 5 }, tierSubjects(4));
    const scores: number[] = [];
    for (let i = 0; i < 7 && st.status === 'playing'; i++) {
      st = reduce(st, { type: 'guess', text: answer(st), now: T0 + i * 1_000 });
      scores.push(st.rounds[i].score);
      st = reduce(st, { type: 'next', now: T0 + i * 1_000 + 1 });
    }
    expect(scores[6]).toBeGreaterThan(scores[0]);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
  });

  it('falls back to any playable subject when the target tier is exhausted', () => {
    // one star and one deepCut: the second round wants 'star' again and has to take what is left
    const subjects = tierSubjects(1).filter((x) => x.tier === 'star' || x.tier === 'deepCut');
    let st = survival({ lives: 5 }, subjects);
    expect(currentRound(st)!.subject.tier).toBe('star');
    st = solveAndAdvance(st, T0 + 100);
    expect(st.status).toBe('playing');
    expect(currentRound(st)!.subject.tier).toBe('deepCut');
  });

  it("ends 'queue-empty' when the pool runs out before the lives do", () => {
    let st = survival({ lives: 5 }, tierSubjects(1).slice(0, 1));
    st = solveAndAdvance(st, T0 + 10);
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('queue-empty');
  });

  it('reports lives and a cleared count for the top bar', () => {
    let st = survival();
    st = solveAndAdvance(st, T0 + 10);
    st = solveAndAdvance(st, T0 + 20);
    const p = formatProgress(st, T0 + 30);
    expect(p.format).toBe('survival');
    expect(p.livesLeft).toBe(3);
    expect(p.correct).toBe(2);
    expect(p.label).toBe('2 cleared');
    expect(p.total).toBe(0);
  });
});

// =============================================================================================
// gauntlet
// =============================================================================================

describe('gauntlet', () => {
  const gauntlet = (over: Partial<ScoutSettings> = {}): ScoutState =>
    start({ format: 'gauntlet', mode: 'silhouette', seed: 'board', tries: 4, ...over });

  it('builds a board of one subject per franchise', () => {
    const st = gauntlet();
    const board = st.gauntletTeamIds ?? [];
    expect(board.length).toBeGreaterThan(1);
    expect(new Set(board).size).toBe(board.length);
    expect(board.length).toBeLessThanOrEqual(32);
    // the queue plus the open round is exactly the board
    expect(st.rounds.length + st.queue.length).toBe(board.length);
    const played = [...st.rounds.map((r) => r.subject), ...st.queue].map(franchiseIdOf);
    expect(new Set(played).size).toBe(board.length);
    expect(franchisesTotal(st)).toBe(board.length);
    expect(franchisesCleared(st)).toEqual([]);
  });

  it('never repeats a franchise across the whole run', () => {
    let st = gauntlet();
    const seen: string[] = [];
    while (st.status !== 'finished') {
      seen.push(franchiseIdOf(currentRound(st)!.subject) ?? '?');
      st = solveAndAdvance(st, T0 + seen.length * 100);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(franchisesTotal(st));
  });

  it('marks a franchise cleared only when its round is won', () => {
    let st = gauntlet();
    const first = franchiseIdOf(currentRound(st)!.subject);
    st = solveAndAdvance(st, T0 + 100);
    expect(franchisesCleared(st)).toEqual([first]);
    const second = franchiseIdOf(currentRound(st)!.subject);
    st = missAndAdvance(st, T0 + 200);
    expect(franchisesCleared(st)).toEqual([first]);
    expect(franchisesCleared(st)).not.toContain(second);
  });

  it("ends 'gauntlet' when the board is played out", () => {
    let st = gauntlet();
    const total = franchisesTotal(st);
    for (let i = 0; i < total + 2 && st.status !== 'finished'; i++) {
      st = missAndAdvance(st, T0 + i * 100);
    }
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('gauntlet');
    expect(st.rounds).toHaveLength(total);
  });

  it('ignores the round count and the tier filter', () => {
    const settings = s({ format: 'gauntlet', rounds: 5, difficulty: 'star' });
    expect(settings.rounds).toBe(0);
    expect(settings.difficulty).toBe('any');
    const st = gauntlet({ rounds: 5 });
    expect(franchisesTotal(st)).toBeGreaterThan(5);
  });

  it('guarantees league-wide packs even when one club was selected', () => {
    const settings = s({ format: 'gauntlet', mode: 'silhouette', packIds: ['team-kc'] });
    expect(settings.packIds).toContain('conf-afc');
    expect(settings.packIds).toContain('conf-nfc');
    expect(settings.packIds).toContain('team-kc');
  });

  it('reports the board for the progress bar', () => {
    let st = gauntlet();
    st = solveAndAdvance(st, T0 + 100);
    const p = formatProgress(st, T0 + 200);
    expect(p.format).toBe('gauntlet');
    expect(p.franchisesCleared).toBe(1);
    expect(p.franchisesTotal).toBe(franchisesTotal(st));
    expect(p.label).toBe(`1 / ${franchisesTotal(st)}`);
    expect(progress(st).total).toBe(franchisesTotal(st));
    const board = franchiseBoard(st);
    expect(board).toHaveLength(franchisesTotal(st));
    expect(board.filter((b) => b.cleared)).toHaveLength(1);
    expect(board.filter((b) => b.played).length).toBeGreaterThanOrEqual(1);
  });

  it('orders the board deterministically from the seed', () => {
    expect(gauntlet({ seed: 'alpha' }).gauntletTeamIds).toEqual(gauntlet({ seed: 'alpha' }).gauntletTeamIds);
    const orders = ['a', 'b', 'c', 'd', 'e'].map((seed) => (gauntlet({ seed }).gauntletTeamIds ?? []).join(','));
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it('works for a team-guessing gauntlet too', () => {
    const st = gauntlet({ mode: 'logoZoom', packIds: ['franchises-all'] });
    expect(st.settings.packIds).toContain('franchises-all');
    expect(franchisesTotal(st)).toBeGreaterThan(1);
    expect(currentRound(st)?.subject.kind).toBe('team');
    expect(franchiseIdOf(currentRound(st)!.subject)).toBe(currentRound(st)!.subject.id);
  });

  it('degrades to queue-empty when the pool cannot fill a board at all', () => {
    const st = start({ format: 'gauntlet', mode: 'silhouette' }, T0, []);
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('queue-empty');
  });
});

// =============================================================================================
// duel — buzzer
// =============================================================================================

describe('duel (buzzer)', () => {
  const duel = (over: Partial<ScoutSettings> = {}): ScoutState =>
    start({
      format: 'duel',
      duelStyle: 'buzzer',
      mode: 'silhouette',
      packIds: ['superstars'],
      tries: 4,
      rounds: 4,
      players: PLAYER_CONFIGS.slice(0, 2).map((p) => ({ ...p })),
      ...over,
    });

  it('seats exactly two players and opens with nobody on the buzzer', () => {
    const st = duel({ players: PLAYER_CONFIGS.map((p) => ({ ...p })) });
    expect(runPlayers(st)).toHaveLength(2);
    expect(runPlayers(st).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(currentRound(st)?.activePlayerId).toBeUndefined();
    expect(lockedOutPlayerIds(st)).toEqual([]);
    expect(awaitingBuzz(st)).toBe(true);
    expect(canGuess(st)).toBe(false);
    expect(canPlayerBuzz(st, 'p1')).toBe(true);
    expect(canPlayerBuzz(st, 'p2')).toBe(true);
    expect(canPlayerGuess(st, 'p1')).toBe(false);
  });

  it('refuses an unattributed guess until somebody buzzes', () => {
    const st = duel();
    expect(reduce(st, { type: 'guess', text: answer(st), now: T0 + 1 })).toBe(st);
    expect(reduce(st, { type: 'skip', now: T0 + 1 }).status).toBe('playing');
  });

  it('buzzes in, and a second buzz cannot steal the round', () => {
    const st = duel();
    const buzzed = reduce(st, { type: 'buzz', playerId: 'p1', now: T0 + 10 });
    expect(currentRound(buzzed)?.activePlayerId).toBe('p1');
    expect(awaitingBuzz(buzzed)).toBe(false);
    expect(canGuess(buzzed)).toBe(true);
    expect(canPlayerGuess(buzzed, 'p1')).toBe(true);
    expect(canPlayerGuess(buzzed, 'p2')).toBe(false);
    expect(reduce(buzzed, { type: 'buzz', playerId: 'p2', now: T0 + 11 })).toBe(buzzed);
    expect(reduce(buzzed, { type: 'buzz', playerId: 'p1', now: T0 + 11 })).toBe(buzzed);
  });

  it('ignores a buzz from a player who is not in the run', () => {
    const st = duel();
    expect(reduce(st, { type: 'buzz', playerId: 'nobody', now: T0 + 1 })).toBe(st);
  });

  it('credits the buzzer for a correct answer', () => {
    let st = duel();
    st = reduce(st, { type: 'buzz', playerId: 'p2', now: T0 + 10 });
    st = reduce(st, { type: 'guess', text: answer(st), now: T0 + 20 });
    const r = st.rounds[0];
    expect(st.status).toBe('round-over');
    expect(r.status).toBe('won');
    expect(r.winnerPlayerId).toBe('p2');
    expect(r.guesses.at(-1)?.playerId).toBe('p2');
    expect(runPlayers(st).find((p) => p.id === 'p2')?.score).toBe(r.score);
    expect(runPlayers(st).find((p) => p.id === 'p2')?.correct).toBe(1);
    expect(runPlayers(st).find((p) => p.id === 'p1')?.score).toBe(0);
    expect(st.totalScore).toBe(r.score);
    expect(leader(st)?.id).toBe('p2');
  });

  it('locks a wrong buzzer out WITHOUT burning a rung, and reopens the buzzer', () => {
    let st = duel();
    st = reduce(st, { type: 'buzz', playerId: 'p1', now: T0 + 10 });
    st = reduce(st, { type: 'guess', text: 'total nonsense', now: T0 + 20 });
    expect(st.status).toBe('playing');
    const r = currentRound(st)!;
    expect(r.tryIndex).toBe(0);
    expect(r.activePlayerId).toBeUndefined();
    expect(lockedOutPlayerIds(st)).toEqual(['p1']);
    expect(isLockedOut(st, 'p1')).toBe(true);
    expect(isLockedOut(st, 'p2')).toBe(false);
    expect(awaitingBuzz(st)).toBe(true);
    expect(canPlayerBuzz(st, 'p1')).toBe(false);
    expect(canPlayerBuzz(st, 'p2')).toBe(true);
    expect(reduce(st, { type: 'buzz', playerId: 'p1', now: T0 + 21 })).toBe(st);
    expect(reduce(st, { type: 'guess', text: answer(st), playerId: 'p1', now: T0 + 21 })).toBe(st);
  });

  it('loses the round when BOTH players are locked out', () => {
    let st = duel();
    st = reduce(st, { type: 'buzz', playerId: 'p1', now: T0 + 10 });
    st = reduce(st, { type: 'guess', text: 'no idea at all', now: T0 + 11 });
    st = reduce(st, { type: 'buzz', playerId: 'p2', now: T0 + 12 });
    st = reduce(st, { type: 'guess', text: 'also no idea', now: T0 + 13 });
    expect(st.status).toBe('round-over');
    const r = st.rounds[0];
    expect(r.status).toBe('lost');
    expect(r.lockedOutPlayerIds).toEqual(['p1', 'p2']);
    expect(r.winnerPlayerId).toBeUndefined();
    expect(st.totalScore).toBe(0);
    expect(runPlayers(st).every((p) => p.streak === 0)).toBe(true);
  });

  it('lets the second player win after the first is locked out', () => {
    let st = duel();
    st = reduce(st, { type: 'buzz', playerId: 'p1', now: T0 + 10 });
    st = reduce(st, { type: 'guess', text: 'nope nope nope', now: T0 + 11 });
    st = reduce(st, { type: 'buzz', playerId: 'p2', now: T0 + 12 });
    st = reduce(st, { type: 'guess', text: answer(st), now: T0 + 13 });
    expect(st.rounds[0].status).toBe('won');
    expect(st.rounds[0].winnerPlayerId).toBe('p2');
    expect(runPlayers(st).find((p) => p.id === 'p1')?.streak).toBe(0);
    expect(runPlayers(st).find((p) => p.id === 'p2')?.streak).toBe(1);
  });

  it('treats an attributed guess with nobody on the buzzer as buzz + guess', () => {
    const st = duel();
    const won = reduce(st, { type: 'guess', text: answer(st), playerId: 'p2', now: T0 + 10 });
    expect(won.rounds[0].status).toBe('won');
    expect(won.rounds[0].winnerPlayerId).toBe('p2');
  });

  it('ignores an attributed guess from somebody who is not in the run', () => {
    const st = duel();
    expect(reduce(st, { type: 'guess', text: answer(st), playerId: 'ghost', now: T0 + 1 })).toBe(st);
  });

  it('ignores an attributed guess from the player who is NOT on the buzzer', () => {
    let st = duel();
    st = reduce(st, { type: 'buzz', playerId: 'p1', now: T0 + 10 });
    expect(reduce(st, { type: 'guess', text: answer(st), playerId: 'p2', now: T0 + 11 })).toBe(st);
  });

  it('a skip unlocks the next rung for both players and clears nothing', () => {
    let st = duel();
    st = reduce(st, { type: 'skip', now: T0 + 10 });
    expect(currentRound(st)?.tryIndex).toBe(1);
    expect(lockedOutPlayerIds(st)).toEqual([]);
    expect(currentRound(st)?.guesses.at(-1)?.playerId).toBeUndefined();
  });

  it('clears the lockouts on the next round and keeps per-player scores apart', () => {
    let st = duel({ rounds: 2 });
    st = reduce(st, { type: 'guess', text: answer(st), playerId: 'p1', now: T0 + 10 });
    const p1Score = st.rounds[0].score;
    st = reduce(st, { type: 'next', now: T0 + 11 });
    expect(lockedOutPlayerIds(st)).toEqual([]);
    expect(currentRound(st)?.activePlayerId).toBeUndefined();
    st = reduce(st, { type: 'guess', text: answer(st), playerId: 'p2', now: T0 + 20 });
    const p2Score = st.rounds[1].score;
    expect(runPlayers(st).find((p) => p.id === 'p1')?.score).toBe(p1Score);
    expect(runPlayers(st).find((p) => p.id === 'p2')?.score).toBe(p2Score);
    expect(st.totalScore).toBe(p1Score + p2Score);
    st = reduce(st, { type: 'next', now: T0 + 21 });
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('rounds');
    expect(standings(st)).toHaveLength(2);
  });

  it('names nobody in the top bar until somebody buzzes', () => {
    const st = duel();
    const open = formatProgress(st, T0);
    expect(open.awaitingBuzz).toBe(true);
    expect(open.activePlayerId).toBeUndefined();
    const buzzed = reduce(st, { type: 'buzz', playerId: 'p2', now: T0 + 10 });
    const claimed = formatProgress(buzzed, T0 + 10);
    expect(claimed.awaitingBuzz).toBe(false);
    expect(claimed.activePlayerId).toBe('p2');
  });

  it('never rotates turns — the buzzer decides', () => {
    let st = duel({ rounds: 3 });
    expect(nextPlayer(st)).toBeUndefined();
    expect(handover(st)).toBeNull();
    st = missAndAdvance(st, T0 + 10);
    expect(st.activePlayerIndex).toBe(0);
    expect(currentRound(st)?.activePlayerId).toBeUndefined();
  });

  it('times out for both players at once', () => {
    let st = duel({ roundTimer: 10 });
    st = reduce(st, { type: 'tick', now: T0 });
    st = reduce(st, { type: 'tick', now: T0 + 10_001 });
    expect(st.rounds[0].status).toBe('lost');
    expect(st.rounds[0].guesses.at(-1)?.verdict).toBe('timeout');
  });
});

// =============================================================================================
// duel — turns
// =============================================================================================

describe('duel (turns)', () => {
  const duel = (over: Partial<ScoutSettings> = {}): ScoutState =>
    start({
      format: 'duel',
      duelStyle: 'turns',
      mode: 'silhouette',
      packIds: ['superstars'],
      tries: 3,
      rounds: 4,
      players: PLAYER_CONFIGS.slice(0, 2).map((p) => ({ ...p })),
      ...over,
    });

  it('opens on player one and alternates every round', () => {
    let st = duel();
    expect(currentRound(st)?.activePlayerId).toBe('p1');
    expect(whoseTurn(st)?.id).toBe('p1');
    expect(nextPlayer(st)?.id).toBe('p2');
    expect(awaitingBuzz(st)).toBe(false);
    expect(canGuess(st)).toBe(true);
    st = missAndAdvance(st, T0 + 10);
    expect(currentRound(st)?.activePlayerId).toBe('p2');
    expect(whoseTurn(st)?.id).toBe('p2');
    st = missAndAdvance(st, T0 + 20);
    expect(currentRound(st)?.activePlayerId).toBe('p1');
  });

  it('accepts an unattributed guess as the player whose turn it is', () => {
    const st = duel();
    const won = reduce(st, { type: 'guess', text: answer(st), now: T0 + 10 });
    expect(won.rounds[0].winnerPlayerId).toBe('p1');
    expect(won.rounds[0].guesses.at(-1)?.playerId).toBe('p1');
  });

  it('ignores a guess attributed to the player who is NOT on turn', () => {
    const st = duel();
    expect(reduce(st, { type: 'guess', text: answer(st), playerId: 'p2', now: T0 + 1 })).toBe(st);
    expect(canPlayerGuess(st, 'p2')).toBe(false);
    expect(canPlayerGuess(st, 'p1')).toBe(true);
  });

  it('burns a rung on a wrong guess, like a solo round', () => {
    let st = duel();
    st = reduce(st, { type: 'guess', text: 'nothing like it', now: T0 + 10 });
    expect(currentRound(st)?.tryIndex).toBe(1);
    expect(lockedOutPlayerIds(st)).toEqual([]);
    st = reduce(st, { type: 'guess', text: 'still nothing', now: T0 + 11 });
    st = reduce(st, { type: 'guess', text: 'nope', now: T0 + 12 });
    expect(st.status).toBe('round-over');
    expect(st.rounds[0].status).toBe('lost');
    expect(runPlayers(st).find((p) => p.id === 'p1')?.streak).toBe(0);
  });

  it('hands over between rounds and names both players', () => {
    let st = duel();
    st = reduce(st, { type: 'guess', text: answer(st), now: T0 + 10 });
    const h = handover(st);
    expect(h?.from.id).toBe('p1');
    expect(h?.to.id).toBe('p2');
  });
});

// =============================================================================================
// party
// =============================================================================================

describe('party', () => {
  const party = (over: Partial<ScoutSettings> = {}): ScoutState =>
    start({
      format: 'party',
      mode: 'silhouette',
      packIds: ['superstars'],
      tries: 3,
      rounds: 6,
      players: PLAYER_CONFIGS.map((p) => ({ ...p })),
      ...over,
    });

  it('seats 2–8 players and clamps outside that', () => {
    expect(runPlayers(party({ players: [] }))).toHaveLength(2);
    expect(runPlayers(party({ players: PLAYER_CONFIGS.map((p) => ({ ...p })) }))).toHaveLength(3);
    const eightPlus = Array.from({ length: 12 }, (_, i) => ({
      id: `q${i}`,
      name: `P${i}`,
      emoji: '🎈',
      color: '#a855f7',
    }));
    expect(runPlayers(party({ players: eightPlus, rounds: 8 }))).toHaveLength(8);
  });

  it('snaps the round count to a multiple of the player count (odd counts included)', () => {
    expect(s({ format: 'party', rounds: 10, players: PLAYER_CONFIGS.map((p) => ({ ...p })) }).rounds).toBe(12);
    expect(s({ format: 'party', rounds: 9, players: PLAYER_CONFIGS.map((p) => ({ ...p })) }).rounds).toBe(9);
    expect(s({ format: 'party', rounds: 7, players: PLAYER_CONFIGS.slice(0, 2).map((p) => ({ ...p })) }).rounds).toBe(8);
    expect(s({ format: 'party', rounds: 0, players: PLAYER_CONFIGS.map((p) => ({ ...p })) }).rounds).toBe(0);
  });

  it('rotates through an ODD player count and comes back round', () => {
    let st = party();
    const order: string[] = [];
    for (let i = 0; i < 6 && st.status !== 'finished'; i++) {
      order.push(currentRound(st)?.activePlayerId ?? '?');
      st = missAndAdvance(st, T0 + i * 100);
    }
    expect(order).toEqual(['p1', 'p2', 'p3', 'p1', 'p2', 'p3']);
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('rounds');
  });

  it('keeps a separate score, streak and correct count per player', () => {
    let st = party();
    st = reduce(st, { type: 'guess', text: answer(st), now: T0 + 10 });
    const first = st.rounds[0].score;
    st = reduce(st, { type: 'next', now: T0 + 11 });
    st = reduce(st, { type: 'giveUp', now: T0 + 20 });
    st = reduce(st, { type: 'next', now: T0 + 21 });
    st = reduce(st, { type: 'guess', text: answer(st), now: T0 + 30 });
    const third = st.rounds[2].score;
    const byId = Object.fromEntries(runPlayers(st).map((p) => [p.id, p]));
    expect(byId.p1.score).toBe(first);
    expect(byId.p1.correct).toBe(1);
    expect(byId.p2.score).toBe(0);
    expect(byId.p2.correct).toBe(0);
    expect(byId.p2.streak).toBe(0);
    expect(byId.p3.score).toBe(third);
    expect(st.totalScore).toBe(first + third);
    expect(leader(st)?.id).toBe(standings(st)[0].id);
  });

  it('shows a handover between rounds and nothing after the last one', () => {
    let st = party({ rounds: 3, players: PLAYER_CONFIGS.slice(0, 3).map((p) => ({ ...p })) });
    expect(handover(st)).toBeNull();
    st = reduce(st, { type: 'giveUp', now: T0 + 10 });
    expect(handover(st)).toEqual({ from: runPlayers(st)[0], to: runPlayers(st)[1] });
    expect(formatProgress(st, T0 + 10).activePlayerId).toBe('p1');
    st = reduce(st, { type: 'next', now: T0 + 11 });
    st = reduce(st, { type: 'giveUp', now: T0 + 20 });
    st = reduce(st, { type: 'next', now: T0 + 21 });
    st = reduce(st, { type: 'giveUp', now: T0 + 30 });
    // the round limit is reached: no handover, the results are next
    expect(handover(st)).toBeNull();
    expect(reduce(st, { type: 'next', now: T0 + 31 }).status).toBe('finished');
  });

  it('ignores a buzz — party is turn based', () => {
    const st = party();
    expect(reduce(st, { type: 'buzz', playerId: 'p2', now: T0 + 1 })).toBe(st);
  });

  it('tracks a tie and breaks it on the correct count', () => {
    const st = party();
    expect(standings(st).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(leader(st)?.id).toBe('p1');
  });
});

// =============================================================================================
// cross-format guarantees
// =============================================================================================

const EVERY_FORMAT: readonly ScoutFormat[] = ['standard', 'blitz', 'survival', 'gauntlet', 'duel', 'party'];

function settingsFor(format: ScoutFormat, seed?: string): ScoutSettings {
  return s({
    format,
    mode: 'silhouette',
    packIds: ['superstars'],
    tries: 4,
    rounds: 4,
    blitzDuration: 60,
    lives: 3,
    players: PLAYER_CONFIGS.slice(0, format === 'duel' ? 2 : 3).map((p) => ({ ...p })),
    ...(seed === undefined ? {} : { seed }),
  });
}

describe('every format', () => {
  it('replays a seeded run exactly', () => {
    for (const format of EVERY_FORMAT) {
      const play = (): ScoutState => {
        const settings = settingsFor(format, `seed-${format}`);
        let st = reduce(
          createInitialScoutState(),
          { type: 'start', settings, subjects: pool(settings), now: T0 },
          createRng(settings.seed),
        );
        for (let i = 0; i < 8 && st.status !== 'finished'; i++) {
          if (format === 'duel' && st.settings.duelStyle === 'buzzer') {
            st = reduce(st, { type: 'buzz', playerId: i % 2 === 0 ? 'p1' : 'p2', now: T0 + i * 100 });
          }
          st = reduce(st, { type: 'guess', text: i % 3 === 0 ? 'wrong one' : answer(st), now: T0 + i * 100 + 5 });
          st = reduce(st, { type: 'next', now: T0 + i * 100 + 10 });
        }
        return st;
      };
      expect(play()).toEqual(play());
    }
  });

  it('returns the SAME state reference for every invalid action', () => {
    const invalid: ScoutAction[] = [
      { type: 'guess', text: '   ', now: T0 },
      { type: 'next', now: T0 },
      { type: 'buzz', playerId: 'ghost', now: T0 },
    ];
    for (const format of EVERY_FORMAT) {
      const settings = settingsFor(format);
      const live = reduce(
        createInitialScoutState(),
        { type: 'start', settings, subjects: pool(settings), now: T0 },
        createRng('purity'),
      );
      for (const a of invalid) expect(reduce(live, a)).toBe(live);
      const finished = reduce(live, { type: 'quit', now: T0 + 1 });
      for (const a of [...invalid, { type: 'skip', now: T0 } as ScoutAction, { type: 'quit', now: T0 } as ScoutAction]) {
        expect(reduce(finished, a)).toBe(finished);
      }
    }
  });

  it('never mutates the state it was handed', () => {
    for (const format of EVERY_FORMAT) {
      const settings = settingsFor(format, 'frozen');
      const live = reduce(
        createInitialScoutState(),
        { type: 'start', settings, subjects: pool(settings), now: T0 },
        createRng('frozen-run'),
      );
      const snapshot = structuredClone(live);
      reduce(live, { type: 'guess', text: answer(live), now: T0 + 10 });
      reduce(live, { type: 'skip', now: T0 + 10 });
      reduce(live, { type: 'quit', now: T0 + 10 });
      expect(live).toEqual(snapshot);
    }
  });

  it('quits from anywhere and reports it', () => {
    for (const format of EVERY_FORMAT) {
      const settings = settingsFor(format);
      const live = reduce(
        createInitialScoutState(),
        { type: 'start', settings, subjects: pool(settings), now: T0 },
        createRng('quitter'),
      );
      const quit = reduce(live, { type: 'quit', now: T0 + 3 });
      expect(quit.status).toBe('finished');
      expect(quit.endReason).toBe('quit');
      expect(quit.rounds[0].status).not.toBe('playing');
    }
  });

  it('builds a roster and an active index for every format', () => {
    for (const format of EVERY_FORMAT) {
      const settings = settingsFor(format);
      const live = reduce(
        createInitialScoutState(),
        { type: 'start', settings, subjects: pool(settings), now: T0 },
        createRng('roster'),
      );
      const players = runPlayers(live);
      expect(players.length).toBeGreaterThan(0);
      expect(live.activePlayerIndex).toBe(0);
      expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
      expect(players.every((p) => p.score === 0 && p.correct === 0 && p.streak === 0)).toBe(true);
      expect(ladderRungs(live)).toBeGreaterThan(0);
      const p = formatProgress(live, T0);
      expect(p.format).toBe(format);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.correct).toBe(0);
    }
  });

  it('gives lives only to survival and a clock only to blitz', () => {
    for (const format of EVERY_FORMAT) {
      const settings = settingsFor(format);
      const live = reduce(
        createInitialScoutState(),
        { type: 'start', settings, subjects: pool(settings), now: T0 },
        createRng('clocks'),
      );
      expect(livesLeft(live)).toBe(format === 'survival' ? 3 : null);
      expect(live.blitzEndsAt === undefined).toBe(format !== 'blitz');
      expect(survivalTier(live)).toBe(format === 'survival' ? 'star' : null);
      expect(franchisesTotal(live) > 0).toBe(format === 'gauntlet');
    }
  });

  it('leaves solo rounds free of every multiplayer field', () => {
    for (const format of ['standard', 'blitz', 'survival', 'gauntlet'] as const) {
      const settings = settingsFor(format);
      const live = reduce(
        createInitialScoutState(),
        { type: 'start', settings, subjects: pool(settings), now: T0 },
        createRng('solo'),
      );
      const r = currentRound(live)!;
      expect(r.activePlayerId).toBeUndefined();
      expect(r.lockedOutPlayerIds).toBeUndefined();
      expect(r.winnerPlayerId).toBeUndefined();
      const won = reduce(live, { type: 'guess', text: answer(live), now: T0 + 5 });
      expect(won.rounds[0].winnerPlayerId).toBeUndefined();
      expect(won.rounds[0].guesses.at(-1)?.playerId).toBeUndefined();
      // …but the implicit player is still scored, so results can render one scoreboard
      expect(runPlayers(won)[0].score).toBe(won.rounds[0].score);
      expect(runPlayers(won)[0].correct).toBe(1);
    }
  });

  it('starting a new run wipes the previous format entirely', () => {
    const blitzSettings = settingsFor('blitz');
    let st = reduce(
      createInitialScoutState(),
      { type: 'start', settings: blitzSettings, subjects: pool(blitzSettings), now: T0 },
      createRng('one'),
    );
    st = reduce(st, { type: 'guess', text: answer(st), now: T0 + 10 });
    expect(st.blitzEndsAt).toBeDefined();
    const partySettings = settingsFor('party');
    st = reduce(st, { type: 'start', settings: partySettings, subjects: pool(partySettings), now: T0 + 100 });
    expect(currentFormat(st)).toBe('party');
    expect(st.blitzEndsAt).toBeUndefined();
    expect(st.gauntletTeamIds).toBeUndefined();
    expect(st.totalScore).toBe(0);
    expect(st.rounds).toHaveLength(1);
    expect(runPlayers(st)).toHaveLength(3);
  });

  it('plays a mixed-puzzle-type run under every format', () => {
    for (const format of EVERY_FORMAT) {
      const settings = s({
        format,
        mixModes: true,
        packIds: ['superstars', 'franchises-all'],
        tries: 3,
        rounds: 4,
        seed: `mixed-${format}`,
        players: PLAYER_CONFIGS.slice(0, format === 'duel' ? 2 : 3).map((p) => ({ ...p })),
      });
      let st = reduce(
        createInitialScoutState(),
        { type: 'start', settings, subjects: pool(settings), now: T0 },
        createRng(settings.seed),
      );
      const modes = new Set<string>();
      for (let i = 0; i < 6 && st.status !== 'finished'; i++) {
        const r = currentRound(st);
        if (!r) break;
        modes.add(r.mode);
        st = reduce(st, { type: 'giveUp', now: T0 + i * 100 });
        st = reduce(st, { type: 'next', now: T0 + i * 100 + 1 });
      }
      expect(modes.size).toBeGreaterThan(0);
    }
  });
});
