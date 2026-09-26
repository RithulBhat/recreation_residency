import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { createInitialScoutState, hasSeenRound, modeForSubject, reduce, roundSeenAt, runPool } from './engine';
import { normalizeScoutSettings } from './presets';
import { buildPool, buildPlayerSubject, buildTeamSubject, canRender } from './subjects';
import { activeModes } from './subjects';
import { fixtureBundle, findFixturePlayer, findFixtureTeam, makePlayer } from './fixtures';
import { canGuess, currentRound, currentStage, progress, timeLeftMs, triesLeft } from './selectors';
import type { ScoutSettings, ScoutState, ScoutSubject } from './types';

const T0 = 1_000_000;

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

describe('createInitialScoutState', () => {
  it('is idle and empty', () => {
    const st = createInitialScoutState();
    expect(st.status).toBe('idle');
    expect(st.rounds).toEqual([]);
    expect(st.queue).toEqual([]);
    expect(st.totalScore).toBe(0);
    expect(st.streak).toBe(0);
    expect(st.id).toBe('');
  });

  it('ignores every action but start', () => {
    const st = createInitialScoutState();
    for (const action of [
      { type: 'guess', text: 'mahomes', now: T0 },
      { type: 'skip', now: T0 },
      { type: 'giveUp', now: T0 },
      { type: 'timeout', now: T0 },
      { type: 'next', now: T0 },
      { type: 'tick', now: T0 },
      { type: 'quit', now: T0 },
    ] as const) {
      expect(reduce(st, action)).toBe(st);
    }
  });
});

describe('start', () => {
  it('opens round 0 with a full ladder', () => {
    const st = start({ tries: 5 });
    expect(st.status).toBe('playing');
    expect(st.id).not.toBe('');
    expect(st.rounds).toHaveLength(1);
    expect(st.currentRound).toBe(0);
    const r = currentRound(st);
    expect(r?.status).toBe('playing');
    expect(r?.tryIndex).toBe(0);
    expect(r?.stages).toHaveLength(5);
    expect(r?.mode).toBe('silhouette');
    expect(r?.startedAt).toBe(T0);
    expect(st.startedAt).toBe(T0);
    expect(st.queue.length).toBeGreaterThan(0);
  });

  it('normalizes the settings it was handed', () => {
    const st = reduce(
      createInitialScoutState(),
      { type: 'start', settings: { tries: 99, rounds: -5 } as ScoutSettings, subjects: pool(s()), now: T0 },
      createRng('r'),
    );
    expect(st.settings.tries).toBe(6);
    expect(st.settings.rounds).toBe(0);
  });

  it('dedupes subjects', () => {
    const settings = s();
    const p = pool(settings);
    const st = start({}, T0, [...p, ...p]);
    expect(st.rounds.length + st.queue.length).toBe(p.length);
  });

  it('finishes immediately with an empty pool', () => {
    const st = start({}, T0, []);
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('queue-empty');
  });

  it('skips subjects the mode cannot render and plays the next one', () => {
    const noShot = buildPlayerSubject(makePlayer({ id: 'ghost', name: 'Ghost Man', headshot: '' }), findFixtureTeam('KC'));
    const ok = buildPlayerSubject(findFixturePlayer('Patrick Mahomes'), findFixtureTeam('KC'));
    const st = start({ mode: 'silhouette', seed: undefined }, T0, [noShot, ok]);
    expect(st.status).toBe('playing');
    expect(currentRound(st)?.subject.id).toBe(ok.id);
  });

  it('finishes when nothing in the pool can be rendered', () => {
    const noShot = buildPlayerSubject(makePlayer({ id: 'ghost', headshot: '' }), findFixtureTeam('KC'));
    const st = start({ mode: 'silhouette' }, T0, [noShot]);
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('queue-empty');
  });

  it('restarts from any status', () => {
    const finished = reduce(start(), { type: 'quit', now: T0 + 1 });
    expect(finished.status).toBe('finished');
    const again = reduce(finished, { type: 'start', settings: s(), subjects: pool(s()), now: T0 + 2 }, createRng('r2'));
    expect(again.status).toBe('playing');
    expect(again.rounds).toHaveLength(1);
    expect(again.totalScore).toBe(0);
  });
});

