import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import {
  MIN_STAT_PAIRS,
  activeModes,
  buildPool,
  buildPlayerSubject,
  buildSubject,
  buildTeamSubject,
  canRender,
  orderSubjects,
  playableModes,
  playerAccepted,
  playerMatchesFilter,
  resolvePacks,
  subjectKindForMode,
  teamAccepted,
  teamMatchesFilter,
  teamTier,
  tierOf,
} from './subjects';
import { scoutPack } from './packs';
import { DEFAULT_SCOUT_SETTINGS } from './presets';
import { SCOUT_PUZZLE_MODES, buildPuzzleIndex, buildScoutPuzzleSpecs } from './puzzles';
import { buildPuzzleSubject } from './subjects';
import { makePuzzleDataset } from './puzzleTestFactory';
import {
  FIXTURE_PLAYS,
  FIXTURE_STAT_LINES,
  FIXTURE_TEAMS,
  fixtureBundle,
  findFixturePlayer,
  findFixtureTeam,
  makePlayer,
} from './fixtures';
import type { ScoutMode, ScoutPuzzleMode, ScoutSettings, ScoutSubject } from './types';

function settings(over: Partial<ScoutSettings> = {}): ScoutSettings {
  return { ...DEFAULT_SCOUT_SETTINGS, packIds: [...DEFAULT_SCOUT_SETTINGS.packIds], ...over };
}

function names(subjects: readonly ScoutSubject[]): string[] {
  return subjects.map((s) => s.name);
}

const KC = findFixtureTeam('KC');

describe('tierOf', () => {
  it('uses the CLAUDE.md thresholds', () => {
    const at = (fame: number) => tierOf(makePlayer({ fame }));
    expect(at(100)).toBe('star');
    expect(at(80)).toBe('star');
    expect(at(79)).toBe('starter');
    expect(at(55)).toBe('starter');
    expect(at(54)).toBe('rotation');
    expect(at(30)).toBe('rotation');
    expect(at(29)).toBe('deepCut');
    expect(at(0)).toBe('deepCut');
  });

  it('gives franchises a tier from their trophy case', () => {
    expect(teamTier(findFixtureTeam('KC'))).toBe('star');
    expect(teamTier(findFixtureTeam('SEA'))).toBe('starter');
    expect(teamTier(findFixtureTeam('BUF'))).toBe('rotation');
  });
});

describe('accepted spellings', () => {
  it('covers full name, surname and the initial form', () => {
    const accepted = playerAccepted(findFixturePlayer('Patrick Mahomes'));
    expect(accepted).toContain('patrick mahomes');
    expect(accepted).toContain('mahomes');
    expect(accepted).toContain('p mahomes');
    expect(accepted).toContain('showtime');
  });

  it('covers city, nickname, abbreviation and dataset aliases', () => {
    const accepted = teamAccepted(findFixtureTeam('GB'));
    expect(accepted).toContain('green bay packers');
    expect(accepted).toContain('packers');
    expect(accepted).toContain('the packers');
    expect(accepted).toContain('green bay');
    expect(accepted).toContain('gb');
    expect(accepted).toContain('the pack');
  });
});

