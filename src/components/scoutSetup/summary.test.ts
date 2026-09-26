import { describe, expect, it } from 'vitest';
import { normalizeScoutSettings } from '@/scout/presets';
import {
  SCOUT_DIFFICULTY_INFO,
  SCOUT_MODE_EMOJI,
  SCOUT_MODE_LABEL,
  emptyPoolMessage,
  pct,
  poolKind,
  poolLabel,
  roundsLabel,
  scoutModeName,
  scoutPackNames,
  scoutPacksSummary,
  scoutRevealLadder,
  scoutSettingsSummary,
  timerLabel,
  triesLabel,
} from './summary';

describe('labels', () => {
  it('names every mode and difficulty', () => {
    expect(SCOUT_MODE_LABEL.silhouette).toBe('Silhouette');
    expect(SCOUT_MODE_LABEL.teamTrivia).toBe('Franchise IQ');
    expect(SCOUT_MODE_EMOJI.logoZoom).not.toBe('');
    expect(SCOUT_DIFFICULTY_INFO.star.label).toBe('Superstars');
    expect(SCOUT_DIFFICULTY_INFO.deepCut.fame).toContain('30');
  });

  it('pluralises rounds, tries and timers', () => {
    expect(roundsLabel(0)).toBe('∞ rounds');
    expect(roundsLabel(1)).toBe('1 round');
    expect(roundsLabel(10)).toBe('10 rounds');
    expect(triesLabel(1)).toBe('1 try');
    expect(triesLabel(5)).toBe('5 tries');
    expect(timerLabel(0)).toBe('no timer');
    expect(timerLabel(30)).toBe('30s timer');
  });

  it('falls back to the id for an unknown mode', () => {
    // @ts-expect-error — deliberately out of contract
    expect(scoutModeName('nope')).toBe('nope');
  });
});

describe('scoutPacksSummary', () => {
  it('collapses to two names plus a count', () => {
    expect(scoutPacksSummary([])).toBe('No packs');
    expect(scoutPacksSummary(['Superstars'])).toBe('Superstars');
    expect(scoutPacksSummary(['Superstars', 'Rookies'])).toBe('Superstars + Rookies');
    expect(scoutPacksSummary(['Superstars', 'Rookies', 'Deep Cuts', 'Veterans'])).toBe(
      'Superstars + Rookies +2',
    );
  });

  it('resolves known pack ids and drops unknown ones', () => {
    expect(scoutPackNames(['superstars', 'nope-pack', 'rookies'])).toEqual(['Superstars', 'Rookies']);
  });
});

describe('scoutSettingsSummary', () => {
  it('reads the whole run in one line', () => {
    const s = normalizeScoutSettings({
      mode: 'silhouette',
      packIds: ['superstars'],
      difficulty: 'star',
      tries: 4,
      rounds: 10,
    });
    expect(scoutSettingsSummary(s)).toBe('10 rounds · Silhouette · Superstars · Superstars · 4 tries');
  });

  it('says Mixed bag, the timer and hints-off when they apply', () => {
    const s = normalizeScoutSettings({
      mode: 'faceZoom',
      packIds: ['superstars'],
      mixModes: true,
      roundTimer: 30,
      hintsEnabled: false,
      rounds: 12,
      tries: 3,
    });
    const line = scoutSettingsSummary(s);
    expect(line).toContain('Mixed bag');
    expect(line).toContain('30s timer');
    expect(line).toContain('no hints');
    expect(line).not.toContain('Face Off');
  });

  it('omits difficulty when it is Any', () => {
    const s = normalizeScoutSettings({ mode: 'silhouette', packIds: ['superstars'], difficulty: 'any' });
    expect(scoutSettingsSummary(s)).not.toContain('Any');
  });
});

describe('pool phrasing', () => {
  it('knows what a run is naming', () => {
    expect(poolKind({ mode: 'silhouette', mixModes: false })).toBe('player');
    expect(poolKind({ mode: 'logoZoom', mixModes: false })).toBe('team');
    expect(poolKind({ mode: 'logoZoom', mixModes: true })).toBe('mixed');
  });

  it('pluralises the pool count', () => {
    expect(poolLabel(1, 'player')).toBe('1 player');
    expect(poolLabel(1200, 'player')).toBe('1,200 players');
    expect(poolLabel(32, 'team')).toBe('32 franchises');
    expect(poolLabel(5, 'mixed')).toBe('5 subjects');
  });

  it('explains an empty pool in terms the player can act on', () => {
    const s = normalizeScoutSettings({ mode: 'highlight', packIds: ['superstars'], difficulty: 'deepCut' });
    const msg = emptyPoolMessage(s);
    expect(msg).toContain('Superstars');
    expect(msg).toContain('Deep cuts');
    expect(msg).toContain('Film Room');
  });
});

describe('scoutRevealLadder', () => {
  it('walks the silhouette from black to almost-clear', () => {
    const ladder = scoutRevealLadder('silhouette', 5);
    expect(ladder).not.toBeNull();
    expect(ladder).toHaveLength(5);
    expect(ladder![0]).toBe(0);
    expect(ladder![4]).toBeCloseTo(0.85, 5);
    // monotonic
    for (let i = 1; i < ladder!.length; i++) expect(ladder![i]).toBeGreaterThan(ladder![i - 1]!);
  });

  it('starts a face crop tight, not black', () => {
    expect(scoutRevealLadder('faceZoom', 3)![0]).toBeCloseTo(0.06, 5);
  });

  it('has no visual ladder for the text modes', () => {
    expect(scoutRevealLadder('highlight', 5)).toBeNull();
    expect(scoutRevealLadder('teamTrivia', 5)).toBeNull();
    expect(scoutRevealLadder('statLine', 5)).toBeNull();
    expect(scoutRevealLadder('careerPath', 5)).toBeNull();
  });
});

describe('pct', () => {
  it('clamps and rounds', () => {
    expect(pct(0)).toBe('0%');
    expect(pct(0.826)).toBe('83%');
    expect(pct(2)).toBe('100%');
    expect(pct(Number.NaN)).toBe('—');
  });
});
