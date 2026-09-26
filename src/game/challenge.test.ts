import { describe, expect, it } from 'vitest';
import type { ChallengePayload } from '@/types';
import {
  buildChallengeUrl,
  challengeSettings,
  dailySeed,
  dailySettings,
  decodeChallenge,
  encodeChallenge,
  parseChallengeCode,
  todayISO,
} from './challenge';
import { DEFAULT_SETTINGS } from './presets';

describe('challenge codes', () => {
  const payload: ChallengePayload = {
    v: 1,
    seed: 'ch-abc123',
    settings: {
      mode: 'fixed',
      packIds: ['pop-hits', 'hip-hop'],
      clipMode: 'fixed',
      clipLength: 0.3,
      tries: 2,
      rounds: 5,
      guessTarget: 'both',
      modifiers: { speed: 1.5, reverse: true, lofi: false, bitcrush: false, pitch: -3 },
      hintsEnabled: false,
    },
    by: 'Rithul',
    score: 4321,
  };

  it('round-trips through a base64url code', () => {
    const code = encodeChallenge(payload);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = decodeChallenge(code);
    expect(decoded).toEqual(payload);
  });

  it('omits default-valued fields (short codes) but always keeps mode + packs', () => {
    const minimal = encodeChallenge({ v: 1, seed: 's', settings: { mode: 'classic', packIds: ['pop-hits'], rounds: 10, tries: 7 } });
    const decoded = decodeChallenge(minimal)!;
    expect(decoded.settings).toEqual({ mode: 'classic', packIds: ['pop-hits'] });
    expect(minimal.length).toBeLessThan(80);
    expect(minimal.length).toBeLessThan(encodeChallenge(payload).length);
  });

  it('rejects garbage, wrong versions and tampered types', () => {
    expect(decodeChallenge('')).toBeNull();
    expect(decodeChallenge('!!!')).toBeNull();
    expect(decodeChallenge('bm90IGpzb24')).toBeNull(); // "not json"
    expect(decodeChallenge(btoa(JSON.stringify({ v: 2, s: 'x', g: { m: 'classic', p: ['a'] } })))).toBeNull();
    expect(decodeChallenge(btoa(JSON.stringify({ v: 1, s: '', g: { m: 'classic', p: ['a'] } })))).toBeNull();
    expect(decodeChallenge(btoa(JSON.stringify({ v: 1, s: 'x', g: { m: 'nope', p: ['a'] } })))).toBeNull();
    expect(decodeChallenge(btoa(JSON.stringify({ v: 1, s: 'x', g: { m: 'classic', p: [] } })))).toBeNull();
    const tampered = decodeChallenge(btoa(JSON.stringify({ v: 1, s: 'x', g: { m: 'classic', p: ['a'], r: 'ten', l: [1] } })))!;
    expect(tampered.settings.rounds).toBeUndefined();
    expect(tampered.settings.clipLength).toBeUndefined();
  });

  it('challengeSettings normalizes with the seed applied', () => {
    const s = challengeSettings(payload);
    expect(s.seed).toBe('ch-abc123');
    expect(s.mode).toBe('fixed');
    expect(s.clipLength).toBe(0.3);
    expect(s.tries).toBe(2);
    expect(s.players).toEqual([]);
  });

  it('buildChallengeUrl uses the hash route and parseChallengeCode reads it back', () => {
    const url = buildChallengeUrl(payload);
    expect(url.startsWith(`${location.origin}${location.pathname}#/c/`)).toBe(true);
    const code = parseChallengeCode(url)!;
    expect(decodeChallenge(code)).toEqual(payload);
    expect(parseChallengeCode('#/c/abc_-123')).toBe('abc_-123');
    expect(parseChallengeCode('abc123')).toBe('abc123');
    expect(parseChallengeCode('not a code!')).toBeNull();
  });
});

describe('daily', () => {
  it('dailySeed / todayISO / dailySettings', () => {
    expect(dailySeed('2026-09-26')).toBe('daily-2026-09-26');
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const s = dailySettings('2026-09-26', 'pop-hits');
    expect(s).toMatchObject({ mode: 'classic', rounds: 10, packIds: ['pop-hits'], seed: 'daily-2026-09-26', daily: '2026-09-26', stages: DEFAULT_SETTINGS.stages, tries: 7 });
    expect(dailySettings('2026-09-26', 'pop-hits')).toEqual(s);
  });
});
