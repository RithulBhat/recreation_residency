import { describe, expect, it } from 'vitest';
import {
  buildScoutChallengeUrl,
  dailyScoutSeed,
  decodeScoutChallenge,
  encodeScoutChallenge,
  parseScoutChallengeCode,
  scoutChallengePath,
  scoutChallengeSettings,
  scoutDailyMode,
  scoutDailySettings,
  todayISO,
} from './challenge';
import { DEFAULT_SCOUT_SETTINGS, SCOUT_MODE_IDS } from './presets';
import { subjectKindForMode } from './subjects';
import { scoutPack } from './packs';
import type { ScoutChallengePayload } from './challenge';

const FULL: ScoutChallengePayload = {
  v: 1,
  seed: 'abc-123',
  settings: {
    mode: 'faceZoom',
    packIds: ['pos-qb', 'team-kc'],
    difficulty: 'star',
    tries: 3,
    rounds: 7,
    roundTimer: 45,
    hintsEnabled: false,
    mixModes: true,
    daily: '2026-09-26',
  },
  by: 'Rithul',
  score: 4821.6,
  subjects: ['player:3139477', 'team:12'],
};

describe('encode / decode round trip', () => {
  it('survives every field', () => {
    const back = decodeScoutChallenge(encodeScoutChallenge(FULL));
    expect(back).not.toBeNull();
    expect(back?.seed).toBe('abc-123');
    expect(back?.by).toBe('Rithul');
    expect(back?.score).toBe(4822);
    expect(back?.subjects).toEqual(['player:3139477', 'team:12']);
    expect(back?.settings).toEqual(FULL.settings);
  });

  it('produces a url-safe code', () => {
    const code = encodeScoutChallenge(FULL);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(300);
  });

  it('drops defaults to keep codes short but restores them on decode', () => {
    const minimal: ScoutChallengePayload = {
      v: 1,
      seed: 's',
      settings: { mode: 'silhouette', packIds: ['superstars'], tries: DEFAULT_SCOUT_SETTINGS.tries },
    };
    const code = encodeScoutChallenge(minimal);
    expect(code.length).toBeLessThan(encodeScoutChallenge(FULL).length);
    const settings = scoutChallengeSettings(decodeScoutChallenge(code)!);
    expect(settings.tries).toBe(DEFAULT_SCOUT_SETTINGS.tries);
    expect(settings.rounds).toBe(DEFAULT_SCOUT_SETTINGS.rounds);
    expect(settings.seed).toBe('s');
  });

  it('truncates the sender name and caps the subject list', () => {
    const long = encodeScoutChallenge({
      ...FULL,
      by: 'x'.repeat(80),
      subjects: Array.from({ length: 200 }, (_, i) => `player:${i}`),
    });
    const back = decodeScoutChallenge(long)!;
    expect(back.by).toHaveLength(24);
    expect(back.subjects).toHaveLength(60);
  });

  it('rejects rubbish', () => {
    expect(decodeScoutChallenge('')).toBeNull();
    expect(decodeScoutChallenge('   ')).toBeNull();
    expect(decodeScoutChallenge('!!!!')).toBeNull();
    expect(decodeScoutChallenge('bm90anNvbg')).toBeNull();
    expect(decodeScoutChallenge(btoa('{"v":2}'))).toBeNull();
    expect(decodeScoutChallenge(btoa('{"v":1}'))).toBeNull();
    expect(decodeScoutChallenge(btoa('{"v":1,"s":"a","g":{}}'))).toBeNull();
    expect(decodeScoutChallenge(btoa('{"v":1,"s":"a","g":{"m":"nope","p":["x"]}}'))).toBeNull();
    expect(decodeScoutChallenge(btoa('{"v":1,"s":"a","g":{"m":"silhouette","p":[]}}'))).toBeNull();
    expect(decodeScoutChallenge(btoa('{"v":1,"s":"","g":{"m":"silhouette","p":["x"]}}'))).toBeNull();
  });

  it('ignores tampered field types', () => {
    const code = btoa('{"v":1,"s":"a","g":{"m":"silhouette","p":["superstars"],"t":"lots","r":[1,2]}}')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const payload = decodeScoutChallenge(code)!;
    expect(payload.settings.tries).toBeUndefined();
    expect(payload.settings.rounds).toBeUndefined();
    const settings = scoutChallengeSettings(payload);
    expect(settings.tries).toBe(DEFAULT_SCOUT_SETTINGS.tries);
    expect(settings.rounds).toBe(DEFAULT_SCOUT_SETTINGS.rounds);
  });
});

describe('links', () => {
  it('builds and parses a /scout/c/ path', () => {
    const code = encodeScoutChallenge(FULL);
    expect(scoutChallengePath(code)).toBe(`/scout/c/${code}`);
    const url = buildScoutChallengeUrl(FULL);
    expect(url).toContain(`#/scout/c/${code}`);
    expect(parseScoutChallengeCode(url)).toBe(code);
    expect(parseScoutChallengeCode(`#/scout/c/${code}`)).toBe(code);
    expect(parseScoutChallengeCode(code)).toBe(code);
    expect(parseScoutChallengeCode('not a code!!')).toBeNull();
  });
});

describe('daily', () => {
  it('seeds from the date', () => {
    expect(dailyScoutSeed('2026-09-26')).toBe('scout-daily-2026-09-26');
    expect(todayISO(new Date(2026, 8, 26))).toBe('2026-09-26');
  });

  it('picks a stable mode of the day that moves around', () => {
    const dates = Array.from({ length: 40 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const modes = dates.map(scoutDailyMode);
    for (const d of dates) expect(scoutDailyMode(d)).toBe(scoutDailyMode(d));
    for (const m of modes) expect(SCOUT_MODE_IDS).toContain(m);
    expect(new Set(modes).size).toBeGreaterThan(2);
  });

  it('builds playable, seeded daily settings whose pack matches the mode kind', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-09-26', '2026-12-31']) {
      const settings = scoutDailySettings(day);
      expect(settings.seed).toBe(dailyScoutSeed(day));
      expect(settings.daily).toBe(day);
      expect(settings.rounds).toBe(8);
      expect(settings.tries).toBe(5);
      expect(settings.mixModes).toBe(false);
      const kind = subjectKindForMode(settings.mode);
      expect(settings.packIds.some((id) => scoutPack(id)?.kind === kind)).toBe(true);
      expect(scoutDailySettings(day)).toEqual(settings);
    }
  });
});