describe('guess', () => {
  it('wins the round and scores it', () => {
    const st = start({ tries: 5 });
    const next = reduce(st, { type: 'guess', text: answer(st), now: T0 + 2000 });
    const r = currentRound(next);
    expect(next.status).toBe('round-over');
    expect(r?.status).toBe('won');
    expect(r?.score).toBeGreaterThan(0);
    expect(r?.endedAt).toBe(T0 + 2000);
    expect(r?.guesses.at(-1)?.verdict).toBe('correct');
    expect(next.totalScore).toBe(r?.score);
    expect(next.streak).toBe(1);
    expect(next.bestStreak).toBe(1);
  });

  it('pays more for an earlier rung', () => {
    const st = start({ tries: 5 });
    const early = reduce(st, { type: 'guess', text: answer(st), now: T0 });
    const skipped = reduce(reduce(st, { type: 'skip', now: T0 }), { type: 'skip', now: T0 });
    const late = reduce(skipped, { type: 'guess', text: answer(st), now: T0 });
    expect(currentRound(early)?.score).toBeGreaterThan(currentRound(late)?.score ?? Infinity);
  });

  it('records a close guess, consumes a try and keeps playing', () => {
    // the pool holds both Jeffersons, so the bare surname is ambiguous → close
    const justin = buildPlayerSubject(findFixturePlayer('Justin Jefferson'), findFixtureTeam('MIN'));
    const van = buildPlayerSubject(findFixturePlayer('Van Jefferson'), findFixtureTeam('SEA'));
    const st = start({ tries: 4 }, T0, [justin, van]);
    const target = currentRound(st)?.subject.name;
    const next = reduce(st, { type: 'guess', text: 'jefferson', now: T0 + 500 });
    expect(next.status).toBe('playing');
    const r = currentRound(next);
    expect(r?.guesses.at(-1)?.verdict).toBe('close');
    expect(r?.guesses.at(-1)?.tryIndex).toBe(0);
    expect(r?.tryIndex).toBe(1);
    expect(r?.status).toBe('playing');
    expect(target).toContain('Jefferson');
  });

  it('consumes a try on a wrong guess and loses on the last one', () => {
    const st = start({ tries: 2 });
    const one = reduce(st, { type: 'guess', text: 'definitely not him', now: T0 + 1 });
    expect(one.status).toBe('playing');
    expect(currentRound(one)?.tryIndex).toBe(1);
    const two = reduce(one, { type: 'guess', text: 'still not him', now: T0 + 2 });
    expect(two.status).toBe('round-over');
    expect(currentRound(two)?.status).toBe('lost');
    expect(currentRound(two)?.guesses).toHaveLength(2);
    expect(two.totalScore).toBe(0);
  });

  it('resets the streak on a lost round', () => {
    let st = start({ tries: 1, rounds: 0 });
    st = reduce(st, { type: 'guess', text: answer(st), now: T0 });
    expect(st.streak).toBe(1);
    st = reduce(st, { type: 'next', now: T0 + 1 });
    st = reduce(st, { type: 'guess', text: 'nope nope', now: T0 + 2 });
    expect(st.streak).toBe(0);
    expect(st.bestStreak).toBe(1);
  });

  it('is a no-op for empty text or when no round is live', () => {
    const st = start();
    expect(reduce(st, { type: 'guess', text: '', now: T0 })).toBe(st);
    expect(reduce(st, { type: 'guess', text: '   ', now: T0 })).toBe(st);
    const over = reduce(st, { type: 'guess', text: answer(st), now: T0 });
    expect(reduce(over, { type: 'guess', text: answer(st), now: T0 + 1 })).toBe(over);
  });

  it('accepts a surname, an alias and the initial form', () => {
    const cmc = buildPlayerSubject(findFixturePlayer('Christian McCaffrey'), findFixtureTeam('SF'));
    for (const guess of ['mccaffrey', 'cmc', 'c mccaffrey', 'Christian McCaffrey']) {
      const st = start({ tries: 3 }, T0, [cmc]);
      const next = reduce(st, { type: 'guess', text: guess, now: T0 + 1 });
      expect(currentRound(next)?.status).toBe('won');
    }
  });

  it('accepts team guesses in team modes', () => {
    const kc = buildTeamSubject(findFixtureTeam('KC'));
    for (const guess of ['chiefs', 'kc', 'kansas city chiefs']) {
      const st = start({ mode: 'teamTrivia', packIds: ['franchises-all'], tries: 3 }, T0, [kc]);
      const next = reduce(st, { type: 'guess', text: guess, now: T0 + 1 });
      expect(currentRound(next)?.status).toBe('won');
    }
  });
});

describe('skip', () => {
  it('consumes a try, unlocks the next rung and records a skip', () => {
    const st = start({ tries: 5 });
    const before = currentStage(st);
    const next = reduce(st, { type: 'skip', now: T0 + 10 });
    expect(next.status).toBe('playing');
    expect(currentRound(next)?.tryIndex).toBe(1);
    expect(currentRound(next)?.guesses.at(-1)).toMatchObject({ verdict: 'skipped', text: '', tryIndex: 0 });
    const after = currentStage(next);
    expect(after?.visual).toBeGreaterThan(before?.visual ?? 1);
    expect(after?.clues.length).toBeGreaterThan(before?.clues.length ?? 99);
  });

  it('loses the round on the last try', () => {
    let st = start({ tries: 2 });
    st = reduce(st, { type: 'skip', now: T0 + 1 });
    st = reduce(st, { type: 'skip', now: T0 + 2 });
    expect(st.status).toBe('round-over');
    expect(currentRound(st)?.status).toBe('lost');
  });

  it('is a no-op once the round is over', () => {
    const st = start();
    const over = reduce(st, { type: 'giveUp', now: T0 + 1 });
    expect(reduce(over, { type: 'skip', now: T0 + 2 })).toBe(over);
  });
});

