/**
 * The Film Room / Stat Sheet clues must talk about the RIGHT season's team.
 *
 * `ScoutSubject.team` is the player's club today. A highlight play carries its own `teamId`, and in
 * the shipped dataset roughly a quarter of the 1,700 plays were run by a different club than the
 * player is on now — so a ladder built from `subject.team` captioned a 2024 play with a 2026 roster
 * spot. `@/scout/stages` resolves the play's own club through a literal table (the ladder has to be
 * reproducible for a daily / challenge seed, so it cannot wait on an async index); this pins that
 * table to the dataset, so it fails the moment the two drift.
 */

import { describe, expect, it } from 'vitest';
import teamsJson from '@/data/nfl/teams.json';
import { clueOrderFor, teamNameById } from '@/scout/stages';
import { buildPlayerSubject } from '@/scout/subjects';
import { FIXTURE_PLAYS, FIXTURE_STAT_LINES, FIXTURE_TEAMS, findFixturePlayer } from '@/scout/fixtures';
import type { HighlightPlay, NflTeam, ScoutClue, StatLine } from '@/scout/types';

const teams = teamsJson as unknown as NflTeam[];

function labelled(clues: readonly ScoutClue[], label: string): ScoutClue | undefined {
  return clues.find((c) => c.label === label);
}

const mahomes = findFixturePlayer('Patrick Mahomes');
const kc = FIXTURE_TEAMS.find((t) => t.id === '12')!;
const play = FIXTURE_PLAYS.find((p) => p.playerId === mahomes.id)!;
const statLine = FIXTURE_STAT_LINES.find((s) => s.playerId === mahomes.id)!;

describe('teamNameById', () => {
  it('names every franchise in the shipped dataset, and nothing that is not one', () => {
    for (const team of teams) {
      expect(teamNameById(team.id), `team id ${team.id}`).toBe(team.displayName);
    }
    expect(teamNameById('999')).toBeUndefined();
  });

  it('prefers the record it was handed when that record is the same club', () => {
    expect(teamNameById('12', kc)).toBe(kc.displayName);
    // A different club still resolves from the table, never from the record.
    expect(teamNameById('16', kc)).toBe('Minnesota Vikings');
  });
});

describe('the Film Room ladder names the team that ran the play', () => {
  it('uses the PLAY’s club, not the roster the player is on now', () => {
    const traded: HighlightPlay = { ...play, teamId: '16', season: 2024 };
    const subject = buildPlayerSubject(mahomes, kc, { play: traded, statLine });
    const { clues } = clueOrderFor('highlight', subject, 5);
    const team = clues.find((c) => c.kind === 'team');
    expect(team?.value).toBe('Minnesota Vikings');
    // …and the label says which team it means, so it cannot read as a current roster spot.
    expect(team?.label).toBe('Team on the play');
    expect(clues.map((c) => c.value)).not.toContain(kc.displayName);
  });

  it('keeps the plain label when the play IS from his current club', () => {
    const subject = buildPlayerSubject(mahomes, kc, { play, statLine });
    const { clues } = clueOrderFor('highlight', subject, 5);
    const team = clues.find((c) => c.kind === 'team');
    expect(team?.label).toBe('Team');
    expect(team?.value).toBe(kc.displayName);
  });

  it('dates the play, so nothing on screen implies it happened this season', () => {
    const subject = buildPlayerSubject(mahomes, kc, { play: { ...play, season: 2024 }, statLine });
    const { clues } = clueOrderFor('highlight', subject, 5);
    expect(labelled(clues, 'Situation')?.value).toContain('2024');
  });
});

describe('the Stat Sheet ladder pairs a season with that season’s team', () => {
  it('names the club from the same season when the dataset knows it', () => {
    const sameSeason: HighlightPlay = { ...play, teamId: '16', season: statLine.season };
    const subject = buildPlayerSubject(mahomes, kc, { play: sameSeason, statLine });
    const { clues } = clueOrderFor('statLine', subject, 6);
    expect(labelled(clues, 'Season')?.value).toBe(String(statLine.season));
    expect(labelled(clues, 'Team')?.value).toBe('Minnesota Vikings');
  });

  it('never presents this year’s roster spot as the stat line’s team', () => {
    const older: StatLine = { ...statLine, season: statLine.season - 2 };
    const subject = buildPlayerSubject(mahomes, kc, { play, statLine: older });
    const { clues } = clueOrderFor('statLine', subject, 6);
    expect(labelled(clues, 'Team')).toBeUndefined();
    expect(labelled(clues, 'Current team')?.value).toBe(kc.displayName);
  });
});
