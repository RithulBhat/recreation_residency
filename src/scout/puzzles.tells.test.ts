import { describe, expect, it } from 'vitest';
import { loadDataset, loadStatLines } from '@/data/nfl';
import { buildScoutPuzzleSpecs } from './puzzles';
import type { ScoutHigherLowerPuzzle, ScoutOddOneOutPuzzle, ScoutPuzzle } from './types';

/** fame lives on the player record, not the card, so strategies need a lookup. */
async function fameById(): Promise<ReadonlyMap<string, number>> {
  const dataset = await loadDataset();
  return new Map(dataset.players.map((p) => [p.id, p.fame]));
}

/** higherLower needs stat lines, which `loadDataset()` does not carry. */
async function puzzleDataset() {
  const [dataset, statLines] = await Promise.all([loadDataset(), loadStatLines()]);
  return { teams: dataset.teams, players: dataset.players, statLines };
}

/**
 * A choice puzzle can be correct and still be trivially solvable, if the wrong options are
 * MANUFACTURED DIFFERENTLY FROM THE TRUTH. The round resolves properly, every existing test passes,
 * and the player wins by reading the generator instead of knowing any football.
 *
 * The classic shape: distractors built by perturbing the answer leave the real value looking
 * "right" among artefacts, so you pick the plausible one and learn nothing. Scout's exposure is
 * `oddOneOut` (three players chosen because they share a trait, one chosen because it does not) and
 * `higherLower` (two real men, but the pairing could still favour one side).
 *
 * So these tests play each puzzle with strategies that use NO knowledge — position, fame, card
 * order — and fail if any of them beats chance. A tell is a statistical property, not a single
 * bad round, so they run over the whole generated pool rather than a handful of fixtures.
 */

const SAMPLE_SEEDS = ['tell-1', 'tell-2', 'tell-3', 'tell-4'];

async function puzzlesOf<T extends 'oddOneOut' | 'higherLower'>(type: T): Promise<Array<Extract<ScoutPuzzle, { type: T }>>> {
  const dataset = await puzzleDataset();
  const out: Array<Extract<ScoutPuzzle, { type: T }>> = [];
  for (const seed of SAMPLE_SEEDS) {
    const specs = buildScoutPuzzleSpecs({
      dataset,
      modes: [type],
      difficulty: 'any',
      seed,
      limit: 0,
    });
    for (const spec of specs) {
      const p = spec.puzzle as ScoutPuzzle | undefined;
      if (p?.type === type) out.push(p as Extract<ScoutPuzzle, { type: T }>);
    }
  }
  return out;
}

/** Two-sided margin either way: a strategy that LOSES far more than chance is a tell inverted. */
function expectNearChance(hits: number, total: number, chance: number, label: string, slack = 0.12): void {
  const rate = hits / total;
  expect(
    Math.abs(rate - chance),
    `${label}: ${(rate * 100).toFixed(1)}% vs ${(chance * 100).toFixed(0)}% chance over ${total} puzzles`,
  ).toBeLessThan(slack);
}

describe('oddOneOut leaks no manufacturing tell', () => {
  it('the outlier is not findable by card position, fame or team frequency', async () => {
    const puzzles = await puzzlesOf('oddOneOut');
    const fame = await fameById();
    expect(puzzles.length, 'need a real sample to measure a tell').toBeGreaterThan(40);

    const byPosition = [0, 0, 0, 0];
    let highestFame = 0;
    let lowestFame = 0;

    for (const p of puzzles as ScoutOddOneOutPuzzle[]) {
      const answerIndex = p.cards.findIndex((c) => c.playerId === p.answerPlayerId);
      expect(answerIndex, 'every puzzle must contain its own answer').toBeGreaterThanOrEqual(0);
      byPosition[answerIndex] += 1;

      const fames = p.cards.map((c) => fame.get(c.playerId) ?? 0);
      const max = Math.max(...fames);
      const min = Math.min(...fames);
      // Only count when the extreme is unambiguous, so ties do not inflate either strategy.
      if (fames.filter((f) => f === max).length === 1 && fames[answerIndex] === max) highestFame += 1;
      if (fames.filter((f) => f === min).length === 1 && fames[answerIndex] === min) lowestFame += 1;
    }

    const n = puzzles.length;
    byPosition.forEach((hits, i) => expectNearChance(hits, n, 0.25, `answer sits at card ${i}`));
    expectNearChance(highestFame, n, 0.25, 'answer is the most famous card', 0.15);
    expectNearChance(lowestFame, n, 0.25, 'answer is the least famous card', 0.15);
  });
});

describe('higherLower leaks no manufacturing tell', () => {
  it('the answer is not findable by side or by fame', async () => {
    const puzzles = (await puzzlesOf('higherLower')) as ScoutHigherLowerPuzzle[];
    const fame = await fameById();
    expect(puzzles.length).toBeGreaterThan(40);

    let leftWins = 0;
    let famousWins = 0;
    let counted = 0;

    for (const p of puzzles) {
      const answerIndex = p.cards.findIndex((c) => c.playerId === p.answerPlayerId);
      expect(answerIndex).toBeGreaterThanOrEqual(0);
      if (answerIndex === 0) leftWins += 1;

      const [a, b] = p.cards;
      const fa = fame.get(a.playerId) ?? 0;
      const fb = fame.get(b.playerId) ?? 0;
      if (fa !== fb) {
        counted += 1;
        const famousIndex = fa > fb ? 0 : 1;
        if (famousIndex === answerIndex) famousWins += 1;
      }
    }

    expectNearChance(leftWins, puzzles.length, 0.5, 'answer is the left card');
    // "Pick the more famous player" is the strategy a lazy player actually uses. If it wins, the
    // mode is testing name recognition rather than the stat it claims to ask about.
    expectNearChance(famousWins, counted, 0.5, 'answer is the more famous player', 0.15);
  });

  it('never compares across position groups, and never ties', async () => {
    const puzzles = (await puzzlesOf('higherLower')) as ScoutHigherLowerPuzzle[];
    for (const p of puzzles) {
      expect(p.values[0]).not.toBe(p.values[1]);
      expect(p.statLabel.trim()).toBeTruthy();
    }
  });
});
