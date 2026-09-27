import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYERS } from '@/game/presets';
import {
  BLITZ_LADDER_RUNGS,
  BLITZ_MISS_PENALTY_MS,
  BLITZ_RUNG,
  DEFAULT_SCOUT_BLITZ_DURATION,
  DEFAULT_SCOUT_DUEL_STYLE,
  DEFAULT_SCOUT_FORMAT,
  DEFAULT_SCOUT_LIVES,
  DEFAULT_SCOUT_PLAYERS,
  DUEL_BUZZ_KEYS,
  GAUNTLET_SIZE,
  SCOUT_DUEL_STYLES,
  SCOUT_FORMATS,
  SCOUT_FORMAT_IDS,
  SCOUT_FORMAT_LIMITS,
  SOLO_SCOUT_PLAYER,
  SURVIVAL_MIN_TRIES,
  SURVIVAL_TIERS,
  SURVIVAL_TIER_STEP,
  formatUses,
  franchiseIdOf,
  isEndlessScoutFormat,
  isScoutBuzzerDuel,
  isScoutMultiplayer,
  normalizeScoutPlayers,
  resolveScoutPlayers,
  rotatesScoutPlayers,
  scoutBlitzDuration,
  scoutDuelStyle,
  scoutFormat,
  scoutFormatInfo,
  scoutLives,
  survivalTierFor,
  survivalTierIndex,
  survivalTriesFor,
} from './formats';
import { buildPlayerSubject, buildTeamSubject } from './subjects';
import { findFixturePlayer, findFixtureTeam, makePlayer } from './fixtures';
import type { ScoutFormat, ScoutSettings } from './types';

describe('SCOUT_FORMATS metadata', () => {
  it('covers every format id exactly once, in order', () => {
    expect(SCOUT_FORMATS.map((f) => f.id)).toEqual([...SCOUT_FORMAT_IDS]);
    expect(new Set(SCOUT_FORMAT_IDS).size).toBe(SCOUT_FORMAT_IDS.length);
    expect(SCOUT_FORMAT_IDS).toContain(DEFAULT_SCOUT_FORMAT);
  });

  it('gives every format a name, emoji, blurb, how-it-plays and an ending', () => {
    for (const f of SCOUT_FORMATS) {
      expect(f.name.length).toBeGreaterThan(2);
      expect(f.emoji.length).toBeGreaterThan(0);
      expect(f.blurb.length).toBeGreaterThan(10);
      expect(f.how.length).toBeGreaterThan(10);
      expect(f.ends.length).toBeGreaterThan(5);
      expect(f.uses.length).toBeGreaterThan(0);
      expect(['solo', 'pair', 'group']).toContain(f.seats);
    }
  });

  it('lists a puzzle type for every format — a session is always format + puzzle type', () => {
    for (const f of SCOUT_FORMATS) expect(f.uses).toContain('mode');
  });

  it('only advertises the settings each format actually reads', () => {
    expect(formatUses('standard', 'rounds')).toBe(true);
    expect(formatUses('standard', 'blitzDuration')).toBe(false);
    expect(formatUses('blitz', 'blitzDuration')).toBe(true);
    // blitz shows ONE fixed rung and owns the only clock
    expect(formatUses('blitz', 'tries')).toBe(false);
    expect(formatUses('blitz', 'rounds')).toBe(false);
    expect(formatUses('blitz', 'roundTimer')).toBe(false);
    expect(formatUses('survival', 'lives')).toBe(true);
    expect(formatUses('survival', 'rounds')).toBe(false);
    // survival walks every tier itself, so a tier filter is not on offer
    expect(formatUses('survival', 'difficulty')).toBe(false);
    expect(formatUses('gauntlet', 'rounds')).toBe(false);
    expect(formatUses('gauntlet', 'packIds')).toBe(false);
    expect(formatUses('duel', 'duelStyle')).toBe(true);
    expect(formatUses('duel', 'players')).toBe(true);
    expect(formatUses('party', 'players')).toBe(true);
    expect(formatUses('party', 'duelStyle')).toBe(false);
  });

  it('scoutFormatInfo resolves and tolerates an unknown id', () => {
    expect(scoutFormatInfo('blitz')?.name).toBe('Blitz');
    expect(scoutFormatInfo('nope' as ScoutFormat)).toBeUndefined();
    expect(formatUses('nope' as ScoutFormat, 'mode')).toBe(false);
  });

  it('seats the multiplayer formats and nothing else', () => {
    expect(scoutFormatInfo('duel')?.seats).toBe('pair');
    expect(scoutFormatInfo('party')?.seats).toBe('group');
    for (const id of ['standard', 'blitz', 'survival', 'gauntlet'] as const) {
      expect(scoutFormatInfo(id)?.seats).toBe('solo');
    }
  });
});

