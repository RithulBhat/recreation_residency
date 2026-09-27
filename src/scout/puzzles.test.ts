import { describe, expect, it } from 'vitest';
import {
  CARD_FAME_FLOOR,
  DEPTH_CHART_CARDS,
  DRAFT_CLASS_CARDS,
  HIGHER_LOWER_VOLUME_STATS,
  MIN_DRAFT_CLASS_YEAR,
  ODD_ONE_OUT_CARDS,
  ODD_TRAITS,
  ODD_TRAIT_LABELS,
  ODD_TRAIT_PROMPTS,
  SCOUT_CHOICE_MODES,
  SCOUT_PUZZLE_MODES,
  TEAMMATE_CARDS,
  buildPuzzleIndex,
  buildScoutPuzzleSpecs,
  cardFameWindows,
  depthChartPuzzle,
  draftClassPuzzle,
  draftClassYears,
  draftYearAccepted,
  higherLowerPuzzle,
  isChoicePuzzle,
  isScoutChoiceMode,
  isScoutPuzzleMode,
  jerseyPuzzle,
  oddOneOutFair,
  oddOneOutPuzzle,
  personCard,
  puzzleAnswerId,
  puzzleCardById,
  puzzleCards,
  statNumber,
  statPreference,
  teammatesPuzzle,
  type ScoutPuzzleIndex,
} from './puzzles';
import {
  DUPLICATE_JERSEY,
  NO_JERSEY_PLAYER_ID,
  TEST_SEASON,
  findTestPlayer,
  findTestTeam,
  makePuzzleDataset,
  type PuzzleTestDataset,
} from './puzzleTestFactory';
import { makePlayer } from './fixtures';
import { createInitialScoutState, reduce } from './engine';
import { normalizeScoutSettings } from './presets';
import { buildPool } from './subjects';
import type { NflPlayer, ScoutMode, ScoutOddTrait, ScoutSettings } from './types';

const SEED = 'puzzle-seed';

function setup(): { dataset: PuzzleTestDataset; index: ScoutPuzzleIndex } {
  const dataset = makePuzzleDataset();
  return { dataset, index: buildPuzzleIndex(dataset) };
}

const recognisable = (p: NflPlayer): boolean => p.fame >= 55;

// ---------------------------------------------------------------------------------------------
// Vocabulary and small helpers
// ---------------------------------------------------------------------------------------------

describe('puzzle vocabulary', () => {
  it('names the six modes and the two that are answered by tapping', () => {
    expect([...SCOUT_PUZZLE_MODES]).toEqual(['teammates', 'depthChart', 'draftClass', 'higherLower', 'oddOneOut', 'jersey']);
    expect([...SCOUT_CHOICE_MODES]).toEqual(['higherLower', 'oddOneOut']);
    for (const m of SCOUT_PUZZLE_MODES) expect(isScoutPuzzleMode(m)).toBe(true);
    for (const m of ['silhouette', 'faceZoom', 'teamTrivia'] as ScoutMode[]) expect(isScoutPuzzleMode(m)).toBe(false);
    expect(isScoutChoiceMode('higherLower')).toBe(true);
    expect(isScoutChoiceMode('teammates')).toBe(false);
    for (const t of ODD_TRAITS) {
      expect(ODD_TRAIT_LABELS[t].length).toBeGreaterThan(0);
      expect(ODD_TRAIT_PROMPTS[t].length).toBeGreaterThan(0);
    }
  });

  it('parses stat displays and prefers volume stats over rate stats', () => {
    expect(statNumber('1,499')).toBe(1499);
    expect(statNumber('102.2')).toBe(102.2);
    expect(statNumber('0')).toBe(0);
    expect(statNumber('—')).toBeNull();
    expect(statNumber('')).toBeNull();
    expect(statPreference('Rec yds')).toBe(0);
    expect(statPreference('Yds/rec')).toBe(1);
    expect(statPreference('Rating')).toBe(1);
    for (const label of HIGHER_LOWER_VOLUME_STATS) expect(statPreference(label)).toBe(0);
  });

  it('accepts a draft year written the ways a fan writes it', () => {
    const accepted = draftYearAccepted(2019);
    expect(accepted).toContain('2019');
    expect(accepted).toContain("'19");
    expect(accepted).toContain('2019 draft class');
    expect(accepted).not.toContain('2018');
  });

  it('bands fame by difficulty, hardest tier lowest, and always ends in a catch-all', () => {
    for (const d of ['any', 'star', 'starter', 'rotation', 'deepCut'] as const) {
      const windows = cardFameWindows(d);
      expect(windows.length).toBeGreaterThanOrEqual(2);
      expect(windows[windows.length - 1]).toEqual({ min: 0, max: 100 });
    }
    expect(cardFameWindows('star')[0].min).toBeGreaterThan(cardFameWindows('any')[0].min);
    expect(cardFameWindows('deepCut')[0].max).toBeLessThan(100);
    expect(cardFameWindows('any')[0].min).toBe(CARD_FAME_FLOOR);
  });

  it('flattens a player into a card without losing anything a stage needs', () => {
    const { dataset } = setup();
    const player = findTestPlayer(dataset, 'p-12-0');
    const card = personCard(player, findTestTeam(dataset, 'KC'));
    expect(card).toMatchObject({ playerId: player.id, name: player.name, pos: player.pos, group: player.group, teamAbbr: 'KC' });
    expect(card.image).toBe(player.headshot);
    expect(card.draftRound).toBe(player.draft?.round);
  });
});

