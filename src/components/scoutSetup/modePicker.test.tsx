import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SCOUT_MODES, scoutMode } from '@/scout/packs';
import type { ScoutMode } from '@/scout/types';
import { ScoutModeChart } from './ScoutModeChart';
import { scoutModeAccent, scoutModeAnswerLabel } from './ScoutModePicker';
import { emptyScoutTotals } from './scoutAggregate';

const info = (mode: ScoutMode) => {
  const m = scoutMode(mode);
  if (!m) throw new Error(`no such mode: ${mode}`);
  return m;
};

describe('scoutModeAnswerLabel', () => {
  /**
   * The three the badge used to lie about. It read off `.guesses` — the POOL a mode draws from — and
   * so promised "PLAYER" for a round answered with a year, and for two rounds with no guess box at all.
   */
  it('names a year as a year, not as a player', () => {
    expect(info('draftClass').answer).toBe('year');
    expect(scoutModeAnswerLabel(info('draftClass'))).toBe('year');
  });

  it('says pick a card for the two that never open the guess box', () => {
    for (const mode of ['higherLower', 'oddOneOut'] as const) {
      expect(info(mode).input).toBe('choice');
      expect(scoutModeAnswerLabel(info(mode))).toBe('pick a card');
    }
  });

  it('keeps player and franchise where those really are the answer', () => {
    expect(scoutModeAnswerLabel(info('silhouette'))).toBe('player');
    expect(scoutModeAnswerLabel(info('jersey'))).toBe('player');
    expect(scoutModeAnswerLabel(info('teamTrivia'))).toBe('franchise');
    expect(scoutModeAnswerLabel(info('logoZoom'))).toBe('franchise');
  });

  it('badges every puzzle type, and never promises typing where the input is a card', () => {
    for (const m of SCOUT_MODES) {
      const label = scoutModeAnswerLabel(m);
      expect(label.length, m.id).toBeGreaterThan(0);
      if (m.input === 'choice') expect(label, m.id).toBe('pick a card');
      else expect(label, m.id).not.toBe('pick a card');
    }
  });

  it('gives every puzzle type its own accent, listed or not', () => {
    for (const m of SCOUT_MODES) expect(scoutModeAccent(m.id), m.id).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('ScoutModeChart empty state', () => {
  /** The copy said "all seven modes" long after the choice-shaped six landed. */
  it('counts the puzzle types instead of hardcoding seven', () => {
    render(<ScoutModeChart totals={emptyScoutTotals()} />);
    expect(screen.getByText(`Play a run and all ${SCOUT_MODES.length} puzzle types fill in here.`)).toBeTruthy();
    expect(screen.queryByText(/all seven modes/i)).toBeNull();
    expect(SCOUT_MODES.length).toBe(13);
  });
});
