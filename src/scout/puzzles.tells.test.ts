import { describe, expect, it } from 'vitest';
import { loadDataset, loadStatLines } from '@/data/nfl';
import { buildScoutPuzzleSpecs } from './puzzles';
import type {
  ScoutDifficulty,
  ScoutHigherLowerPuzzle,
  ScoutOddOneOutPuzzle,
  ScoutPuzzle,
} from './types';

/**
 * A choice puzzle can be correct and still be trivially solvable, if the wrong options are
 * MANUFACTURED DIFFERENTLY FROM THE TRUTH. The round resolves properly, every other test passes,
 * and the player wins by reading the generator instead of knowing any football.
 *
 * This file plays each choice puzzle with strategies that use NO knowledge — card position, fame
 * rank, distance from the group's centre — and fails if any of them beats chance. Three lessons are
 * encoded here rather than left to memory:
 *
 * 1. CORRECTNESS IS NOT DETECTABILITY. `oddOneOutFair` already proved no set had a second valid
 *    outlier on any of four dimensions. It passed while the answer was the least famous card 72% of
 *    the time, because the outlier came from the answer pool and the other three from a
 *    fame-floored window. Two manufacturing processes, and the gap between them was the answer.
 *
 * 2. THE MEASUREMENT IS TWO-SIDED. A strategy that loses far more than chance is the same tell read
 *    backwards: if "pick the most famous" wins 8%, then "avoid the most famous" wins 92%.
 *
 * 3. FIXING ONE AXIS CAN OPEN ANOTHER. Banding the cards around the outlier closed the fame tell,
 *    but a band centred on the answer could just as easily make the answer reliably the CENTRAL
 *    value — so centrality is measured too. And every strategy is measured PER DIFFICULTY, because
 *    one aggregate number can average a tier-sized leak away to nothing.
 */

const SEEDS = ['tell-1', 'tell-2', 'tell-3', 'tell-4'];
const TIERS: ScoutDifficulty[] = ['any', 'star', 'starter', 'rotation', 'deepCut'];

/** A tier too thin to measure is not evidence of anything either way. */
const MIN_SAMPLE = 40;

async function puzzleDataset() {
  const [dataset, statLines] = await Promise.all([loadDataset(), loadStatLines()]);
  return { teams: dataset.teams, players: dataset.players, statLines };
}

/** fame lives on the player record, not the card, so the strategies need a lookup. */
async function fameById(): Promise<ReadonlyMap<string, number>> {
  const dataset = await loadDataset();
  return new Map(dataset.players.map((p) => [p.id, p.fame]));
}

function puzzlesOf<T extends 'oddOneOut' | 'higherLower'>(
  dataset: Awaited<ReturnType<typeof puzzleDataset>>,
  type: T,
  difficulty: ScoutDifficulty,
): Array<Extract<ScoutPuzzle, { type: T }>> {
  const out: Array<Extract<ScoutPuzzle, { type: T }>> = [];
  for (const seed of SEEDS) {
    for (const spec of buildScoutPuzzleSpecs({ dataset, modes: [type], difficulty, seed, limit: 0 })) {
      if (spec.puzzle.type === type) out.push(spec.puzzle as Extract<ScoutPuzzle, { type: T }>);
    }
  }
  return out;
}

function expectNearChance(hits: number, total: number, chance: number, label: string, slack: number): void {
  if (total === 0) return;
  const rate = hits / total;
  expect(
    Math.abs(rate - chance),
    `${label}: ${(rate * 100).toFixed(1)}% vs ${(chance * 100).toFixed(0)}% chance over ${total} rounds`,
  ).toBeLessThan(slack);
}

