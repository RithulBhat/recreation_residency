import { describe, expect, it } from 'vitest';
import { loadDataset, loadStatLines } from '@/data/nfl';
import { SCOUT_PUZZLE_MODES, feasiblePuzzleModes, puzzleFeasibility } from './puzzles';
import { tierOf } from './subjects';
import type { ScoutDifficulty } from './types';

/**
 * A difficulty the content cannot honour is worse than a difficulty that is not offered: the
 * generator silently falls back to something easier, the hardest setting plays like the others, and
 * the player concludes the GAME is broken rather than the pack. So the impossible combinations are
 * pinned here, and the lobby is expected to ask before it offers.
 */

const TIERS: ScoutDifficulty[] = ['any', 'star', 'starter', 'rotation', 'deepCut'];

async function dataset() {
  const [d, statLines] = await Promise.all([loadDataset(), loadStatLines()]);
  return { teams: d.teams, players: d.players, statLines };
}

describe('puzzle feasibility on the shipped dataset', () => {
  it('higherLower cannot serve the deep-cut tier, and says so rather than degrading', async () => {
    const ds = await dataset();
    // Stat lines exist only for the ~300 most productive players, so no two deep cuts share a stat
    // in a season. This is a property of the CONTENT; the fix is to not offer it, not to fake it.
    const deep = puzzleFeasibility(ds, 'higherLower', 'deepCut', {
      playerEligible: (p) => tierOf(p) === 'deepCut',
    });
    expect(deep.playable).toBe(false);
    expect(deep.rounds).toBe(0);
    expect(feasiblePuzzleModes(ds, 'deepCut', { playerEligible: (p) => tierOf(p) === 'deepCut' })).not.toContain(
      'higherLower',
    );
  });

  it('every other mode serves every tier', async () => {
    const ds = await dataset();
    for (const difficulty of TIERS) {
      const eligible = difficulty === 'any' ? undefined : (p: Parameters<typeof tierOf>[0]) => tierOf(p) === difficulty;
      const feasible = feasiblePuzzleModes(ds, difficulty, eligible ? { playerEligible: eligible } : {});
      for (const mode of SCOUT_PUZZLE_MODES) {
        if (mode === 'higherLower' && difficulty === 'deepCut') continue;
        expect(feasible, `${mode} should be playable at ${difficulty}`).toContain(mode);
      }
    }
  });
});
