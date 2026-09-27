import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYERS } from '@/game/presets';
import {
  DEFAULT_SETTINGS,
  PARTY_PLAYERS,
  PRESETS,
  PRICE_HINTS,
  ROUND_LIMITS,
  SOLO_PLAYER,
  TIMER_LIMITS,
  presetById,
  reconcile,
  validateSettings,
} from './settings';
import type { PriceSettings } from './types';

const base = (over: Partial<PriceSettings> = {}): PriceSettings => ({ ...DEFAULT_SETTINGS, ...over });

describe('validateSettings', () => {
  it('returns the defaults for junk input rather than throwing', () => {
    expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps rounds into range instead of rejecting the game', () => {
    expect(validateSettings({ rounds: 9999 }).rounds).toBe(ROUND_LIMITS.max);
    expect(validateSettings({ rounds: -5 }).rounds).toBe(ROUND_LIMITS.min);
    expect(validateSettings({ rounds: 7.6 }).rounds).toBe(8);
  });

  it('clamps the timer and treats nonsense as the default', () => {
    expect(validateSettings({ timer: 99999 }).timer).toBe(TIMER_LIMITS.max);
    expect(validateSettings({ timer: NaN }).timer).toBe(DEFAULT_SETTINGS.timer);
    expect(validateSettings({ timer: 'fast' }).timer).toBe(DEFAULT_SETTINGS.timer);
  });

  it('falls back to a known value for an unknown enum', () => {
    expect(validateSettings({ input: 'telepathy' }).input).toBe(DEFAULT_SETTINGS.input);
    expect(validateSettings({ difficulty: 'impossible' }).difficulty).toBe('medium');
    expect(validateSettings({ currency: 'doge' }).currency).toBe('usd');
  });

  it('keeps only recognised hints', () => {
    expect(validateSettings({ hints: ['bracket', 'wormhole'] }).hints).toEqual(['bracket']);
    expect(validateSettings({ hints: [] }).hints).toEqual([]);
  });

  it('de-duplicates pack ids and drops empties', () => {
    expect(validateSettings({ packIds: ['a', 'a', '', 'b', 7] }).packIds).toEqual(['a', 'b']);
  });

  it('rebuilds players, rejecting a colour that is not a real hex', () => {
    const out = validateSettings({
      players: [{ id: 'x', name: 'X', emoji: '🧀', color: 'javascript:alert(1)' }],
    });
    expect(out.players[0].color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(out.players[0].name).toBe('X');
  });

  it('drops players with no id and de-duplicates by id', () => {
    const out = validateSettings({
      players: [{ id: 'a', name: 'A' }, { id: 'a', name: 'again' }, { name: 'no id' }],
    });
    expect(out.players).toHaveLength(1);
  });

  it('falls back to the solo player when the roster is unusable', () => {
    expect(validateSettings({ players: [] }).players).toEqual([SOLO_PLAYER]);
    expect(validateSettings({ players: 'lots' }).players).toEqual([SOLO_PLAYER]);
  });

  it('caps an absurd roster rather than accepting it', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(validateSettings({ players: many }).players.length).toBeLessThanOrEqual(12);
  });

  it('truncates an over-long name, emoji and seed from a crafted link', () => {
    const out = validateSettings({
      players: [{ id: 'a', name: 'x'.repeat(500), emoji: '😀'.repeat(50) }],
      seed: 's'.repeat(500),
    });
    expect(out.players[0].name.length).toBeLessThanOrEqual(24);
    expect(out.seed?.length).toBeLessThanOrEqual(64);
  });

  it('keeps a real seed and ignores an empty one', () => {
    expect(validateSettings({ seed: 'daily-2026-09-27' }).seed).toBe('daily-2026-09-27');
    expect(validateSettings({ seed: '   ' }).seed).toBeUndefined();
  });
});