describe('resolvers are total', () => {
  const junk = { format: 'videoClip', lives: 'three', blitzDuration: null, duelStyle: 7 } as unknown as ScoutSettings;

  it('fall back to the defaults for missing or nonsense values', () => {
    expect(scoutFormat({})).toBe('standard');
    expect(scoutFormat(junk)).toBe('standard');
    expect(scoutLives({})).toBe(DEFAULT_SCOUT_LIVES);
    expect(scoutLives(junk)).toBe(DEFAULT_SCOUT_LIVES);
    expect(scoutBlitzDuration({})).toBe(DEFAULT_SCOUT_BLITZ_DURATION);
    expect(scoutBlitzDuration(junk)).toBe(DEFAULT_SCOUT_BLITZ_DURATION);
    expect(scoutDuelStyle({})).toBe(DEFAULT_SCOUT_DUEL_STYLE);
    expect(scoutDuelStyle(junk)).toBe(DEFAULT_SCOUT_DUEL_STYLE);
  });

  it('clamp lives to 1–5 and the blitz clock to 30–300 s', () => {
    expect(scoutLives({ lives: 0 })).toBe(SCOUT_FORMAT_LIMITS.lives.min);
    expect(scoutLives({ lives: -9 })).toBe(1);
    expect(scoutLives({ lives: 99 })).toBe(SCOUT_FORMAT_LIMITS.lives.max);
    expect(scoutLives({ lives: 3.4 })).toBe(3);
    expect(scoutBlitzDuration({ blitzDuration: 1 })).toBe(SCOUT_FORMAT_LIMITS.blitzDuration.min);
    expect(scoutBlitzDuration({ blitzDuration: 9999 })).toBe(SCOUT_FORMAT_LIMITS.blitzDuration.max);
    expect(scoutBlitzDuration({ blitzDuration: 60.6 })).toBe(61);
  });

  it('classify multiplayer, buzzers, rotation and endlessness', () => {
    expect(isScoutMultiplayer({ format: 'duel' })).toBe(true);
    expect(isScoutMultiplayer({ format: 'party' })).toBe(true);
    for (const format of ['standard', 'blitz', 'survival', 'gauntlet'] as const) {
      expect(isScoutMultiplayer({ format })).toBe(false);
    }
    expect(isScoutBuzzerDuel({ format: 'duel', duelStyle: 'buzzer' })).toBe(true);
    expect(isScoutBuzzerDuel({ format: 'duel', duelStyle: 'turns' })).toBe(false);
    expect(isScoutBuzzerDuel({ format: 'party', duelStyle: 'buzzer' })).toBe(false);
    expect(rotatesScoutPlayers({ format: 'party' })).toBe(true);
    expect(rotatesScoutPlayers({ format: 'duel', duelStyle: 'turns' })).toBe(true);
    expect(rotatesScoutPlayers({ format: 'duel', duelStyle: 'buzzer' })).toBe(false);
    expect(rotatesScoutPlayers({ format: 'standard' })).toBe(false);
    expect(SCOUT_FORMAT_IDS.filter(isEndlessScoutFormat)).toEqual(['blitz', 'survival', 'gauntlet']);
  });

  it('keeps the duel style list honest', () => {
    expect(SCOUT_DUEL_STYLES).toEqual(['buzzer', 'turns']);
    expect(scoutDuelStyle({ duelStyle: 'turns' })).toBe('turns');
  });
});

