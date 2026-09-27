import { describe, expect, it } from 'vitest';
import playersJson from '@/data/nfl/players.json';
import statlinesJson from '@/data/nfl/statlines.json';
import teamsJson from '@/data/nfl/teams.json';
import {
  CARD_FAME_FLOOR,
  DEPTH_CHART_CARDS,
  DRAFT_CLASS_CARDS,
  MIN_DRAFT_CLASS_YEAR,
  ODD_TRAITS,
  SCOUT_PUZZLE_MODES,
  buildPuzzleIndex,
  buildScoutPuzzleSpecs,
  draftClassYears,
  jerseyPuzzle,
  oddOneOutFair,
  oddOneOutPuzzle,
  statNumber,
  teammatesPuzzle,
  type ScoutPuzzleDataset,
} from './puzzles';
import type { NflPlayer, NflTeam, ScoutOddTrait, StatLine } from './types';

/**
 * The guard rails from the data survey, checked against the SHIPPED dataset rather than a fixture.
 *
 * The survey measured what the six choice-shaped modes can and cannot be built from
 * (460 recognisable players, 32 rosters, 15 usable draft classes, 299 stat lines skewed to
 * receivers, 451 jersey numbers). These tests are the executable version of that note: if a roster
 * sync ever thins the data out under one of them, this file fails instead of the game.
 */

const dataset: ScoutPuzzleDataset = {
  players: playersJson as unknown as NflPlayer[],
  teams: teamsJson as unknown as NflTeam[],
  statLines: statlinesJson as unknown as StatLine[],
};

const index = buildPuzzleIndex(dataset);
const SEED = 'daily-2026-09-26';
/** The pool the survey called recognisable. */
const RECOGNISABLE_FAME = 55;
const recognisable = dataset.players.filter((p) => p.fame >= RECOGNISABLE_FAME);

