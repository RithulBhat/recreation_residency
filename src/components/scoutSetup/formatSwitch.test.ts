import { describe, expect, it } from 'vitest';
import { normalizeScoutSettings } from '@/scout/presets';
import { keepScoutSettings, scoutFormatSwitch, type KeptScoutSettings } from './formatSwitch';

const base = normalizeScoutSettings({
  mode: 'silhouette',
  packIds: ['superstars', 'rookies'],
  rounds: 20,
  difficulty: 'star',
});

describe('scoutFormatSwitch', () => {
  it('only sets the format when both formats read the same keys', () => {
    expect(scoutFormatSwitch(base, 'duel')).toEqual({ format: 'duel' });
    expect(scoutFormatSwitch(base, 'standard')).toEqual({ format: 'standard' });
  });

  it('hands back what the outgoing format had overwritten', () => {
    const gauntlet = normalizeScoutSettings({ ...base, format: 'gauntlet' });
    // the gauntlet forced rounds 0, tier any and league-wide packs
    expect(gauntlet.rounds).toBe(0);
    expect(gauntlet.difficulty).toBe('any');

    const kept: KeptScoutSettings = { packIds: ['superstars', 'rookies'], rounds: 20, difficulty: 'star' };
    const patch = scoutFormatSwitch(gauntlet, 'standard', kept);
    expect(patch).toEqual({
      format: 'standard',
      packIds: ['superstars', 'rookies'],
      rounds: 20,
      difficulty: 'star',
    });
    const back = normalizeScoutSettings({ ...gauntlet, ...patch });
    expect(back.rounds).toBe(20);
    expect(back.difficulty).toBe('star');
    expect(back.packIds).toEqual(['superstars', 'rookies']);
  });

  it('falls back to the defaults when nothing was kept (a deep link into a format)', () => {
    const blitz = normalizeScoutSettings({ ...base, format: 'blitz' });
    expect(blitz.rounds).toBe(0);
    // blitz reads packs and the tier, so neither is restored — only the round count it cannot set
    expect(scoutFormatSwitch(blitz, 'party')).toEqual({ format: 'party', rounds: 10 });
  });

  it('does not restore a key the incoming format cannot use either', () => {
    const survival = normalizeScoutSettings({ ...base, format: 'survival' });
    // blitz has no round count of its own, so moving survival → blitz restores nothing
    expect(scoutFormatSwitch(survival, 'blitz')).toEqual({ format: 'blitz', difficulty: 'any' });
  });
});

describe('keepScoutSettings', () => {
  it('remembers only what the current format honours', () => {
    const kept: KeptScoutSettings = {};
    keepScoutSettings(kept, base);
    expect(kept).toEqual({ packIds: base.packIds, rounds: 20, difficulty: 'star' });

    // the gauntlet's own (forced) values must not overwrite the memory
    const gauntlet = normalizeScoutSettings({ ...base, format: 'gauntlet' });
    keepScoutSettings(kept, gauntlet);
    expect(kept.rounds).toBe(20);
    expect(kept.difficulty).toBe('star');
    expect(kept.packIds).toEqual(base.packIds);
  });
});