describe('rosters', () => {
  it('gives the solo formats one implicit player', () => {
    for (const format of ['standard', 'blitz', 'survival', 'gauntlet'] as const) {
      expect(normalizeScoutPlayers([], format)).toEqual([]);
      const resolved = resolveScoutPlayers({ format });
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe(SOLO_SCOUT_PLAYER.id);
    }
  });

  it('lets a solo run rename the implicit player but never change its id', () => {
    const resolved = resolveScoutPlayers({
      format: 'standard',
      players: [{ id: 'nope', name: 'Rithul', emoji: '🐐', color: '#123456' }],
    });
    expect(resolved).toEqual([{ id: SOLO_SCOUT_PLAYER.id, name: 'Rithul', emoji: '🐐', color: '#123456' }]);
  });

  it('tops a duel up to exactly two and a party up to two', () => {
    expect(normalizeScoutPlayers([], 'duel')).toHaveLength(2);
    expect(normalizeScoutPlayers([{ id: 'p1', name: 'Solo', emoji: '🦊', color: '#f97316' }], 'duel')).toHaveLength(2);
    expect(normalizeScoutPlayers([], 'party')).toHaveLength(SCOUT_FORMAT_LIMITS.players.min);
  });

  it('caps a duel at two and a party at eight', () => {
    const many = DEFAULT_PLAYERS.map((p) => ({ ...p }));
    expect(normalizeScoutPlayers(many, 'duel')).toHaveLength(2);
    expect(normalizeScoutPlayers(many, 'party')).toHaveLength(SCOUT_FORMAT_LIMITS.players.max);
    expect(normalizeScoutPlayers([...many, ...many], 'party')).toHaveLength(SCOUT_FORMAT_LIMITS.players.max);
  });

  it('repairs names, emoji and colours, and drops duplicate ids and junk', () => {
    const out = normalizeScoutPlayers(
      [
        { id: ' spoog ', name: '   ', emoji: '', color: 'rebeccapurple' },
        { id: 'spoog', name: 'dupe' },
        null,
        'nope',
        { id: 'rigul', name: '  Rigul  ', emoji: '🐸', color: '#34d399' },
      ],
      'party',
    );
    expect(out.map((p) => p.id)).toEqual(['spoog', 'rigul']);
    expect(out[0].name).toBe(DEFAULT_SCOUT_PLAYERS[0].name);
    expect(out[0].emoji).toBe(DEFAULT_SCOUT_PLAYERS[0].emoji);
    expect(out[0].color).toBe(DEFAULT_SCOUT_PLAYERS[0].color);
    expect(out[1]).toEqual({ id: 'rigul', name: 'Rigul', emoji: '🐸', color: '#34d399' });
  });

  it('truncates a very long name', () => {
    const out = normalizeScoutPlayers([{ id: 'p1', name: 'x'.repeat(80) }], 'duel');
    expect(out[0].name).toHaveLength(24);
  });

  it('is idempotent', () => {
    for (const format of SCOUT_FORMAT_IDS) {
      const once = normalizeScoutPlayers(DEFAULT_PLAYERS.slice(0, 3), format);
      expect(normalizeScoutPlayers(once, format)).toEqual(once);
    }
  });

  it('shares the Songooner roster and maps A / L to the first two seats', () => {
    expect(DEFAULT_SCOUT_PLAYERS).toBe(DEFAULT_PLAYERS);
    expect(DUEL_BUZZ_KEYS).toEqual(['a', 'l']);
  });
});