describe('the shipped dataset can fill every choice-shaped mode', () => {
  it('has the pool the survey measured', () => {
    expect(dataset.players.length).toBeGreaterThan(2000);
    expect(dataset.teams).toHaveLength(32);
    expect(recognisable.length).toBeGreaterThanOrEqual(400);
  });

  it('gives every recognisable player four teammates who are themselves nameable', () => {
    for (const player of recognisable) {
      const puzzle = teammatesPuzzle(index, player, { seed: SEED });
      expect(puzzle, player.name).not.toBeNull();
      for (const card of puzzle!.cards) {
        expect(card.teamId).toBe(player.teamId);
        expect(card.playerId).not.toBe(player.id);
        expect(index.playerById.get(card.playerId)!.fame).toBeGreaterThanOrEqual(CARD_FAME_FLOOR);
      }
    }
  });

  it('gives all 32 franchises a five-man depth chart', () => {
    const specs = buildScoutPuzzleSpecs({ dataset, index, modes: ['depthChart'], difficulty: 'any', seed: SEED });
    expect(specs).toHaveLength(32);
    for (const spec of specs) {
      expect(spec.puzzle.type).toBe('depthChart');
      if (spec.puzzle.type !== 'depthChart') continue;
      expect(spec.puzzle.cards).toHaveLength(DEPTH_CHART_CARDS);
      expect(spec.puzzle.cards.every((c) => c.teamId === spec.team!.id)).toBe(true);
    }
  });

  it('never offers a draft class older than 2011, and offers at least a dozen', () => {
    const years = draftClassYears(index, { seed: SEED });
    expect(years.length).toBeGreaterThanOrEqual(12);
    for (const year of years) expect(year).toBeGreaterThanOrEqual(MIN_DRAFT_CLASS_YEAR);
    // and the pre-2011 classes that DO have four men on a roster are still refused
    const eleven = index.byDraftYear.get(2010) ?? [];
    expect(eleven.length).toBeGreaterThan(0);
    expect(years).not.toContain(2010);
  });

  it('only ever compares two men of the same position group, and never a tie', () => {
    const specs = buildScoutPuzzleSpecs({
      dataset,
      index,
      modes: ['higherLower'],
      difficulty: 'any',
      seed: SEED,
      playerEligible: (p) => p.fame >= RECOGNISABLE_FAME,
      limit: 0,
    });
    expect(specs.length).toBeGreaterThanOrEqual(150);
    for (const spec of specs) {
      const puzzle = spec.puzzle;
      if (puzzle.type !== 'higherLower') continue;
      const [left, right] = puzzle.cards;
      expect(left.group).toBe(right.group);
      expect(left.group).toBe(spec.player!.group);
      expect(puzzle.numbers[0]).not.toBe(puzzle.numbers[1]);
      const answerIndex = puzzle.cards.findIndex((c) => c.playerId === puzzle.answerPlayerId);
      expect(puzzle.numbers[answerIndex]).toBe(Math.max(...puzzle.numbers));
      expect(statNumber(puzzle.values[answerIndex])).toBe(puzzle.numbers[answerIndex]);
      // the two stat lines are from the same season, or the numbers are not comparable
      expect(index.statByPlayer.get(left.playerId)!.season).toBe(puzzle.season);
      expect(index.statByPlayer.get(right.playerId)!.season).toBe(puzzle.season);
    }
  });

  it('builds a fair odd-one-out for every recognisable player, across all four traits', () => {
    const traits = new Set<ScoutOddTrait>();
    let built = 0;
    for (const player of recognisable) {
      const puzzle = oddOneOutPuzzle(index, player, { seed: SEED });
      if (!puzzle) continue;
      built += 1;
      traits.add(puzzle.trait);
      const cards = puzzle.cards.map((c) => index.playerById.get(c.playerId)!);
      const answer = cards.find((c) => c.id === player.id)!;
      const others = cards.filter((c) => c.id !== player.id);
      expect(oddOneOutFair([answer, ...others], puzzle.trait), `${player.name} / ${puzzle.trait}`).toBe(true);
      expect(puzzle.ruleOutIds).not.toContain(player.id);
    }
    expect(built).toBe(recognisable.length);
    expect([...traits].sort()).toEqual([...ODD_TRAITS].sort());
  });

  it('asks a jersey number only when the man has one and nobody beside him wears it', () => {
    let asked = 0;
    let skipped = 0;
    for (const player of recognisable) {
      const puzzle = jerseyPuzzle(index, player);
      if (!puzzle) {
        skipped += 1;
        const shared = (index.jerseyCount.get(`${player.teamId}|${player.jersey ?? ''}`) ?? 0) > 1;
        expect(!player.jersey || shared || !index.teamById.has(player.teamId)).toBe(true);
        continue;
      }
      asked += 1;
      expect(puzzle.number).toBe(player.jersey);
      expect(puzzle.number).not.toBe('');
      expect(puzzle.colors[0]).toMatch(/^#[0-9a-f]{3,8}$/i);
    }
    // the survey counted 451 of 460 with a number; a handful more are dropped for sharing one
    expect(asked).toBeGreaterThanOrEqual(recognisable.length - 30);
    expect(asked + skipped).toBe(recognisable.length);
  });

  it('is deterministic: the same seed builds the same board, a different seed does not', () => {
    const build = (seed: string) =>
      buildScoutPuzzleSpecs({
        dataset,
        index,
        modes: [...SCOUT_PUZZLE_MODES],
        difficulty: 'any',
        seed,
        playerEligible: (p) => p.fame >= RECOGNISABLE_FAME,
        limit: 20,
      });
    const a = build(SEED);
    expect(build(SEED)).toEqual(a);
    const b = build('daily-2026-09-27');
    expect(b.map((s) => `${s.mode}:${s.player?.id ?? s.team?.id}`)).not.toEqual(
      a.map((s) => `${s.mode}:${s.player?.id ?? s.team?.id}`),
    );
    // every draft class on the board is a real four-man class
    for (const spec of a) {
      if (spec.puzzle.type !== 'draftClass') continue;
      expect(spec.puzzle.cards).toHaveLength(DRAFT_CLASS_CARDS);
      expect(spec.puzzle.year).toBeGreaterThanOrEqual(MIN_DRAFT_CLASS_YEAR);
    }
  });

  it('builds a full six-mode board fast enough to start a game on', () => {
    const started = Date.now();
    const specs = buildScoutPuzzleSpecs({
      dataset,
      modes: [...SCOUT_PUZZLE_MODES],
      difficulty: 'any',
      seed: SEED,
      playerEligible: (p) => p.fame >= RECOGNISABLE_FAME,
    });
    expect(specs.length).toBeGreaterThan(300);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
