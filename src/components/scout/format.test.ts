import { describe, expect, it } from 'vitest';
import { buildStages } from '@/scout/stages';
import { buildPlayerSubject, buildTeamSubject } from '@/scout/subjects';
import { FIXTURE_PLAYS, FIXTURE_STAT_LINES, findFixturePlayer, findFixtureTeam } from '@/scout/fixtures';
import type { ScoutGuess, ScoutMode, ScoutRound } from '@/scout/types';
import {
  VERDICT_LABEL,
  buildLine,
  draftLine,
  espnPlayerUrl,
  playerLine,
  railClues,
  roundVerdict,
  rungValue,
  shortPoints,
  stageClues,
  stageOwnsAll,
  superBowlLine,
  teamLine,
  triesUsed,
} from './format';

const team = findFixtureTeam('KC');
const player = findFixturePlayer('Patrick Mahomes');
const play = FIXTURE_PLAYS.find((p) => p.playerId === player.id) ?? FIXTURE_PLAYS[0];
const statLine = FIXTURE_STAT_LINES.find((s) => s.playerId === player.id) ?? FIXTURE_STAT_LINES[0];

function subjectFor(mode: ScoutMode) {
  if (mode === 'teamTrivia' || mode === 'logoZoom') return buildTeamSubject(team);
  return buildPlayerSubject(player, team, { play: { ...play, playerId: player.id }, statLine: { ...statLine, playerId: player.id } });
}

function round(over: Partial<ScoutRound> = {}): ScoutRound {
  const subject = subjectFor('silhouette');
  return {
    index: 0,
    mode: 'silhouette',
    subject,
    stages: buildStages('silhouette', subject, 5),
    tryIndex: 0,
    guesses: [],
    status: 'playing',
    score: 0,
    startedAt: 0,
    ...over,
  };
}

function guess(over: Partial<ScoutGuess> = {}): ScoutGuess {
  return { text: 'x', verdict: 'wrong', tryIndex: 0, at: 0, ...over };
}

describe('clue routing', () => {
  it('gives the image modes nothing and the rail everything', () => {
    for (const mode of ['silhouette', 'faceZoom', 'logoZoom'] as const) {
      const subject = subjectFor(mode);
      const stages = buildStages(mode, subject, 5);
      const last = stages[stages.length - 1].clues;
      expect(stageClues(mode, last)).toEqual([]);
      expect(railClues(mode, last)).toEqual(last);
      expect(stageOwnsAll(mode)).toBe(false);
    }
  });

  it('gives the text stages their puzzle and the rail the supporting facts', () => {
    const subject = subjectFor('highlight');
    const last = buildStages('highlight', subject, 5)[4].clues;
    const staged = stageClues('highlight', last);
    const rail = railClues('highlight', last);
    expect(staged.length).toBeGreaterThan(0);
    expect(staged.every((c) => c.kind === 'play')).toBe(true);
    expect(rail.some((c) => c.kind === 'play')).toBe(false);
    // the two halves partition the rung exactly
    expect(staged.length + rail.length).toBe(last.length);
  });

  it('gives the stat sheet every stat line and nothing else', () => {
    const subject = subjectFor('statLine');
    const last = buildStages('statLine', subject, 5)[4].clues;
    expect(stageClues('statLine', last).every((c) => c.kind === 'stat')).toBe(true);
    expect(railClues('statLine', last).every((c) => c.kind !== 'stat')).toBe(true);
  });

  it('gives the dossier and the timeline the whole ladder (their rail is empty)', () => {
    for (const mode of ['teamTrivia', 'careerPath'] as const) {
      const subject = subjectFor(mode);
      const last = buildStages(mode, subject, 5)[4].clues;
      expect(stageOwnsAll(mode)).toBe(true);
      expect(stageClues(mode, last)).toEqual(last);
      expect(railClues(mode, last)).toEqual([]);
    }
  });
});