describe('subjectKindForMode / canRender', () => {
  it('routes modes to the right kind', () => {
    expect(subjectKindForMode('silhouette')).toBe('player');
    expect(subjectKindForMode('faceZoom')).toBe('player');
    expect(subjectKindForMode('highlight')).toBe('player');
    expect(subjectKindForMode('statLine')).toBe('player');
    expect(subjectKindForMode('careerPath')).toBe('player');
    expect(subjectKindForMode('teamTrivia')).toBe('team');
    expect(subjectKindForMode('logoZoom')).toBe('team');
  });

  it('refuses a mode the subject cannot render', () => {
    const p = findFixturePlayer('Patrick Mahomes');
    const bare = buildPlayerSubject(p, KC);
    expect(canRender('silhouette', bare)).toBe(true);
    expect(canRender('highlight', bare)).toBe(false);
    expect(canRender('statLine', bare)).toBe(false);
    expect(canRender('teamTrivia', bare)).toBe(false);

    const rich = buildPlayerSubject(p, KC, {
      play: FIXTURE_PLAYS.find((x) => x.playerId === p.id),
      statLine: FIXTURE_STAT_LINES.find((x) => x.playerId === p.id),
    });
    expect(canRender('highlight', rich)).toBe(true);
    expect(canRender('statLine', rich)).toBe(true);

    const noShot = buildPlayerSubject(makePlayer({ id: 'x', headshot: '' }), KC);
    expect(canRender('silhouette', noShot)).toBe(false);
    expect(canRender('faceZoom', noShot)).toBe(false);
    expect(canRender('careerPath', noShot)).toBe(false);

    const thinStats = buildPlayerSubject(p, KC, {
      statLine: { playerId: p.id, season: 2024, stats: [['TD', '1']] },
    });
    expect(MIN_STAT_PAIRS).toBe(2);
    expect(canRender('statLine', thinStats)).toBe(false);

    const team = buildTeamSubject(KC);
    expect(canRender('teamTrivia', team)).toBe(true);
    expect(canRender('logoZoom', team)).toBe(true);
    expect(canRender('silhouette', team)).toBe(false);
  });

  it('playableModes lists only what works', () => {
    const p = findFixturePlayer('Patrick Mahomes');
    const rich = buildPlayerSubject(p, KC, {
      play: FIXTURE_PLAYS.find((x) => x.playerId === p.id),
      statLine: FIXTURE_STAT_LINES.find((x) => x.playerId === p.id),
    });
    expect(playableModes(rich)).toEqual(['silhouette', 'faceZoom', 'highlight', 'statLine', 'careerPath']);
    expect(playableModes(buildTeamSubject(KC))).toEqual(['teamTrivia', 'logoZoom']);
    expect(playableModes(rich, ['teamTrivia'])).toEqual([]);
  });
});

describe('buildSubject', () => {
  it('builds per mode and returns null when the mode cannot render', () => {
    const player = findFixturePlayer('Patrick Mahomes');
    const play = FIXTURE_PLAYS.find((x) => x.playerId === player.id);
    expect(buildSubject('silhouette', { player, team: KC })?.kind).toBe('player');
    expect(buildSubject('highlight', { player, team: KC })).toBeNull();
    expect(buildSubject('highlight', { player, team: KC, play })?.play).toBe(play);
    expect(buildSubject('teamTrivia', { team: KC })?.kind).toBe('team');
    expect(buildSubject('teamTrivia', { player })).toBeNull();
    expect(buildSubject('silhouette', {})).toBeNull();
  });

  it('attaches the tier, image and team', () => {
    const player = findFixturePlayer('Justin Jefferson');
    const subject = buildSubject('silhouette', { player, team: findFixtureTeam('MIN') });
    expect(subject?.tier).toBe('star');
    expect(subject?.image).toContain('headshots');
    expect(subject?.team?.abbr).toBe('MIN');
  });
});

