import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '@/game/presets';
import {
  clipSummary,
  modeHow,
  modifierLabels,
  packsSummary,
  pitchLabel,
  poolEstimate,
  roundsSummary,
  settingsSummary,
  stagesSentence,
} from './summary';

describe('summary', () => {
  it('describes escalating and fixed clips', () => {
    expect(clipSummary(DEFAULT_SETTINGS)).toBe('0.1s→10s · 7 tries');
    expect(clipSummary(normalizeSettings({ mode: 'fixed', clipLength: 0.5, tries: 3 }))).toBe('0.5s×3 tries');
    expect(clipSummary(normalizeSettings({ mode: 'fixed', clipLength: 0.3, tries: 1 }))).toBe('0.3s×1 try');
    expect(clipSummary(normalizeSettings({ mode: 'blitz', clipLength: 1 }))).toBe('1s clips');
  });

  it('builds the stage preview sentence', () => {
    expect(stagesSentence([0.1, 0.3, 1, 2, 4, 7, 10])).toBe("You'll hear 0.1s, then 0.3s, then 1s… (7 tries)");
    expect(stagesSentence([0.1, 1])).toBe("You'll hear 0.1s, then 1s (2 tries)");
    expect(stagesSentence([])).toBe('Pick at least two stages.');
  });

  it('summarizes rounds per mode', () => {
    expect(roundsSummary(DEFAULT_SETTINGS)).toBe('10 rounds');
    expect(roundsSummary({ ...DEFAULT_SETTINGS, rounds: 0 })).toBe('∞ rounds');
    expect(roundsSummary({ ...DEFAULT_SETTINGS, mode: 'blitz', blitzDuration: 60 })).toBe('60s blitz');
    expect(roundsSummary({ ...DEFAULT_SETTINGS, mode: 'survival', lives: 1 })).toBe('1 life');
  });

  it('labels modifiers and pitch', () => {
    expect(modifierLabels(DEFAULT_SETTINGS.modifiers)).toEqual([]);
    expect(modifierLabels({ speed: 1.5, reverse: true, lofi: true, bitcrush: false, pitch: -3 })).toEqual([
      '1.5× speed',
      'reversed',
      'lo-fi',
      'pitch -3',
    ]);
    expect(pitchLabel(-12)).toBe('demon');
    expect(pitchLabel(0)).toBe('normal');
    expect(pitchLabel(12)).toBe('chipmunk');
  });

  it('joins everything into the StartBar line', () => {
    const s = normalizeSettings({
      ...DEFAULT_SETTINGS,
      difficulty: 'medium',
      modifiers: { ...DEFAULT_SETTINGS.modifiers, reverse: true },
    });
    expect(settingsSummary(s, ['Pop Hits', 'K-Pop', '2000s'])).toBe(
      '10 rounds · 0.1s→10s · 7 tries · Pop Hits + K-Pop +1 · Medium · reversed',
    );
    expect(settingsSummary(normalizeSettings({ mode: 'party' }), ['Pop Hits'])).toContain('2 players');
  });

  it('names up to two packs before counting the rest', () => {
    expect(packsSummary([])).toBe('No packs');
    expect(packsSummary(['Pop Hits'])).toBe('Pop Hits');
    // a custom pack next to a curated one is named, never hidden behind "+1"
    expect(packsSummary(['Pop Hits', 'Burna Boy'])).toBe('Pop Hits + Burna Boy');
    expect(packsSummary(['Burna Boy', 'Arijit Singh'])).toBe('Burna Boy + Arijit Singh');
    expect(packsSummary(['Pop Hits', 'K-Pop', '2000s', 'Rock'])).toBe('Pop Hits + K-Pop +2');
  });

  it('modeHow reflects the draft, not static copy', () => {
    const preset = normalizeSettings({ mode: 'classic', stages: [0.5, 1, 2, 4] });
    expect(modeHow(preset, 'classic')).toBe('0.5s→4s · 4 tries');
    expect(modeHow(DEFAULT_SETTINGS, 'classic')).toBe('0.1s→10s · 7 tries');
    expect(modeHow(normalizeSettings({ mode: 'fixed', clipLength: 0.3, tries: 1 }), 'fixed')).toBe('0.3s×1 try');
    // other modes read the same draft (what you'd get if you picked them)
    expect(modeHow(normalizeSettings({ clipLength: 1, blitzDuration: 60 }), 'blitz')).toBe('60s blitz · 1s clips');
    expect(modeHow(normalizeSettings({ mode: 'survival', clipLength: 2, tries: 3, lives: 3 }), 'survival')).toBe('3 lives · 2s×3 tries');
    expect(modeHow(normalizeSettings({ duelStyle: 'turns', stages: [0.5, 1, 2, 4] }), 'duel')).toBe('Turns · 0.5s→4s · 4 tries');
    expect(modeHow(DEFAULT_SETTINGS, 'party')).toBe('2 players · 0.1s→10s · 7 tries');
  });

  it('estimates the pool size', () => {
    expect(poolEstimate([240, undefined, 60])).toBe(300);
  });
});