describe('survival escalation', () => {
  it('walks star → starter → rotation → deepCut, three answers per step', () => {
    expect(SURVIVAL_TIERS).toEqual(['star', 'starter', 'rotation', 'deepCut']);
    expect(SURVIVAL_TIER_STEP).toBe(3);
    expect(survivalTierFor(0)).toBe('star');
    expect(survivalTierFor(2)).toBe('star');
    expect(survivalTierFor(3)).toBe('starter');
    expect(survivalTierFor(5)).toBe('starter');
    expect(survivalTierFor(6)).toBe('rotation');
    expect(survivalTierFor(9)).toBe('deepCut');
    expect(survivalTierFor(99)).toBe('deepCut');
  });

  it('never runs off the end of the tier list, even on nonsense input', () => {
    expect(survivalTierIndex(-4)).toBe(0);
    expect(survivalTierIndex(Number.NaN)).toBe(0);
    expect(survivalTierIndex(10_000)).toBe(SURVIVAL_TIERS.length - 1);
  });

  it('shortens the ladder one rung per tier, down to a floor of two', () => {
    expect(survivalTriesFor(5, 0)).toBe(5);
    expect(survivalTriesFor(5, 3)).toBe(4);
    expect(survivalTriesFor(5, 6)).toBe(3);
    expect(survivalTriesFor(5, 9)).toBe(2);
    expect(survivalTriesFor(5, 99)).toBe(SURVIVAL_MIN_TRIES);
    expect(survivalTriesFor(6, 9)).toBe(3);
  });

  it('never returns more rungs than the base, even when the base is already tiny', () => {
    expect(survivalTriesFor(1, 0)).toBe(1);
    expect(survivalTriesFor(1, 99)).toBe(1);
    expect(survivalTriesFor(2, 99)).toBe(2);
    expect(survivalTriesFor(Number.NaN, 0)).toBe(1);
  });

  it('is monotonically non-increasing in the correct count', () => {
    let prev = survivalTriesFor(6, 0);
    for (let c = 0; c < 40; c++) {
      const now = survivalTriesFor(6, c);
      expect(now).toBeLessThanOrEqual(prev);
      expect(now).toBeGreaterThanOrEqual(SURVIVAL_MIN_TRIES);
      prev = now;
    }
  });
});

describe('blitz constants', () => {
  it('freezes a mid-ladder rung and prices a miss at five seconds', () => {
    expect(BLITZ_LADDER_RUNGS).toBe(5);
    expect(BLITZ_RUNG).toBeGreaterThan(0);
    expect(BLITZ_RUNG).toBeLessThan(BLITZ_LADDER_RUNGS - 1);
    expect(BLITZ_MISS_PENALTY_MS).toBe(5000);
    expect(DEFAULT_SCOUT_BLITZ_DURATION).toBe(90);
  });
});

describe('franchiseIdOf', () => {
  it('reads a team subject as its own franchise', () => {
    const kc = buildTeamSubject(findFixtureTeam('KC'));
    expect(franchiseIdOf(kc)).toBe(findFixtureTeam('KC').id);
  });

  it('reads a player subject from its resolved team', () => {
    const subject = buildPlayerSubject(findFixturePlayer('Patrick Mahomes'), findFixtureTeam('KC'));
    expect(franchiseIdOf(subject)).toBe('12');
  });

  it('falls back to the raw teamId when the team was never resolved', () => {
    const subject = buildPlayerSubject(makePlayer({ id: 'x', teamId: '26' }));
    expect(franchiseIdOf(subject)).toBe('26');
  });

  it('is undefined when there is nothing to read', () => {
    const subject = buildPlayerSubject(makePlayer({ id: 'x', teamId: '' }));
    expect(franchiseIdOf(subject)).toBe('');
    expect(GAUNTLET_SIZE).toBe(32);
  });
});