describe('pack filters', () => {
  it('matches players on group, team, fame, experience and draft', () => {
    const mahomes = findFixturePlayer('Patrick Mahomes');
    const ekeler = findFixturePlayer('Austin Ekeler');
    expect(playerMatchesFilter(mahomes, { groups: ['QB'] })).toBe(true);
    expect(playerMatchesFilter(mahomes, { groups: ['WR'] })).toBe(false);
    expect(playerMatchesFilter(mahomes, { teamIds: ['12'] })).toBe(true);
    expect(playerMatchesFilter(mahomes, { teamIds: ['9'] })).toBe(false);
    expect(playerMatchesFilter(mahomes, { minFame: 90 })).toBe(true);
    expect(playerMatchesFilter(mahomes, { maxFame: 29 })).toBe(false);
    expect(playerMatchesFilter(mahomes, { conferences: ['AFC'] }, KC)).toBe(true);
    expect(playerMatchesFilter(mahomes, { conferences: ['NFC'] }, KC)).toBe(false);
    expect(playerMatchesFilter(mahomes, { divisions: ['West'] }, KC)).toBe(true);
    expect(playerMatchesFilter(mahomes, { positions: ['qb'] })).toBe(true);
    expect(playerMatchesFilter(mahomes, { minExp: 20 })).toBe(false);
    expect(playerMatchesFilter(mahomes, { maxExp: 1 })).toBe(false);
    // explicit ids always win
    expect(playerMatchesFilter(mahomes, { groups: ['WR'], ids: [mahomes.id] })).toBe(true);
    // the draft extension
    expect(playerMatchesFilter(mahomes, scoutPack('first-rounders')!.filter)).toBe(true);
    expect(playerMatchesFilter(ekeler, scoutPack('first-rounders')!.filter)).toBe(false);
    expect(playerMatchesFilter(ekeler, scoutPack('undrafted')!.filter)).toBe(true);
    expect(playerMatchesFilter(mahomes, scoutPack('undrafted')!.filter)).toBe(false);
  });

  it('matches teams on id, conference and division', () => {
    expect(teamMatchesFilter(KC, { conferences: ['AFC'] })).toBe(true);
    expect(teamMatchesFilter(KC, { conferences: ['NFC'] })).toBe(false);
    expect(teamMatchesFilter(KC, { divisions: ['West'] })).toBe(true);
    expect(teamMatchesFilter(KC, { teamIds: ['12'] })).toBe(true);
    expect(teamMatchesFilter(KC, { teamIds: ['9'] })).toBe(false);
  });

  it('resolvePacks drops unknown ids and dedupes', () => {
    expect(resolvePacks(['pos-qb', 'nope', 'pos-qb']).map((p) => p.id)).toEqual(['pos-qb']);
  });
});

describe('activeModes', () => {
  it('is the single mode, or everything when mixing', () => {
    expect(activeModes({ mode: 'silhouette', mixModes: false })).toEqual(['silhouette']);
    // seven reveal modes + the six choice-shaped ones
    expect(activeModes({ mode: 'silhouette', mixModes: true }).length).toBe(13);
  });
});