describe('buildPuzzleIndex', () => {
  it('indexes rosters, colleges, classes, rounds, groups and stat boards', () => {
    const { dataset, index } = setup();
    expect(index.byTeam.get('12')).toHaveLength(10);
    expect(index.teamById.get('12')?.abbr).toBe('KC');
    expect(index.playerById.get('p-25-3')?.teamId).toBe('25');
    expect([...index.byCollege.keys()].length).toBeGreaterThanOrEqual(5);
    expect(index.byDraftYear.get(2019)?.every((p) => p.draft?.year === 2019)).toBe(true);
    expect(index.byDraftRound.get('1')?.length).toBeGreaterThanOrEqual(4);
    expect(index.byGroup.get('WR')?.length).toBe(8);
    const board = index.statBoards.get('WR|Rec yds') ?? [];
    expect(board.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < board.length; i++) expect(board[i - 1].value).toBeGreaterThanOrEqual(board[i].value);
    expect(index.statByPlayer.get('p-12-2')?.season).toBe(TEST_SEASON);
    expect(index.jerseyCount.get(`${DUPLICATE_JERSEY.teamId}|${DUPLICATE_JERSEY.jersey}`)).toBe(2);
    expect(dataset.statLines.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// teammates
// ---------------------------------------------------------------------------------------------

describe('teammatesPuzzle', () => {
  it('shows four real teammates, never the answer and never his surname', () => {
    const { dataset, index } = setup();
    for (const player of dataset.players.filter(recognisable)) {
      const puzzle = teammatesPuzzle(index, player, { seed: SEED });
      expect(puzzle, player.name).not.toBeNull();
      const cards = puzzle!.cards;
      expect(cards).toHaveLength(TEAMMATE_CARDS);
      expect(new Set(cards.map((c) => c.playerId)).size).toBe(TEAMMATE_CARDS);
      for (const card of cards) {
        expect(card.playerId).not.toBe(player.id);
        expect(card.teamId).toBe(player.teamId);
        expect(card.name.split(' ').slice(-1)[0]).not.toBe(player.last);
        expect(index.playerById.get(card.playerId)!.fame).toBeGreaterThanOrEqual(CARD_FAME_FLOOR);
      }
    }
  });

  it('is deterministic under a seed and moves with it', () => {
    const { dataset, index } = setup();
    const player = findTestPlayer(dataset, 'p-12-0');
    const a = teammatesPuzzle(index, player, { seed: SEED })!;
    const b = teammatesPuzzle(index, player, { seed: SEED })!;
    expect(b).toEqual(a);
    const other = teammatesPuzzle(index, player, { seed: 'different' })!;
    expect(other.cards.map((c) => c.playerId)).not.toEqual(a.cards.map((c) => c.playerId));
  });

  it('falls back out of a band too thin to fill, rather than dropping the round', () => {
    const { dataset, index } = setup();
    // 'star' asks for fame >= 70: only three men per roster clear it, and a set needs four.
    const player = findTestPlayer(dataset, 'p-12-0');
    const puzzle = teammatesPuzzle(index, player, { seed: SEED, windows: cardFameWindows('star') });
    expect(puzzle).not.toBeNull();
    expect(puzzle!.cards).toHaveLength(TEAMMATE_CARDS);
  });
});

// ---------------------------------------------------------------------------------------------
// depthChart
// ---------------------------------------------------------------------------------------------

describe('depthChartPuzzle', () => {
  it('puts five men off one roster on the board, spread across position groups', () => {
    const { dataset, index } = setup();
    for (const team of dataset.teams) {
      const puzzle = depthChartPuzzle(index, team, { seed: SEED });
      expect(puzzle, team.abbr).not.toBeNull();
      const cards = puzzle!.cards;
      expect(cards).toHaveLength(DEPTH_CHART_CARDS);
      expect(cards.every((c) => c.teamId === team.id)).toBe(true);
      expect(new Set(cards.map((c) => c.group)).size).toBeGreaterThanOrEqual(4);
      for (const c of cards) expect(index.playerById.get(c.playerId)!.fame).toBeGreaterThanOrEqual(CARD_FAME_FLOOR);
    }
  });

  it('is deterministic under a seed', () => {
    const { dataset, index } = setup();
    const team = findTestTeam(dataset, 'PHI');
    expect(depthChartPuzzle(index, team, { seed: SEED })).toEqual(depthChartPuzzle(index, team, { seed: SEED }));
  });
});

// ---------------------------------------------------------------------------------------------
// draftClass
// ---------------------------------------------------------------------------------------------

describe('draftClassPuzzle', () => {
  it('refuses a class older than 2011 and fills the modern ones', () => {
    const { index } = setup();
    expect(draftClassPuzzle(index, 2009, { seed: SEED })).toBeNull();
    expect(draftClassPuzzle(index, MIN_DRAFT_CLASS_YEAR - 1, { seed: SEED })).toBeNull();
    const years = draftClassYears(index, { seed: SEED });
    expect(years).not.toContain(2009);
    expect(years).toContain(2019);
    expect(years).toContain(2022);
    for (const y of years) expect(y).toBeGreaterThanOrEqual(MIN_DRAFT_CLASS_YEAR);
  });

  it('shows four men all taken in that year, and anchors on the most recognisable', () => {
    const { index } = setup();
    for (const year of draftClassYears(index, { seed: SEED })) {
      const built = draftClassPuzzle(index, year, { seed: SEED })!;
      expect(built.puzzle.year).toBe(year);
      expect(built.puzzle.cards).toHaveLength(DRAFT_CLASS_CARDS);
      for (const card of built.puzzle.cards) {
        expect(index.playerById.get(card.playerId)!.draft?.year).toBe(year);
      }
      const ids = built.puzzle.cards.map((c) => c.playerId);
      expect(ids).toContain(built.anchor.id);
      const fames = ids.map((id) => index.playerById.get(id)!.fame);
      expect(built.anchor.fame).toBe(Math.max(...fames));
      const earliest = built.puzzle.earliest!;
      for (const card of built.puzzle.cards) {
        const d = index.playerById.get(card.playerId)!.draft!;
        expect(d.round > earliest.round || (d.round === earliest.round && d.pick >= earliest.pick)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// higherLower
// ---------------------------------------------------------------------------------------------

describe('higherLowerPuzzle', () => {
  it('never compares across position groups, never ties, and the answer is the bigger number', () => {
    const { dataset, index } = setup();
    let built = 0;
    for (const player of dataset.players) {
      const puzzle = higherLowerPuzzle(index, player, { seed: SEED });
      if (!puzzle) continue;
      built += 1;
      const [left, right] = puzzle.cards;
      expect(left.group).toBe(right.group);
      expect(puzzle.group).toBe(left.group);
      expect(left.playerId).not.toBe(right.playerId);
      expect(puzzle.numbers[0]).not.toBe(puzzle.numbers[1]);
      expect(statNumber(puzzle.values[0])).toBe(puzzle.numbers[0]);
      expect(statNumber(puzzle.values[1])).toBe(puzzle.numbers[1]);
      // the answer is the subject AND the bigger of the two
      expect(puzzle.answerPlayerId).toBe(player.id);
      const answerIndex = puzzle.cards.findIndex((c) => c.playerId === puzzle.answerPlayerId);
      expect(answerIndex).toBeGreaterThanOrEqual(0);
      expect(puzzle.numbers[answerIndex]).toBe(Math.max(...puzzle.numbers));
      // both men really carry that label, in that season
      for (const card of puzzle.cards) {
        const line = index.statByPlayer.get(card.playerId)!;
        expect(line.season).toBe(puzzle.season);
        expect(line.stats.some(([label]) => label === puzzle.statLabel)).toBe(true);
      }
      expect(statPreference(puzzle.statLabel)).toBe(0);
    }
    expect(built).toBeGreaterThanOrEqual(8);
  });

  it('puts the answer on both sides across a run, so the side is never the tell', () => {
    const { dataset, index } = setup();
    const sides = dataset.players
      .map((p) => higherLowerPuzzle(index, p, { seed: SEED }))
      .filter((p) => p !== null)
      .map((p) => p!.cards.findIndex((c) => c.playerId === p!.answerPlayerId));
    expect(new Set(sides).size).toBe(2);
  });

  it('returns null for a man with no stat line, and is deterministic under a seed', () => {
    const { dataset, index } = setup();
    const noStats = findTestPlayer(dataset, 'p-12-5');
    expect(index.statByPlayer.has(noStats.id)).toBe(false);
    expect(higherLowerPuzzle(index, noStats, { seed: SEED })).toBeNull();
    const withStats = findTestPlayer(dataset, 'p-12-2');
    expect(higherLowerPuzzle(index, withStats, { seed: SEED })).toEqual(higherLowerPuzzle(index, withStats, { seed: SEED }));
  });
});

// ---------------------------------------------------------------------------------------------
// oddOneOut
// ---------------------------------------------------------------------------------------------

describe('oddOneOutPuzzle', () => {
  it('builds a fair set for every recognisable subject and rotates the trait', () => {
    const { dataset, index } = setup();
    const traits = new Set<ScoutOddTrait>();
    for (const player of dataset.players.filter(recognisable)) {
      const puzzle = oddOneOutPuzzle(index, player, { seed: SEED });
      expect(puzzle, player.name).not.toBeNull();
      traits.add(puzzle!.trait);
      expect(puzzle!.cards).toHaveLength(ODD_ONE_OUT_CARDS);
      expect(puzzle!.answerPlayerId).toBe(player.id);
      expect(puzzle!.cards.map((c) => c.playerId)).toContain(player.id);
      expect(puzzle!.ruleOutIds).toHaveLength(ODD_ONE_OUT_CARDS - 1);
      expect(puzzle!.ruleOutIds).not.toContain(player.id);
      expect(new Set(puzzle!.ruleOutIds).size).toBe(ODD_ONE_OUT_CARDS - 1);
      expect(puzzle!.traitLabel).toBe(ODD_TRAIT_LABELS[puzzle!.trait]);
      expect(puzzle!.sharedValue.length).toBeGreaterThan(0);
      // the three wrong cards really do share the trait, and the answer really does not
      const cards = puzzle!.cards.map((c) => index.playerById.get(c.playerId)!);
      const answerIndex = cards.findIndex((c) => c.id === player.id);
      expect(oddOneOutFair([cards[answerIndex], ...cards.filter((c) => c.id !== player.id)], puzzle!.trait)).toBe(true);
    }
    expect(traits.size).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic under a seed', () => {
    const { dataset, index } = setup();
    const player = findTestPlayer(dataset, 'p-2-1');
    const a = oddOneOutPuzzle(index, player, { seed: SEED });
    expect(oddOneOutPuzzle(index, player, { seed: SEED })).toEqual(a);
  });

  it('rejects a set whose other dimensions point at a different man', () => {
    const at = (over: Partial<NflPlayer>): NflPlayer =>
      makePlayer({ teamId: '12', college: 'Alabama', pos: 'WR', draft: { year: 2020, round: 1, pick: 5 }, fame: 60, ...over });
    // trait = team: the outlier is the only Bill, which is exactly what the round asks about.
    const answer = at({ id: 'a', name: 'Aaron Answer', teamId: '2' });
    const fair = [
      answer,
      at({ id: 'b', name: 'Bo Brown' }),
      at({ id: 'c', name: 'Cal Carter' }),
      at({ id: 'd', name: 'Dee Dawson' }),
    ];
    expect(oddOneOutFair(fair, 'team')).toBe(true);

    // …but give ONE of the wrong cards a college of his own and the set has two defensible answers.
    const ambiguous = [answer, fair[1], fair[2], at({ id: 'e', name: 'Eli Ellis', college: 'Oregon' })];
    expect(oddOneOutFair(ambiguous, 'team')).toBe(false);

    // the intended outlier has to be the one that differs on the trait
    expect(oddOneOutFair([fair[1], answer, fair[2], fair[3]], 'team')).toBe(false);
    // a missing value (no college on one card) is not something the guard can reason about
    expect(oddOneOutFair([answer, fair[1], fair[2], at({ id: 'f', name: 'Fin Fox', college: undefined })], 'team')).toBe(false);
    // duplicates, two men with one surname, and the wrong set size are all refused
    expect(oddOneOutFair([answer, answer, fair[1], fair[2]], 'team')).toBe(false);
    expect(oddOneOutFair([answer, fair[1], fair[2], at({ id: 'g', name: 'Gus Brown' })], 'team')).toBe(false);
    expect(oddOneOutFair([answer, fair[1], fair[2]], 'team')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// jersey
// ---------------------------------------------------------------------------------------------

describe('jerseyPuzzle', () => {
  it('needs a number and a club, and refuses a number worn twice on one roster', () => {
    const { dataset, index } = setup();
    const star = findTestPlayer(dataset, 'p-12-0');
    const puzzle = jerseyPuzzle(index, star)!;
    expect(puzzle.number).toBe(star.jersey);
    expect(puzzle.pos).toBe(star.pos);
    expect(puzzle.group).toBe(star.group);
    expect(puzzle.colors[0]).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(puzzle.colors[1]).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(puzzle.colors[0].toLowerCase()).not.toBe(puzzle.colors[1].toLowerCase());

    expect(jerseyPuzzle(index, findTestPlayer(dataset, NO_JERSEY_PLAYER_ID))).toBeNull();
    expect(jerseyPuzzle(index, findTestPlayer(dataset, 'p-12-6'))).toBeNull();
    expect(jerseyPuzzle(index, findTestPlayer(dataset, 'p-12-7'))).toBeNull();
    const orphan = { ...star, teamId: 'nope' };
    expect(jerseyPuzzle(index, orphan)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// buildScoutPuzzleSpecs
// ---------------------------------------------------------------------------------------------

describe('buildScoutPuzzleSpecs', () => {
  const request = (over: Partial<Parameters<typeof buildScoutPuzzleSpecs>[0]> = {}) => {
    const { dataset, index } = setup();
    return buildScoutPuzzleSpecs({
      dataset,
      index,
      modes: [...SCOUT_PUZZLE_MODES],
      difficulty: 'any',
      seed: SEED,
      playerEligible: recognisable,
      ...over,
    });
  };

  it('ignores the reveal modes and covers every puzzle mode it is asked for', () => {
    expect(buildScoutPuzzleSpecs({ dataset: makePuzzleDataset(), modes: ['silhouette', 'logoZoom'], difficulty: 'any' })).toEqual([]);
    const specs = request();
    const modes = new Set(specs.map((s) => s.mode));
    expect([...modes].sort()).toEqual([...SCOUT_PUZZLE_MODES].sort());
    for (const spec of specs) {
      expect(spec.puzzle.type).toBe(spec.mode);
      if (spec.mode === 'depthChart') expect(spec.team).toBeDefined();
      else expect(spec.player).toBeDefined();
      if (spec.mode === 'draftClass') {
        expect(spec.answer?.name).toBe(String(spec.puzzle.type === 'draftClass' ? spec.puzzle.year : 0));
        expect(spec.answer?.accepted.length).toBeGreaterThan(2);
      } else {
        expect(spec.answer).toBeUndefined();
      }
    }
  });

  it('honours the answer-side eligibility it is handed', () => {
    const only = 'p-25-2';
    const specs = request({ playerEligible: (p) => p.id === only });
    const playerModes = specs.filter((s) => s.mode !== 'depthChart' && s.mode !== 'draftClass');
    expect(playerModes.length).toBeGreaterThan(0);
    for (const spec of playerModes) expect(spec.player?.id).toBe(only);
    // a club filter gates the depth charts
    const one = request({ teamEligible: (t) => t.abbr === 'SF' });
    expect(one.filter((s) => s.mode === 'depthChart')).toHaveLength(1);
  });

  it('caps each mode and is deterministic for a seed', () => {
    const capped = request({ limit: 2 });
    for (const mode of ['teammates', 'higherLower', 'oddOneOut', 'jersey'] as const) {
      expect(capped.filter((s) => s.mode === mode).length).toBeLessThanOrEqual(2);
    }
    expect(request()).toEqual(request());
    const other = buildScoutPuzzleSpecs({
      dataset: makePuzzleDataset(),
      modes: ['teammates'],
      difficulty: 'any',
      seed: 'another-seed',
      playerEligible: recognisable,
    });
    const mine = request({ modes: ['teammates'] });
    expect(other.map((s) => s.player?.id)).not.toEqual(mine.map((s) => s.player?.id));
  });

  it('reads a payload back the way a stage does', () => {
    const specs = request({ modes: ['oddOneOut', 'jersey', 'higherLower'] });
    const odd = specs.find((s) => s.mode === 'oddOneOut')!;
    expect(puzzleCards(odd.puzzle)).toHaveLength(ODD_ONE_OUT_CARDS);
    expect(puzzleAnswerId(odd.puzzle)).toBe(odd.player?.id);
    expect(isChoicePuzzle(odd.puzzle)).toBe(true);
    expect(puzzleCardById(odd.puzzle, odd.player!.id)?.playerId).toBe(odd.player!.id);
    expect(puzzleCardById(odd.puzzle, 'nobody')).toBeUndefined();
    const jersey = specs.find((s) => s.mode === 'jersey')!;
    expect(puzzleCards(jersey.puzzle)).toEqual([]);
    expect(puzzleAnswerId(jersey.puzzle)).toBeUndefined();
    expect(isChoicePuzzle(jersey.puzzle)).toBe(false);
    const hl = specs.find((s) => s.mode === 'higherLower')!;
    expect(puzzleAnswerId(hl.puzzle)).toBe(hl.player?.id);
  });
});

// ---------------------------------------------------------------------------------------------
// End to end: pool → engine → round
// ---------------------------------------------------------------------------------------------

describe('a choice-shaped run through the engine', () => {
  const settingsFor = (mode: ScoutMode): ScoutSettings =>
    normalizeScoutSettings({ mode, packIds: ['household-names', 'franchises-all'], tries: 4, rounds: 3, seed: 'e2e-seed' });

  it('opens a round of every choice-shaped mode, with its payload and its ladder', () => {
    for (const mode of SCOUT_PUZZLE_MODES) {
      const settings = settingsFor(mode);
      const pool = buildPool(makePuzzleDataset(), settings);
      expect(pool.length, mode).toBeGreaterThan(0);
      const state = reduce(createInitialScoutState(), { type: 'start', settings, subjects: pool, now: 1000 });
      expect(state.status).toBe('playing');
      const round = state.rounds[0];
      expect(round.mode).toBe(mode);
      expect(round.subject.puzzle?.type).toBe(mode);
      expect(round.stages).toHaveLength(4);
      expect(round.stages[0].clues.length).toBeLessThanOrEqual(round.stages[3].clues.length);
    }
  });

  it('marks a tapped card correct when it is the answer, and burns a try when it is not', () => {
    const settings = settingsFor('oddOneOut');
    const pool = buildPool(makePuzzleDataset(), settings);
    const started = reduce(createInitialScoutState(), { type: 'start', settings, subjects: pool, now: 1000 });
    const puzzle = started.rounds[0].subject.puzzle;
    if (puzzle?.type !== 'oddOneOut') throw new Error('expected an oddOneOut round');
    const wrong = puzzle.cards.find((c) => c.playerId !== puzzle.answerPlayerId)!;
    const right = puzzle.cards.find((c) => c.playerId === puzzle.answerPlayerId)!;

    // this is exactly what the stage does: `guess(card.name)`
    const missed = reduce(started, { type: 'guess', text: wrong.name, now: 2000 });
    expect(missed.rounds[0].status).toBe('playing');
    expect(missed.rounds[0].tryIndex).toBe(1);
    const won = reduce(missed, { type: 'guess', text: right.name, now: 3000 });
    expect(won.rounds[0].status).toBe('won');
  });

  it('answers a draft class with the year, not with anyone on the board', () => {
    const settings = settingsFor('draftClass');
    const pool = buildPool(makePuzzleDataset(), settings);
    const started = reduce(createInitialScoutState(), { type: 'start', settings, subjects: pool, now: 1000 });
    const puzzle = started.rounds[0].subject.puzzle;
    if (puzzle?.type !== 'draftClass') throw new Error('expected a draftClass round');
    const wrong = reduce(started, { type: 'guess', text: puzzle.cards[0].name, now: 2000 });
    expect(wrong.rounds[0].status).toBe('playing');
    const right = reduce(wrong, { type: 'guess', text: String(puzzle.year), now: 3000 });
    expect(right.rounds[0].status).toBe('won');
  });
});
