/**
 * The gauntlet board must never say which franchise the LIVE round is about.
 *
 * This is the leak the whole file exists to hold shut. `franchiseStates` used to mark the live
 * round's franchise `'current'` and the tile drew it with an accent ring — so in a Gauntlet + Logo
 * Zoom run (seed 'g1') the one ringed tile on a 32-tile board read "🐂 HOU" while the puzzle on the
 * stage was a zoomed-in fragment of the Houston Texans' logo. The board answered the round. It does
 * the same for Silhouette, Face Zoom and every other mode a gauntlet ships with, because the board
 * is on screen for the entire run.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { createInitialScoutState, reduce } from '@/scout/engine';
import { fixtureBundle } from '@/scout/fixtures';
import { franchiseIdOf } from '@/scout/formats';
import { normalizeScoutSettings } from '@/scout/presets';
import { currentRound } from '@/scout/selectors';
import { buildPool } from '@/scout/subjects';
import type { ScoutSettings, ScoutState } from '@/scout/types';
import { FranchiseBoard, franchiseStates, revealedFranchiseId } from './FranchiseBoard';

const T0 = 3_000_000;

function startGauntlet(over: Partial<ScoutSettings> = {}): ScoutState {
  const settings = normalizeScoutSettings({ format: 'gauntlet', mode: 'logoZoom', seed: 'g1', tries: 4, ...over });
  return reduce(
    createInitialScoutState(),
    { type: 'start', settings, subjects: buildPool(fixtureBundle(), settings, createRng(settings.seed ?? 'pool')), now: T0 },
    createRng(settings.seed ?? 'run'),
  );
}

function liveFranchise(state: ScoutState): string {
  const round = currentRound(state);
  if (!round) throw new Error('no live round');
  const id = franchiseIdOf(round.subject);
  if (id === undefined) throw new Error('live round has no franchise');
  return id;
}

/** Every tile's `data-state` plus whether it carries the just-played mark, keyed by team id. */
function tiles(state: ScoutState, variant: 'board' | 'strip') {
  const view = render(<FranchiseBoard state={state} variant={variant} />);
  const out = [...view.container.querySelectorAll('[data-testid="scout-franchise"]')].map((el) => ({
    club: el.getAttribute('data-club') ?? '',
    state: el.getAttribute('data-state') ?? '',
    justPlayed: el.getAttribute('data-just-played') === 'true',
    className: el.className,
  }));
  view.unmount();
  return out;
}

describe('the gauntlet board never answers the live round', () => {
  it('gives no tile a "current" state while the round is being played', () => {
    const state = startGauntlet();
    expect(currentRound(state)?.status).toBe('playing');
    const states = [...franchiseStates(state).values()];
    expect(states).not.toContain('current');
    for (const variant of ['board', 'strip'] as const) {
      for (const tile of tiles(state, variant)) {
        expect(tile.state, `${variant} / ${tile.club}`).not.toBe('current');
        expect(tile.justPlayed, `${variant} / ${tile.club}`).toBe(false);
      }
    }
  });

  it('renders the live franchise EXACTLY like every other franchise still to come', () => {
    const state = startGauntlet();
    const live = liveFranchise(state);
    const states = franchiseStates(state);
    expect(states.get(live)).toBe('upcoming');
    // Not one tile may be singled out — no ring, no glow, nothing a 32-tile board reads as a
    // pointer. ('off' is the clubs this run never puts on the board at all, which is a different
    // statement and is drawn dashed and faded whatever the live round is.)
    for (const variant of ['board', 'strip'] as const) {
      const inPlay = tiles(state, variant).filter((t) => t.state !== 'off');
      expect(inPlay.length).toBeGreaterThan(1);
      const marks = new Set(inPlay.map((t) => `${t.state}|${t.className}`));
      expect(marks.size, `${variant} should paint only one treatment before a round ends`).toBe(1);
      expect([...marks][0]).not.toMatch(/ring-accent|shadow-glow/);
    }
  });

  it('stays quiet through a whole run of live rounds, not just the first', () => {
    let state = startGauntlet();
    for (let i = 0; i < 6 && currentRound(state); i++) {
      expect(currentRound(state)?.status).toBe('playing');
      expect([...franchiseStates(state).values()]).not.toContain('current');
      expect(revealedFranchiseId(state)).toBeUndefined();
      const missed = reduce(state, { type: 'giveUp', now: T0 + i * 1000 });
      // …and the mark arrives the moment the round is over, on the club that was up.
      expect(revealedFranchiseId(missed)).toBe(liveFranchise(state));
      state = reduce(missed, { type: 'next', now: T0 + i * 1000 + 1 });
    }
  });

  it('marks the club that was just played at the reveal, on top of its own result', () => {
    const state = startGauntlet();
    const live = liveFranchise(state);
    const won = reduce(state, { type: 'guess', text: currentRound(state)!.subject.name, now: T0 + 500 });
    expect(won.status).toBe('round-over');
    expect(revealedFranchiseId(won)).toBe(live);
    // The tone is still the result it earned — the mark is additive, not a replacement.
    expect(franchiseStates(won).get(live)).toBe('cleared');
    const marked = tiles(won, 'board').filter((t) => t.justPlayed);
    expect(marked).toHaveLength(1);
    expect(marked[0].state).toBe('cleared');
    expect(marked[0].className).toMatch(/ring-accent/);
  });

  it('marks nothing once the run is finished — the results board is a summary, not a pointer', () => {
    let state = startGauntlet({ rounds: 2 });
    for (let i = 0; i < 40 && state.status !== 'finished'; i++) {
      state = reduce(state, { type: 'giveUp', now: T0 + i * 10 });
      state = reduce(state, { type: 'next', now: T0 + i * 10 + 1 });
    }
    expect(state.status).toBe('finished');
    expect(revealedFranchiseId(state)).toBeUndefined();
    expect(tiles(state, 'board').some((t) => t.justPlayed)).toBe(false);
  });

  it('still shows cleared and missed, which is the whole job of the board', () => {
    let state = startGauntlet();
    const first = liveFranchise(state);
    const won = reduce(state, { type: 'guess', text: currentRound(state)!.subject.name, now: T0 + 500 });
    state = reduce(won, { type: 'next', now: T0 + 501 });
    const second = liveFranchise(state);
    const lost = reduce(state, { type: 'giveUp', now: T0 + 900 });
    state = reduce(lost, { type: 'next', now: T0 + 901 });
    const states = franchiseStates(state);
    expect(states.get(first)).toBe('cleared');
    expect(states.get(second)).toBe('missed');
    expect(states.get(liveFranchise(state))).toBe('upcoming');
  });
});