describe('giveUp and timeout', () => {
  it('giveUp loses immediately', () => {
    const st = reduce(start({ tries: 6 }), { type: 'giveUp', now: T0 + 5 });
    expect(st.status).toBe('round-over');
    expect(currentRound(st)?.status).toBe('lost');
    expect(currentRound(st)?.guesses.at(-1)?.verdict).toBe('skipped');
    expect(currentRound(st)?.endedAt).toBe(T0 + 5);
    expect(st.streak).toBe(0);
  });

  it('timeout loses with its own verdict', () => {
    const st = reduce(start({ tries: 6 }), { type: 'timeout', now: T0 + 7 });
    expect(currentRound(st)?.status).toBe('lost');
    expect(currentRound(st)?.guesses.at(-1)?.verdict).toBe('timeout');
  });

  it('both are no-ops when nothing is live', () => {
    const st = createInitialScoutState();
    expect(reduce(st, { type: 'giveUp', now: T0 })).toBe(st);
    expect(reduce(st, { type: 'timeout', now: T0 })).toBe(st);
  });
});

describe('next', () => {
  it('opens the following round', () => {
    let st = start({ rounds: 3 });
    const first = currentRound(st)?.subject.id;
    st = reduce(st, { type: 'giveUp', now: T0 + 1 });
    st = reduce(st, { type: 'next', now: T0 + 2 });
    expect(st.status).toBe('playing');
    expect(st.rounds).toHaveLength(2);
    expect(st.currentRound).toBe(1);
    expect(currentRound(st)?.subject.id).not.toBe(first);
    expect(currentRound(st)?.startedAt).toBe(T0 + 2);
  });

  it('finishes when the round limit is reached', () => {
    let st = start({ rounds: 2, tries: 1 });
    st = reduce(st, { type: 'giveUp', now: T0 + 1 });
    st = reduce(st, { type: 'next', now: T0 + 2 });
    st = reduce(st, { type: 'giveUp', now: T0 + 3 });
    st = reduce(st, { type: 'next', now: T0 + 4 });
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('rounds');
    expect(st.finishedAt).toBe(T0 + 4);
    expect(st.rounds).toHaveLength(2);
  });

  it('finishes when the queue runs dry (endless rounds)', () => {
    const one = buildPlayerSubject(findFixturePlayer('Patrick Mahomes'), findFixtureTeam('KC'));
    let st = start({ rounds: 0 }, T0, [one]);
    st = reduce(st, { type: 'giveUp', now: T0 + 1 });
    st = reduce(st, { type: 'next', now: T0 + 2 });
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('queue-empty');
  });

  it('is a no-op while a round is still playing', () => {
    const st = start();
    expect(reduce(st, { type: 'next', now: T0 + 1 })).toBe(st);
  });
});

describe('tick and the round clock', () => {
  it('starts the clock on the first tick, not when the round opened', () => {
    const st = start({ roundTimer: 10 });
    expect(hasSeenRound(currentRound(st)!)).toBe(false);
    // 60 s of image loading must not burn the 10 s round timer
    const late = reduce(st, { type: 'tick', now: T0 + 60_000 });
    expect(late.status).toBe('playing');
    expect(roundSeenAt(currentRound(late)!)).toBe(T0 + 60_000);
    expect(currentRound(late)?.startedAt).toBe(T0 + 60_000);
    expect(timeLeftMs(late, T0 + 60_000)).toBe(10_000);
  });

  it('times out once the clock has actually run', () => {
    let st = start({ roundTimer: 10 });
    st = reduce(st, { type: 'tick', now: T0 });
    expect(reduce(st, { type: 'tick', now: T0 + 9_000 }).status).toBe('playing');
    const out = reduce(st, { type: 'tick', now: T0 + 10_001 });
    expect(out.status).toBe('round-over');
    expect(currentRound(out)?.status).toBe('lost');
    expect(currentRound(out)?.guesses.at(-1)?.verdict).toBe('timeout');
  });

  it('never times out with the timer off', () => {
    let st = start({ roundTimer: 0 });
    st = reduce(st, { type: 'tick', now: T0 });
    expect(reduce(st, { type: 'tick', now: T0 + 10_000_000 })).toBe(st);
    expect(timeLeftMs(st, T0)).toBeNull();
  });

  it('is a no-op outside a live round', () => {
    const st = start();
    const over = reduce(st, { type: 'giveUp', now: T0 + 1 });
    expect(reduce(over, { type: 'tick', now: T0 + 2 })).toBe(over);
    const idle = createInitialScoutState();
    expect(reduce(idle, { type: 'tick', now: T0 })).toBe(idle);
  });

  it('a second tick changes nothing when there is time left', () => {
    let st = start({ roundTimer: 30 });
    st = reduce(st, { type: 'tick', now: T0 });
    expect(reduce(st, { type: 'tick', now: T0 + 1 })).toBe(st);
  });
});

