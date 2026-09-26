import { describe, expect, it } from 'vitest';
import { matchSubject } from '@/scout/names';
import { buildPlayerSubject, buildTeamSubject } from '@/scout/subjects';
import { findFixturePlayer, findFixtureTeam, makePlayer } from '@/scout/fixtures';
import type { ScoutRound, ScoutState, ScoutSubject } from '@/scout/types';
import { buildStages } from '@/scout/stages';
import { closeCopy, verdictLine } from './Feedback';
import { rungStatuses } from './TryLadder';
import { splitRedacted } from './RedactedPlay';

const kc = findFixtureTeam('KC');
const mahomes = findFixturePlayer('Patrick Mahomes');

function playerSubject(p = mahomes): ScoutSubject {
  return buildPlayerSubject(p, kc);
}

describe('closeCopy', () => {
  it('names the real reason a surname came back close', () => {
    const subject = playerSubject();
    const copy = closeCopy('Zebedee Mahomes', subject, [subject]);
    expect(copy.title).toMatch(/Right surname/i);
    expect(copy.detail).toMatch(/last name/i);
  });

  it('asks for a first name when two players in the run share the surname', () => {
    const a = playerSubject(makePlayer({ id: '1', name: 'Nick Bosa', first: 'Nick', last: 'Bosa' }));
    const b = playerSubject(makePlayer({ id: '2', name: 'Joey Bosa', first: 'Joey', last: 'Bosa' }));
    // the matcher agrees this is the ambiguous case
    expect(matchSubject('bosa', a, [a, b]).verdict).toBe('close');
    const copy = closeCopy('bosa', a, [a, b]);
    expect(copy.title).toMatch(/taken twice/i);
    expect(copy.detail).toMatch(/first name/i);
  });

  it('tells a team guesser they have the city but not the club', () => {
    const jets = buildTeamSubject(findFixtureTeam('NYJ'));
    const giants = buildTeamSubject(findFixtureTeam('NYG'));
    expect(matchSubject('new york giants', jets, [jets, giants]).verdict).toBe('close');
    const copy = closeCopy('new york giants', jets, [jets, giants]);
    expect(copy.title).toMatch(/Right city/i);

    const cityOnly = closeCopy('new york', jets, [jets, giants]);
    expect(cityOnly.detail).toMatch(/Two franchises/i);
  });
});

describe('verdictLine', () => {
  const subject = playerSubject();
  const round: ScoutRound = {
    index: 0,
    mode: 'silhouette',
    subject,
    stages: buildStages('silhouette', subject, 5),
    tryIndex: 1,
    guesses: [],
    status: 'playing',
    score: 0,
    startedAt: 0,
  };
  const state = {
    id: 'run',
    settings: { tries: 5 },
    status: 'playing',
    rounds: [round],
    currentRound: 0,
  } as unknown as ScoutState;

  it('counts down the tries left on a miss', () => {
    const line = verdictLine(state, round, { text: 'nope', verdict: 'wrong', tryIndex: 1, at: 0 }, []);
    expect(line.tone).toBe('danger');
    expect(line.text).toContain('4 tries left');
    expect(line.echo).toBe('nope');
  });

  it('gives a close guess the amber two-line treatment with what was typed', () => {
    const line = verdictLine(state, round, { text: 'Zebedee Mahomes', verdict: 'close', tryIndex: 1, at: 0 }, [subject]);
    expect(line.tone).toBe('warn');
    expect(line.detail).toBeTruthy();
    expect(line.echo).toBe('Zebedee Mahomes');
  });

  it('says which rung a correct answer landed on', () => {
    const line = verdictLine(state, { ...round, score: 1200 }, { text: 'mahomes', verdict: 'correct', tryIndex: 2, at: 0 }, []);
    expect(line.tone).toBe('success');
    expect(line.text).toContain('try 3');
    expect(line.text).toContain('1,200');
  });
});

describe('rungStatuses', () => {
  const subject = playerSubject();
  const base: ScoutRound = {
    index: 0,
    mode: 'silhouette',
    subject,
    stages: buildStages('silhouette', subject, 5),
    tryIndex: 0,
    guesses: [],
    status: 'playing',
    score: 0,
    startedAt: 0,
  };

  it('glows on the live rung and strikes the spent ones', () => {
    expect(rungStatuses({ ...base, tryIndex: 2 }, 5)).toEqual(['used', 'used', 'current', 'upcoming', 'upcoming']);
  });

  it('marks the winning rung and leaves the rest alone', () => {
    const won: ScoutRound = {
      ...base,
      status: 'won',
      tryIndex: 1,
      guesses: [{ text: 'x', verdict: 'wrong', tryIndex: 0, at: 0 }, { text: 'y', verdict: 'correct', tryIndex: 1, at: 1 }],
    };
    expect(rungStatuses(won, 5)).toEqual(['used', 'won', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('spends every rung on a lost round', () => {
    const lost: ScoutRound = { ...base, status: 'lost', tryIndex: 4 };
    expect(rungStatuses(lost, 5)).toEqual(['used', 'used', 'used', 'used', 'upcoming']);
  });
});

describe('splitRedacted', () => {
  it('turns every [?] into a blank and keeps the prose around it', () => {
    const parts = splitRedacted('(Shotgun) [?] pass to [?] for 12 yards.');
    expect(parts.map((p) => p.kind)).toEqual(['text', 'blank', 'text', 'blank', 'text']);
    expect(parts[0].value).toBe('(Shotgun) ');
    expect(parts.filter((p) => p.kind === 'blank')).toHaveLength(2);
  });

  it('handles a blank at either end, and text with none at all', () => {
    expect(splitRedacted('[?] scores.').map((p) => p.kind)).toEqual(['blank', 'text']);
    expect(splitRedacted('sacked by [?]').map((p) => p.kind)).toEqual(['text', 'blank']);
    expect(splitRedacted('no names here')).toEqual([{ kind: 'text', value: 'no names here' }]);
    expect(splitRedacted('')).toEqual([]);
  });

  it('is not confused by being called twice (the regex is stateful)', () => {
    const a = splitRedacted('[?] to [?]');
    const b = splitRedacted('[?] to [?]');
    expect(a).toEqual(b);
  });
});