describe('reconcile', () => {
  it('drops elimination scoring when there is nobody to eliminate', () => {
    expect(reconcile(base({ scoring: 'elimination', players: [SOLO_PLAYER] })).scoring).toBe(
      'closeness',
    );
  });

  it('keeps elimination when the room is big enough', () => {
    expect(
      reconcile(base({ scoring: 'elimination', players: PARTY_PLAYERS.slice(0, 4) })).scoring,
    ).toBe('elimination');
  });

  it('hides rival guesses in ladder mode — live guesses would hand over the answer', () => {
    expect(reconcile(base({ input: 'ladder', guessVisibility: 'live' })).guessVisibility).toBe('off');
  });

  it('rejects Price Is Right where it is meaningless', () => {
    expect(reconcile(base({ input: 'ladder', scoring: 'priceIsRight' })).scoring).toBe('closeness');
    expect(reconcile(base({ input: 'choice', scoring: 'priceIsRight' })).scoring).toBe('closeness');
  });

  it('allows Price Is Right with exact and slider input', () => {
    expect(reconcile(base({ input: 'exact', scoring: 'priceIsRight' })).scoring).toBe('priceIsRight');
    expect(reconcile(base({ input: 'slider', scoring: 'priceIsRight' })).scoring).toBe('priceIsRight');
  });

  it('will not let team mode and a bid war both own the guessing order', () => {
    const out = reconcile(
      base({
        players: PARTY_PLAYERS.slice(0, 4),
        twists: { bidWar: true, bluffRound: false, teamMode: true },
      }),
    );
    expect(out.twists.bidWar).toBe(false);
    expect(out.twists.teamMode).toBe(true);
  });

  it('strips party twists when there is no party', () => {
    const out = reconcile(
      base({ players: [SOLO_PLAYER], twists: { bidWar: true, bluffRound: true, teamMode: true } }),
    );
    expect(out.twists).toEqual({ bidWar: false, bluffRound: false, teamMode: false });
  });

  it('turns off the speed bonus when there is no clock to beat', () => {
    expect(reconcile(base({ timer: 0, speedBonus: true })).speedBonus).toBe(false);
    expect(reconcile(base({ timer: 20, speedBonus: true })).speedBonus).toBe(true);
  });

  it('does not mutate its input', () => {
    const original = base({ timer: 0, speedBonus: true });
    const snapshot = JSON.parse(JSON.stringify(original));
    reconcile(original);
    expect(original).toEqual(snapshot);
  });

  it('is idempotent — reconciling twice changes nothing further', () => {
    const once = reconcile(base({ input: 'ladder', scoring: 'priceIsRight', timer: 0 }));
    expect(reconcile(once)).toEqual(once);
  });
});

describe('presets', () => {
  it('ships the six presets named in the brief', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      'quick-5',
      'daily',
      'price-is-right',
      'chaos-cart',
      'luxury-only',
      'team-showdown',
    ]);
  });

  it('every preset is already reconciled — selecting one can never produce a contradiction', () => {
    for (const p of PRESETS) {
      expect(reconcile(p.settings), `preset ${p.id} was not reconciled`).toEqual(p.settings);
    }
  });

  it('every preset survives validation unchanged', () => {
    for (const p of PRESETS) {
      expect(validateSettings(p.settings), `preset ${p.id} failed validation`).toEqual(p.settings);
    }
  });

  it('every preset has presentable copy', () => {
    for (const p of PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(10);
    }
  });

  it('Price Is Right actually uses the went-over rule', () => {
    expect(presetById('price-is-right')?.settings.scoring).toBe('priceIsRight');
  });

  it('Team Showdown seats a real party', () => {
    const team = presetById('team-showdown');
    expect(team?.settings.players.length).toBeGreaterThanOrEqual(3);
    expect(team?.settings.twists.teamMode).toBe(true);
  });

  it('looks up by id and returns undefined for a stranger', () => {
    expect(presetById('quick-5')?.name).toBe('Quick 5');
    expect(presetById('nope')).toBeUndefined();
  });
});

describe('shared identity', () => {
  it('reuses Songooner’s roster rather than declaring a second one', () => {
    expect(PARTY_PLAYERS).toBe(DEFAULT_PLAYERS);
  });

  it('gives every party player a real hex colour', () => {
    for (const p of PARTY_PLAYERS) expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('defaults hints to everything available', () => {
    expect(DEFAULT_SETTINGS.hints).toEqual(PRICE_HINTS);
  });

  it('the defaults are themselves reconciled — they are not exempt from the rules', () => {
    expect(reconcile(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('does not promise a speed bonus with no clock to beat', () => {
    expect(DEFAULT_SETTINGS.timer).toBe(0);
    expect(DEFAULT_SETTINGS.speedBonus).toBe(false);
  });
});
