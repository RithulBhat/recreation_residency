import { describe, expect, it } from 'vitest';
import { matchSubject } from '@/scout/names';
import { buildPlayerSubject, buildTeamSubject } from '@/scout/subjects';
import { findFixturePlayer, findFixtureTeam, makePlayer } from '@/scout/fixtures';
import type { ScoutMode, ScoutRound, ScoutState, ScoutSubject } from '@/scout/types';
import { SCOUT_MODES } from '@/scout/packs';
import { buildStages } from '@/scout/stages';
import { closeCopy, verdictLine } from './Feedback';
import { rungStatuses, rungLabel } from './TryLadder';
import { rungValue } from './format';
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

  it('never claims a one-club city has another club to try', () => {
    const kcTeam = buildTeamSubject(kc);
    const copy = closeCopy('kansas city', kcTeam, [kcTeam, buildTeamSubject(findFixtureTeam('NYJ'))]);
    expect(copy.detail).not.toMatch(/other one|Two franchises/i);
    expect(copy.detail).toMatch(/nickname/i);
  });

  it('never calls a franchise a person', () => {
    const kcTeam = buildTeamSubject(kc);
    const copy = closeCopy('kansas city', kcTeam, [kcTeam]);
    for (const line of [copy.title, copy.detail]) expect(line).not.toMatch(/\b(him|his|he|guy)\b/i);
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

  it('never calls a franchise "him" — in any verdict', () => {
    const teamSubject = buildTeamSubject(kc);
    const teamRound: ScoutRound = { ...round, mode: 'teamTrivia', subject: teamSubject, stages: buildStages('teamTrivia', teamSubject, 5) };
    const teamState = { ...state, rounds: [teamRound] } as unknown as ScoutState;
    const verdicts = ['correct', 'close', 'wrong', 'skipped', 'timeout'] as const;
    for (const verdict of verdicts) {
      for (const status of ['playing', 'lost'] as const) {
        const line = verdictLine(teamState, { ...teamRound, status, score: 900 }, { text: 'kansas city', verdict, tryIndex: 1, at: 0 }, [teamSubject]);
        for (const part of [line.text, line.detail ?? '']) {
          expect(part, `${verdict}/${status}: "${part}"`).not.toMatch(/\b(him|his|he|guy)\b/i);
        }
      }
    }
  });

  it('still talks about a player as a person', () => {
    const line = verdictLine(state, round, { text: 'nope', verdict: 'wrong', tryIndex: 1, at: 0 }, []);
    expect(line.text).toMatch(/Not him/);
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

describe('rungLabel', () => {
  const ladder = (mode: ScoutMode, tries = 5): string[] =>
    Array.from({ length: tries }, (_, i) => rungLabel(rungValue(mode, i)));

  it('rounds every puzzle type the same way — no k, no hidden precision', () => {
    // The defect: Silhouette (modeWeight 1.15) printed `1.2k 920 747 575 460` while Locker Room
    // (weight 1) printed `1k 800 650 500 400` — two rules in one row, and `1.2k` for a rung that
    // pays 1,150.
    expect(ladder('silhouette')).toEqual(['1150', '920', '747', '575', '460']);
    expect(ladder('teammates')).toEqual(['1000', '800', '650', '500', '400']);
    expect(ladder('higherLower')).toEqual(['600', '480', '390', '300', '240']);
  });

  it('prints the figure the scorer will actually pay, for every mode and rung', () => {
    for (const mode of SCOUT_MODES) {
      for (let i = 0; i < 6; i += 1) {
        const pts = rungValue(mode.id, i);
        expect(rungLabel(pts), `${mode.id} rung ${i}`).toBe(String(pts));
        // Four characters at most, so it is never wider than the `1.2k` it replaced.
        expect(rungLabel(pts).length, `${mode.id} rung ${i}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('survives a non-finite score', () => {
    expect(rungLabel(Number.NaN)).toBe('0');
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