describe('quit', () => {
  it('finishes from playing and marks the live round skipped', () => {
    const st = reduce(start(), { type: 'quit', now: T0 + 3 });
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('quit');
    expect(st.rounds[0].status).toBe('skipped');
    expect(st.rounds[0].endedAt).toBe(T0 + 3);
  });

  it('finishes from round-over without touching the finished round', () => {
    const won = reduce(start(), { type: 'guess', text: answer(start()), now: T0 + 1 });
    const st = reduce(won, { type: 'quit', now: T0 + 2 });
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('quit');
    expect(st.rounds[0].status).toBe(won.rounds[0].status);
  });

  it('is a no-op when already finished', () => {
    const st = reduce(start(), { type: 'quit', now: T0 + 1 });
    expect(reduce(st, { type: 'quit', now: T0 + 2 })).toBe(st);
  });
});

describe('mixModes', () => {
  it('gives each round a mode that its subject can actually render', () => {
    const settings = s({ mixModes: true, packIds: ['superstars', 'franchises-all'], rounds: 0, tries: 3 });
    let st = reduce(
      createInitialScoutState(),
      { type: 'start', settings, subjects: pool(settings), now: T0 },
      createRng('mix'),
    );
    const seen = new Set<string>();
    for (let i = 0; i < 12 && st.status !== 'finished'; i++) {
      const r = currentRound(st);
      if (!r) break;
      expect(canRender(r.mode, r.subject)).toBe(true);
      expect(r.stages).toHaveLength(3);
      seen.add(r.mode);
      st = reduce(st, { type: 'giveUp', now: T0 + i * 10 });
      st = reduce(st, { type: 'next', now: T0 + i * 10 + 1 });
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('modeForSubject is stable and honours mixModes: false', () => {
    const st = start({ mixModes: false, mode: 'silhouette' });
    const subject = currentRound(st)!.subject;
    expect(modeForSubject(st, subject, 0)).toBe('silhouette');
    const mixed: ScoutState = { ...st, settings: { ...st.settings, mixModes: true } };
    const a = modeForSubject(mixed, subject, 0);
    expect(modeForSubject(mixed, subject, 0)).toBe(a);
    expect(activeModes(mixed.settings)).toContain(a);
  });
});

describe('determinism', () => {
  it('replays a seeded run exactly', () => {
    const play = (): ScoutState => {
      const settings = s({ seed: 'fixed-seed', rounds: 4, tries: 4 });
      let st = reduce(
        createInitialScoutState(),
        { type: 'start', settings, subjects: pool(settings), now: T0 },
        createRng(settings.seed),
      );
      for (let i = 0; i < 4 && st.status !== 'finished'; i++) {
        st = reduce(st, { type: 'guess', text: 'wrong guess', now: T0 + i * 100 });
        st = reduce(st, { type: 'guess', text: answer(st), now: T0 + i * 100 + 10 });
        st = reduce(st, { type: 'next', now: T0 + i * 100 + 20 });
      }
      return st;
    };
    const a = play();
    const b = play();
    expect(a.id).toBe(b.id);
    expect(a.totalScore).toBe(b.totalScore);
    expect(a.rounds.map((r) => r.subject.id)).toEqual(b.rounds.map((r) => r.subject.id));
    expect(a.rounds.map((r) => r.mode)).toEqual(b.rounds.map((r) => r.mode));
    expect(a).toEqual(b);
  });

  it('runPool covers played and upcoming subjects', () => {
    const st = start({ rounds: 0 });
    expect(runPool(st).length).toBe(st.rounds.length + st.queue.length);
    expect(runPool(st)[0]).toBe(currentRound(st)?.subject);
  });
});

describe('selectors during a run', () => {
  it('tracks tries, progress and guessability', () => {
    let st = start({ tries: 3, rounds: 5 });
    expect(triesLeft(st)).toBe(3);
    expect(canGuess(st)).toBe(true);
    expect(progress(st)).toEqual({ round: 1, total: 5 });
    st = reduce(st, { type: 'skip', now: T0 + 1 });
    expect(triesLeft(st)).toBe(2);
    st = reduce(st, { type: 'giveUp', now: T0 + 2 });
    expect(canGuess(st)).toBe(false);
    expect(triesLeft(st)).toBe(0);
  });
});