describe('buildPool', () => {
  it('applies a position pack', () => {
    const pool = buildPool(fixtureBundle(), settings({ packIds: ['pos-qb'] }), createRng('a'));
    expect(pool.length).toBeGreaterThan(0);
    for (const s of pool) expect(s.player?.group).toBe('QB');
    expect(names(pool)).toContain('Patrick Mahomes');
    expect(names(pool)).not.toContain('Travis Kelce');
  });

  it('applies a team pack', () => {
    const pool = buildPool(fixtureBundle(), settings({ packIds: ['team-kc'] }), createRng('a'));
    for (const s of pool) expect(s.player?.teamId).toBe('12');
    expect(pool.length).toBe(4);
  });

  it('unions several packs', () => {
    const pool = buildPool(fixtureBundle(), settings({ packIds: ['team-kc', 'team-gb'] }), createRng('a'));
    const teamIds = new Set(pool.map((s) => s.player?.teamId));
    expect(teamIds).toEqual(new Set(['12', '9']));
  });

  it('applies the difficulty tier', () => {
    const bundle = fixtureBundle();
    const stars = buildPool(bundle, settings({ packIds: ['conf-afc', 'conf-nfc'], difficulty: 'star' }), createRng('a'));
    expect(stars.length).toBeGreaterThan(0);
    for (const s of stars) expect(s.tier).toBe('star');
    const deep = buildPool(bundle, settings({ packIds: ['conf-afc', 'conf-nfc'], difficulty: 'deepCut' }), createRng('a'));
    for (const s of deep) expect(s.tier).toBe('deepCut');
    expect(names(deep)).toContain('Sebastián Núñez');
    expect(names(deep)).not.toContain('Patrick Mahomes');
  });

  it('drops subjects the mode cannot render', () => {
    const bundle = fixtureBundle();
    const highlight = buildPool(bundle, settings({ mode: 'highlight', packIds: ['conf-afc', 'conf-nfc'] }), createRng('a'));
    expect(highlight.length).toBe(FIXTURE_PLAYS.length);
    for (const s of highlight) expect(s.play).toBeDefined();

    const stats = buildPool(bundle, settings({ mode: 'statLine', packIds: ['conf-afc', 'conf-nfc'] }), createRng('a'));
    expect(stats.length).toBe(FIXTURE_STAT_LINES.length);

    const noShots = { ...bundle, players: bundle.players.map((p) => ({ ...p, headshot: '' })) };
    expect(buildPool(noShots, settings({ mode: 'silhouette' }), createRng('a'))).toEqual([]);
  });

  it('builds team subjects for the team modes', () => {
    const pool = buildPool(fixtureBundle(), settings({ mode: 'teamTrivia', packIds: ['franchises-all'] }), createRng('a'));
    expect(pool.length).toBe(FIXTURE_TEAMS.length);
    for (const s of pool) expect(s.kind).toBe('team');

    const afc = buildPool(fixtureBundle(), settings({ mode: 'logoZoom', packIds: ['franchises-afc'] }), createRng('a'));
    for (const s of afc) expect(s.team?.conference).toBe('AFC');
  });

  it('mixes both kinds when mixModes is on', () => {
    const pool = buildPool(
      fixtureBundle(),
      settings({ mixModes: true, packIds: ['superstars', 'franchises-all'] }),
      createRng('a'),
    );
    expect(pool.some((s) => s.kind === 'player')).toBe(true);
    expect(pool.some((s) => s.kind === 'team')).toBe(true);
  });

  it('falls back to the whole dataset when no pack of the needed kind is selected', () => {
    const teamOnly = buildPool(
      fixtureBundle(),
      settings({ mode: 'silhouette', packIds: ['franchises-all'] }),
      createRng('a'),
    );
    expect(teamOnly.length).toBe(fixtureBundle().players.length);
  });

  it('deduplicates repeated subjects', () => {
    const bundle = fixtureBundle();
    const dupe = { ...bundle, players: [...bundle.players, bundle.players[0]] };
    const pool = buildPool(dupe, settings({ packIds: ['team-kc'] }), createRng('a'));
    const ids = pool.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('honours a limit', () => {
    const pool = buildPool(fixtureBundle(), settings(), createRng('a'), { limit: 3 });
    expect(pool).toHaveLength(3);
  });

  it('attaches a deterministic play and stat line for a seed', () => {
    const a = buildPool(fixtureBundle(), settings({ mode: 'highlight', seed: 'sd' }));
    const b = buildPool(fixtureBundle(), settings({ mode: 'highlight', seed: 'sd' }));
    expect(a.map((s) => s.play?.id)).toEqual(b.map((s) => s.play?.id));
  });

  it('orders identically for the same seed and differently for another', () => {
    const a = buildPool(fixtureBundle(), settings({ seed: 'seed-1' }));
    const b = buildPool(fixtureBundle(), settings({ seed: 'seed-1' }));
    const c = buildPool(fixtureBundle(), settings({ seed: 'seed-2' }));
    expect(names(a)).toEqual(names(b));
    expect(names(a)).not.toEqual(names(c));
    expect(new Set(names(a))).toEqual(new Set(names(c)));
  });

  it('keeps the seeded order stable when one subject disappears', () => {
    const bundle = fixtureBundle();
    const full = buildPool(bundle, settings({ seed: 'stable' }));
    const gone = full[Math.floor(full.length / 2)];
    const thinner = { ...bundle, players: bundle.players.filter((p) => p.id !== gone.id) };
    const after = buildPool(thinner, settings({ seed: 'stable' }));
    expect(names(after)).toEqual(names(full).filter((n) => n !== gone.name));
  });

  it('shuffles unseeded runs without losing anybody', () => {
    const bundle = fixtureBundle();
    const a = buildPool(bundle, settings(), createRng('rng-a'));
    const b = buildPool(bundle, settings(), createRng('rng-b'));
    expect(new Set(names(a))).toEqual(new Set(names(b)));
    expect(names(a)).not.toEqual(names(b));
  });

  it('returns an empty pool rather than throwing when nothing matches', () => {
    const empty = { ...fixtureBundle(), players: [] };
    expect(buildPool(empty, settings({ mode: 'silhouette' }), createRng('a'))).toEqual([]);
  });
});

describe('orderSubjects', () => {
  it('is a stable hash sort when seeded', () => {
    const subjects = FIXTURE_TEAMS.map(buildTeamSubject);
    const a = orderSubjects(subjects, 'x', createRng('x'));
    const b = orderSubjects(subjects, 'x', createRng('other'));
    expect(names(a)).toEqual(names(b));
    expect(names(orderSubjects(a, 'x', createRng('x')))).toEqual(names(a));
  });

  it('is an rng shuffle when unseeded', () => {
    const subjects = FIXTURE_TEAMS.map(buildTeamSubject);
    const a = orderSubjects(subjects, undefined, createRng('a'));
    expect(new Set(names(a))).toEqual(new Set(names(subjects)));
  });
});

describe('every mode can build a playable pool from the fixtures', () => {
  const modes: ScoutMode[] = ['silhouette', 'faceZoom', 'highlight', 'teamTrivia', 'statLine', 'careerPath', 'logoZoom'];
  it.each(modes)('%s', (mode) => {
    const packIds = subjectKindForMode(mode) === 'team' ? ['franchises-all'] : ['conf-afc', 'conf-nfc'];
    const pool = buildPool(fixtureBundle(), settings({ mode, packIds }), createRng('a'));
    expect(pool.length).toBeGreaterThan(0);
    for (const s of pool) expect(canRender(mode, s)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Choice-shaped subjects in the pool
// ---------------------------------------------------------------------------------------------

describe('choice-shaped subjects', () => {
  const dataset = makePuzzleDataset();
  const index = buildPuzzleIndex(dataset);
  const settings = (over: Partial<ScoutSettings> = {}): ScoutSettings => ({
    ...DEFAULT_SCOUT_SETTINGS,
    packIds: [],
    difficulty: 'any',
    seed: 'pool-seed',
    ...over,
  });

  function specFor(mode: ScoutPuzzleMode) {
    const spec = buildScoutPuzzleSpecs({
      dataset,
      index,
      modes: [mode],
      difficulty: 'any',
      seed: 'pool-seed',
      playerEligible: (p) => p.fame >= 55,
      limit: 1,
    })[0];
    if (!spec) throw new Error(`no spec for ${mode}`);
    return spec;
  }

  it('pins a subject carrying a payload to that mode and nothing else', () => {
    for (const mode of SCOUT_PUZZLE_MODES) {
      const subject = buildPuzzleSubject(specFor(mode as ScoutPuzzleMode))!;
      expect(subject.puzzle?.type).toBe(mode);
      expect(playableModes(subject)).toEqual([mode]);
      expect(canRender(mode, subject)).toBe(true);
      for (const other of ['silhouette', 'faceZoom', 'statLine', 'teamTrivia', 'logoZoom'] as ScoutMode[]) {
        expect(canRender(other, subject), `${mode} must not render as ${other}`).toBe(false);
      }
    }
  });

  it('never lets an ordinary subject stand in for a choice-shaped round', () => {
    const player = findFixturePlayer('Patrick Mahomes');
    const subject = buildPlayerSubject(player, findFixtureTeam('KC'));
    for (const mode of SCOUT_PUZZLE_MODES) expect(canRender(mode, subject)).toBe(false);
    expect(buildSubject('teammates', { player })).toBeNull();
  });

  it('carries a payload through buildSubject', () => {
    const spec = specFor('teammates');
    const subject = buildSubject('teammates', { player: spec.player, team: spec.team, puzzle: spec.puzzle });
    expect(subject?.puzzle).toBe(spec.puzzle);
    expect(subject?.name).toBe(spec.player!.name);
  });

  it('answers a draft class with the YEAR, and carries no player record to leak the anchor', () => {
    const spec = specFor('draftClass');
    const subject = buildPuzzleSubject(spec)!;
    if (spec.puzzle.type !== 'draftClass') throw new Error('expected a draftClass payload');
    expect(subject.name).toBe(String(spec.puzzle.year));
    expect(subject.accepted).toContain(String(spec.puzzle.year));
    expect(subject.accepted.some((a) => a.includes(spec.player!.last.toLowerCase()))).toBe(false);
    expect(subject.player).toBeUndefined();
    // the headshot still resolves, so the reveal has a face and `subjectImage` keeps working
    expect(subject.image).toBe(spec.player!.headshot);
    expect(subject.id).toBe(spec.player!.id);
  });

  it('answers a depth chart with the franchise', () => {
    const spec = specFor('depthChart');
    const subject = buildPuzzleSubject(spec)!;
    expect(subject.kind).toBe('team');
    expect(subject.name).toBe(spec.team!.displayName);
    expect(subject.accepted).toContain(spec.team!.abbr.toLowerCase());
  });

  it('builds a pool of nothing but that mode when the mode is chosen', () => {
    for (const mode of SCOUT_PUZZLE_MODES) {
      const pool = buildPool(dataset, settings({ mode, mixModes: false }));
      expect(pool.length, mode).toBeGreaterThan(0);
      for (const subject of pool) {
        expect(subject.puzzle?.type, mode).toBe(mode);
        expect(subject.kind).toBe(subjectKindForMode(mode));
      }
    }
  });

  it('lets one man anchor two different choice-shaped rounds in a mixed pool', () => {
    const pool = buildPool(dataset, settings({ mode: 'teammates', mixModes: true }));
    const modes = new Set(pool.map((s) => s.puzzle?.type ?? 'reveal'));
    expect(modes.has('reveal')).toBe(true);
    for (const mode of SCOUT_PUZZLE_MODES) expect(modes.has(mode), mode).toBe(true);
    const byPlayer = new Map<string, Set<string>>();
    for (const s of pool) {
      if (!s.puzzle || s.kind !== 'player') continue;
      const set = byPlayer.get(s.id) ?? new Set<string>();
      set.add(s.puzzle.type);
      byPlayer.set(s.id, set);
    }
    expect([...byPlayer.values()].some((set) => set.size > 1)).toBe(true);
  });

  it('keeps the difficulty tier and the pack filter meaning what they say', () => {
    const stars = buildPool(dataset, settings({ mode: 'teammates', difficulty: 'star' }));
    expect(stars.length).toBeGreaterThan(0);
    for (const s of stars) expect(s.tier).toBe('star');

    const chiefs = buildPool(dataset, settings({ mode: 'jersey', packIds: ['team-kc'] }));
    expect(chiefs.length).toBeGreaterThan(0);
    for (const s of chiefs) expect(s.team?.abbr).toBe('KC');

    // a team pack gates which franchises a depth chart may ask about
    const afc = buildPool(dataset, settings({ mode: 'depthChart', packIds: ['franchises-afc'] }));
    expect(afc.length).toBeGreaterThan(0);
    for (const s of afc) expect(s.team?.conference).toBe('AFC');
  });

  it('is deterministic for a seed and shuffles without one', () => {
    const keys = (pool: ReturnType<typeof buildPool>) => pool.map((s) => `${s.kind}:${s.id}#${s.puzzle?.type ?? ''}`);
    const a = buildPool(dataset, settings({ mode: 'oddOneOut' }));
    const b = buildPool(dataset, settings({ mode: 'oddOneOut' }));
    expect(keys(b)).toEqual(keys(a));
    // this dataset is small enough that every eligible man makes a round under either seed, so the
    // seed shows up as a different ORDER and a different board rather than a different cast list
    const other = buildPool(dataset, settings({ mode: 'oddOneOut', seed: 'another' }));
    expect(keys(other)).not.toEqual(keys(a));
    const cardsOf = (pool: ReturnType<typeof buildPool>, id: string) =>
      pool.find((s) => s.id === id)?.puzzle?.type === 'oddOneOut'
        ? (pool.find((s) => s.id === id)!.puzzle as { cards: Array<{ playerId: string }> }).cards.map((c) => c.playerId)
        : [];
    expect(cardsOf(other, 'p-12-0')).not.toEqual(cardsOf(a, 'p-12-0'));
    const unseeded = buildPool(dataset, { ...settings({ mode: 'oddOneOut' }), seed: undefined }, createRng('rng'));
    expect(unseeded.length).toBeGreaterThan(0);
  });
});