describe('oddOneOut leaks no manufacturing tell', () => {
  it.each(TIERS)('at difficulty "%s" the outlier is not findable without knowledge', async (difficulty) => {
    const dataset = await puzzleDataset();
    const fame = await fameById();
    const puzzles = puzzlesOf(dataset, 'oddOneOut', difficulty) as ScoutOddOneOutPuzzle[];
    if (puzzles.length < MIN_SAMPLE) return;

    const byPosition = [0, 0, 0, 0];
    let mostFamous = 0;
    let leastFamous = 0;
    let nearestCentre = 0;
    let farthestFromCentre = 0;

    for (const p of puzzles) {
      const answerIndex = p.cards.findIndex((c) => c.playerId === p.answerPlayerId);
      expect(answerIndex, 'every puzzle must contain its own answer').toBeGreaterThanOrEqual(0);
      byPosition[answerIndex] += 1;

      const fames = p.cards.map((c) => fame.get(c.playerId) ?? 0);
      const max = Math.max(...fames);
      const min = Math.min(...fames);
      // Count only unambiguous extremes, so ties cannot inflate a strategy's apparent edge.
      if (fames.filter((f) => f === max).length === 1 && fames[answerIndex] === max) mostFamous += 1;
      if (fames.filter((f) => f === min).length === 1 && fames[answerIndex] === min) leastFamous += 1;

      // Centrality. Cards are drawn from a band centred on the outlier, which could make the answer
      // reliably the middle value — the tell the fame fix might itself have introduced.
      const mean = fames.reduce((a, b) => a + b, 0) / fames.length;
      const away = fames.map((f) => Math.abs(f - mean));
      const nearest = Math.min(...away);
      const farthest = Math.max(...away);
      if (away.filter((d) => d === nearest).length === 1 && away[answerIndex] === nearest) nearestCentre += 1;
      if (away.filter((d) => d === farthest).length === 1 && away[answerIndex] === farthest) farthestFromCentre += 1;
    }

    const n = puzzles.length;
    byPosition.forEach((hits, i) => expectNearChance(hits, n, 0.25, `[${difficulty}] answer at card ${i}`, 0.12));
    expectNearChance(mostFamous, n, 0.25, `[${difficulty}] answer is the most famous`, 0.15);
    expectNearChance(leastFamous, n, 0.25, `[${difficulty}] answer is the least famous`, 0.15);
    expectNearChance(nearestCentre, n, 0.25, `[${difficulty}] answer is nearest the fame centre`, 0.15);
    expectNearChance(farthestFromCentre, n, 0.25, `[${difficulty}] answer is farthest from the centre`, 0.15);
  });
});

describe('higherLower leaks no manufacturing tell', () => {
  it.each(TIERS)('at difficulty "%s" the answer is not findable by side or fame', async (difficulty) => {
    const dataset = await puzzleDataset();
    const fame = await fameById();
    const puzzles = puzzlesOf(dataset, 'higherLower', difficulty) as ScoutHigherLowerPuzzle[];
    if (puzzles.length < MIN_SAMPLE) return;

    let leftWins = 0;
    let famousWins = 0;
    let famousCounted = 0;

    for (const p of puzzles) {
      const answerIndex = p.cards.findIndex((c) => c.playerId === p.answerPlayerId);
      expect(answerIndex).toBeGreaterThanOrEqual(0);
      if (answerIndex === 0) leftWins += 1;

      const fa = fame.get(p.cards[0].playerId) ?? 0;
      const fb = fame.get(p.cards[1].playerId) ?? 0;
      if (fa !== fb) {
        famousCounted += 1;
        if ((fa > fb ? 0 : 1) === answerIndex) famousWins += 1;
      }
    }

    expectNearChance(leftWins, puzzles.length, 0.5, `[${difficulty}] answer is the left card`, 0.12);
    // "Pick the bigger name" is what a lazy player actually does. If it wins, the mode is testing
    // name recognition rather than the stat it claims to be asking about.
    expectNearChance(famousWins, famousCounted, 0.5, `[${difficulty}] answer is the more famous`, 0.15);
  });

  it('never ties and always names its stat', async () => {
    const dataset = await puzzleDataset();
    for (const difficulty of TIERS) {
      for (const p of puzzlesOf(dataset, 'higherLower', difficulty) as ScoutHigherLowerPuzzle[]) {
        expect(p.values[0]).not.toBe(p.values[1]);
        expect(p.statLabel.trim()).toBeTruthy();
      }
    }
  });
});