describe('roundVerdict', () => {
  it('reads a win as correct whatever came before it', () => {
    expect(roundVerdict(round({ status: 'won', guesses: [guess(), guess({ verdict: 'correct' })] }))).toBe('correct');
  });
  it('remembers a near miss on a lost round', () => {
    expect(roundVerdict(round({ status: 'lost', guesses: [guess({ verdict: 'close' }), guess()] }))).toBe('close');
  });
  it('separates a timeout, an all-skip round and a plain miss', () => {
    expect(roundVerdict(round({ status: 'lost', guesses: [guess({ verdict: 'timeout' })] }))).toBe('timeout');
    expect(roundVerdict(round({ status: 'lost', guesses: [guess({ verdict: 'skipped' }), guess({ verdict: 'skipped' })] }))).toBe('skipped');
    expect(roundVerdict(round({ status: 'lost', guesses: [guess()] }))).toBe('wrong');
  });
  it('has a label for every verdict it can return', () => {
    for (const v of ['correct', 'close', 'wrong', 'skipped', 'timeout'] as const) {
      expect(VERDICT_LABEL[v]).toBeTruthy();
    }
  });
});

describe('triesUsed', () => {
  it('counts the winning rung, not the ones left', () => {
    expect(triesUsed(round({ status: 'won', tryIndex: 2, guesses: [guess({ verdict: 'correct', tryIndex: 2 })] }))).toBe(3);
  });
  it('counts every consumed rung on a loss', () => {
    expect(triesUsed(round({ status: 'lost', tryIndex: 4, guesses: [guess(), guess(), guess(), guess(), guess()] }))).toBe(4);
  });
  it('is zero for a round nobody touched', () => {
    expect(triesUsed(round())).toBe(0);
  });
});

describe('rungValue', () => {
  it('pays strictly less the further down the ladder you go', () => {
    const values = [0, 1, 2, 3, 4, 5].map((i) => rungValue('silhouette', i));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
  });
  it('prices the hardest mode above the easiest', () => {
    expect(rungValue('faceZoom', 0)).toBeGreaterThan(rungValue('logoZoom', 0));
  });
});

describe('shortPoints', () => {
  it('keeps small numbers whole and abbreviates the rest', () => {
    expect(shortPoints(0)).toBe('0');
    expect(shortPoints(999)).toBe('999');
    expect(shortPoints(1150)).toBe('1.2k');
    expect(shortPoints(12_400)).toBe('12k');
    expect(shortPoints(Number.NaN)).toBe('0');
  });
});

describe('subject copy', () => {
  it('writes a player line with the position group and jersey', () => {
    const line = playerLine(player);
    expect(line).toContain('Quarterback');
    if (player.jersey) expect(line).toContain(`#${player.jersey}`);
  });
  it('writes a build line only from what the dataset has', () => {
    expect(buildLine({ ...player, heightIn: 75, weightLb: 225 })).toBe(`6'3", 225 lb`);
    expect(buildLine({ ...player, heightIn: undefined, weightLb: undefined })).toBe('');
  });
  it('says undrafted rather than inventing a slot', () => {
    expect(draftLine({ ...player, draft: undefined, college: 'Texas Tech' })).toBe('Undrafted · Texas Tech');
    expect(draftLine({ ...player, draft: { year: 2017, round: 1, pick: 10 } })).toContain('Round 1, pick 10');
  });
  it('writes team lines from the franchise record', () => {
    expect(teamLine(team)).toContain(`${team.conference} ${team.division}`);
    expect(superBowlLine({ ...team, superBowls: [] })).toBe('No Super Bowl titles');
    expect(superBowlLine({ ...team, superBowls: [1969] })).toBe('1 Super Bowl (1969)');
    expect(superBowlLine({ ...team, superBowls: [1969, 2019] })).toContain('2 Super Bowls');
  });
  it('builds an ESPN url that survives a strange id', () => {
    expect(espnPlayerUrl('3139477')).toBe('https://www.espn.com/nfl/player/_/id/3139477');
    expect(espnPlayerUrl('a b')).toBe('https://www.espn.com/nfl/player/_/id/a%20b');
  });
});
