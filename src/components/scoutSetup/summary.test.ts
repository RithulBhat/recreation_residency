import { describe, expect, it } from 'vitest';
import { SCOUT_FORMATS, SCOUT_FORMAT_IDS } from '@/scout/formats';
import { normalizeScoutSettings } from '@/scout/presets';
import {
  SCOUT_DIFFICULTY_INFO,
  SCOUT_FORMAT_ACCENT,
  SCOUT_FORMAT_EMOJI,
  SCOUT_FORMAT_LABEL,
  SCOUT_MODE_EMOJI,
  SCOUT_MODE_LABEL,
  clockLabel,
  dailyRunNoun,
  duelStyleLabel,
  emptyPoolMessage,
  formatSeatsLabel,
  livesLabel,
  pct,
  poolKind,
  poolLabel,
  roundsLabel,
  scoutModeName,
  scoutPackNames,
  scoutPacksSummary,
  scoutFormatFacts,
  scoutFormatName,
  scoutRevealLadder,
  scoutRulesSummary,
  scoutRunSteps,
  scoutSettingsSummary,
  seatsLabel,
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
  it('reads the whole run in one line, format first', () => {
    const s = normalizeScoutSettings({
      mode: 'silhouette',
      packIds: ['superstars'],
      difficulty: 'star',
      tries: 4,
      rounds: 10,
    });
    expect(scoutSettingsSummary(s)).toBe('Standard · 10 rounds · Silhouette · Superstars · Superstars · 4 tries');
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

  // The whole point of the line: it can only name settings the FORMAT actually reads.
  it('leads with the format and its own facts', () => {
    const survival = normalizeScoutSettings({
      format: 'survival',
      mode: 'silhouette',
      packIds: ['superstars'],
      lives: 3,
      tries: 5,
    });
    expect(scoutSettingsSummary(survival)).toBe('Survival · 3 lives · Silhouette · Superstars · 5 tries');

    const blitz = normalizeScoutSettings({
      format: 'blitz',
      mode: 'faceZoom',
      packIds: ['superstars'],
      blitzDuration: 60,
    });
    const blitzLine = scoutSettingsSummary(blitz);
    expect(blitzLine).toBe('Blitz · 60s clock · Face Off · Superstars');
    // blitz reads neither of these, so neither may be advertised
    expect(blitzLine).not.toContain('rounds');
    expect(blitzLine).not.toContain('tries');

    const duel = normalizeScoutSettings({
      format: 'duel',
      duelStyle: 'buzzer',
      mode: 'highlight',
      packIds: ['superstars'],
      rounds: 10,
      tries: 4,
      hintsEnabled: false,
    });
    const duelLine = scoutSettingsSummary(duel);
    expect(duelLine).toBe('Duel · Buzz-in · 10 rounds · Film Room · Superstars · 4 tries');
    // duel has no hints at all, so "no hints" would be a lie
    expect(duelLine).not.toContain('no hints');

    const party = normalizeScoutSettings({
      format: 'party',
      mode: 'silhouette',
      packIds: ['superstars'],
      rounds: 12,
      tries: 4,
      players: [
        { id: 'p1', name: 'A', emoji: '🦊', color: '#f97316' },
        { id: 'p2', name: 'B', emoji: '🐙', color: '#a855f7' },
        { id: 'p3', name: 'C', emoji: '🐸', color: '#34d399' },
      ],
    });
    expect(scoutSettingsSummary(party)).toBe('Party · 3 players · 12 rounds · Silhouette · Superstars · 4 tries');

    const gauntlet = normalizeScoutSettings({ format: 'gauntlet', mode: 'logoZoom', tries: 4 });
    const gauntletLine = scoutSettingsSummary(gauntlet);
    expect(gauntletLine).toBe('Gauntlet · 32 franchises · Logo Zoom · 4 tries');
    // the gauntlet picks its own packs, so naming them would be noise
    expect(gauntletLine).not.toContain('Franchises');
  });
});

describe('scoutFormatFacts', () => {
  it('names only what the format reads', () => {
    const base = { mode: 'silhouette' as const, packIds: ['superstars'] };
    expect(scoutFormatFacts(normalizeScoutSettings({ ...base, rounds: 8 }))).toEqual(['8 rounds']);
    expect(scoutFormatFacts(normalizeScoutSettings({ ...base, format: 'blitz', blitzDuration: 120 }))).toEqual([
      '120s clock',
    ]);
    expect(scoutFormatFacts(normalizeScoutSettings({ ...base, format: 'survival', lives: 1 }))).toEqual(['1 life']);
    expect(scoutFormatFacts(normalizeScoutSettings({ ...base, format: 'gauntlet' }))).toEqual(['32 franchises']);
  });
});

describe('scoutRulesSummary', () => {
  it('lists exactly the controls the panel renders', () => {
    const standard = normalizeScoutSettings({ mode: 'silhouette', packIds: ['superstars'], rounds: 10, tries: 5 });
    expect(scoutRulesSummary(standard)).toBe('10 rounds · 5 tries · no timer');

    const blitz = normalizeScoutSettings({ format: 'blitz', mode: 'silhouette', packIds: ['superstars'] });
    expect(scoutRulesSummary(blitz)).toBe('90s clock');

    const gauntlet = normalizeScoutSettings({ format: 'gauntlet', mode: 'silhouette', tries: 4, roundTimer: 30 });
    expect(scoutRulesSummary(gauntlet)).toBe('4 tries · 30s timer');
  });
});

describe('scoutRunSteps', () => {
  it("describes each format in its own terms, with the draft's numbers", () => {
    const blitz = scoutRunSteps(normalizeScoutSettings({ format: 'blitz', mode: 'silhouette', blitzDuration: 60 }));
    expect(blitz).toHaveLength(3);
    expect(blitz.join(' ')).toContain('60s clock');
    expect(blitz.join(' ')).toContain('5s');

    const survival = scoutRunSteps(normalizeScoutSettings({ format: 'survival', mode: 'silhouette', lives: 2 }));
    expect(survival[0]).toContain('2 lives');

    const gauntlet = scoutRunSteps(normalizeScoutSettings({ format: 'gauntlet', mode: 'logoZoom' }));
    expect(gauntlet[0]).toContain('32 franchises');

    const buzzer = scoutRunSteps(normalizeScoutSettings({ format: 'duel', duelStyle: 'buzzer', mode: 'silhouette' }));
    expect(buzzer[0]).toContain('A for player one');
    expect(buzzer[0]).toContain('L for player two');
    const turns = scoutRunSteps(normalizeScoutSettings({ format: 'duel', duelStyle: 'turns', mode: 'silhouette' }));
    expect(turns[0]).toContain('alternate');

    // every format answers, including the default
    for (const format of SCOUT_FORMAT_IDS) {
      const steps = scoutRunSteps(normalizeScoutSettings({ format, mode: 'silhouette', packIds: ['superstars'] }));
      expect(steps).toHaveLength(3);
      for (const step of steps) expect(step.length).toBeGreaterThan(20);
    }
  });
});

describe('dailyRunNoun', () => {
  it("reads the daily's own settings instead of assuming eight rounds", () => {
    expect(dailyRunNoun(normalizeScoutSettings({ mode: 'silhouette', rounds: 8 }))).toBe('8 subjects');
    expect(dailyRunNoun(normalizeScoutSettings({ format: 'blitz', mode: 'silhouette', blitzDuration: 90 }))).toBe(
      '90 seconds',
    );
    expect(dailyRunNoun(normalizeScoutSettings({ format: 'gauntlet', mode: 'silhouette' }))).toBe('the whole board');
  });
});

describe('format labels', () => {
  it('names every format and seats it', () => {
    for (const f of SCOUT_FORMATS) {
      expect(scoutFormatName(f.id)).toBe(f.name);
      expect(SCOUT_FORMAT_LABEL[f.id]).toBe(f.name);
      expect(SCOUT_FORMAT_EMOJI[f.id]).not.toBe('');
      expect(SCOUT_FORMAT_ACCENT[f.id]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(formatSeatsLabel(f.seats)).not.toBe('');
    }
    expect(formatSeatsLabel('solo')).toBe('Solo');
    expect(formatSeatsLabel('pair')).toBe('2 players');
    expect(formatSeatsLabel('group')).toBe('2–8 players');
    expect(livesLabel(1)).toBe('1 life');
    expect(livesLabel(3)).toBe('3 lives');
    expect(clockLabel(90)).toBe('90s clock');
    expect(seatsLabel(1)).toBe('1 player');
    expect(seatsLabel(4)).toBe('4 players');
    expect(duelStyleLabel('buzzer')).toBe('Buzz-in');
    expect(duelStyleLabel('turns')).toBe('Turns');
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
