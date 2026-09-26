import { describe, expect, it } from 'vitest';
import { makeTrack, makeTracks } from '@/game/fixtures';
import { DEFAULT_SETTINGS } from '@/game/presets';
import {
  MAX_INIT_TRACKS,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  codeFromPeerId,
  helloFor,
  isCompatible,
  isRoomCode,
  makeRoomCode,
  normalizeRoomCode,
  parseMessage,
  parseTrack,
  peerIdFor,
  playerFromHandshake,
  prepareInitSettings,
  sanitizeRoomCodeInput,
  trimTrackPool,
  welcomeFor,
} from './protocol';
import type { NetMessage } from './protocol';

const me = { id: 'you', name: 'Rithul', emoji: '🎧', color: '#a855f7' };

describe('parseMessage — valid messages', () => {
  const valid: NetMessage[] = [
    { type: 'hello', name: 'Maanu', emoji: '🦊', color: '#f97316', version: PROTOCOL_VERSION },
    { type: 'welcome', hostName: 'Rithul', emoji: '🎵', color: '#22d3ee' },
    { type: 'ready' },
    { type: 'start', startAt: 1_700_000_000_000 },
    {
      type: 'progress',
      round: 3,
      score: 2400,
      streak: 2,
      correct: 2,
      status: 'round-over',
      lastVerdict: 'correct',
      at: 1_700_000_000_000,
    },
    { type: 'finished', score: 8000, correct: 7, rounds: 10, durationMs: 123_456 },
    { type: 'emote', emoji: '🔥' },
    { type: 'rematch', seed: 'abc123' },
    { type: 'rematchAccept' },
    { type: 'ping', t: 1000 },
    { type: 'pong', t: 1000 },
    { type: 'leave' },
    { type: 'leave', reason: 'gtg' },
  ];

  it.each(valid.map((m) => [m.type, m] as const))('round-trips %s', (_type, msg) => {
    expect(parseMessage(msg)).toEqual(msg);
    // and through the wire format
    expect(parseMessage(JSON.stringify(msg))).toEqual(msg);
  });

  it('accepts an init and normalizes its settings', () => {
    const tracks = makeTracks(4);
    const parsed = parseMessage({
      type: 'init',
      settings: { mode: 'classic', packIds: ['pop-hits'], seed: 'seed-1', rounds: 5 },
      tracks,
    });
    expect(parsed?.type).toBe('init');
    if (parsed?.type !== 'init') throw new Error('unreachable');
    expect(parsed.settings.seed).toBe('seed-1');
    expect(parsed.settings.rounds).toBe(5);
    // normalizeSettings fills in everything else
    expect(parsed.settings.stages).toEqual(DEFAULT_SETTINGS.stages);
    expect(parsed.tracks).toHaveLength(4);
    expect(parsed.tracks[0].id).toBe(tracks[0].id);
  });

  it('keeps optional track fields and drops unknown ones', () => {
    const parsed = parseMessage({
      type: 'init',
      settings: { mode: 'fixed', packIds: ['p'], seed: 's' },
      tracks: [{ ...makeTrack({ id: 7, releaseYear: 2019, bpm: 171, packId: 'pop-hits' }), nefarious: 'x' }],
    });
    if (parsed?.type !== 'init') throw new Error('expected init');
    expect(parsed.tracks[0].releaseYear).toBe(2019);
    expect(parsed.tracks[0].bpm).toBe(171);
    expect(parsed.tracks[0].packId).toBe('pop-hits');
    expect('nefarious' in parsed.tracks[0]).toBe(false);
  });

  it('de-duplicates and caps the init pool at MAX_INIT_TRACKS', () => {
    const many = makeTracks(MAX_INIT_TRACKS + 40);
    const parsed = parseMessage({ type: 'init', settings: { mode: 'classic', packIds: ['p'], seed: 's' }, tracks: many });
    if (parsed?.type !== 'init') throw new Error('expected init');
    expect(parsed.tracks).toHaveLength(MAX_INIT_TRACKS);

    const dupes = [makeTrack({ id: 1 }), makeTrack({ id: 1 }), makeTrack({ id: 2 })];
    const parsedDupes = parseMessage({ type: 'init', settings: { mode: 'classic', packIds: ['p'] }, tracks: dupes });
    if (parsedDupes?.type !== 'init') throw new Error('expected init');
    expect(parsedDupes.tracks.map((t) => t.id)).toEqual([1, 2]);
  });

  it('clamps hostile numbers and strings instead of trusting them', () => {
    const parsed = parseMessage({
      type: 'progress',
      round: -5,
      score: 1234.7,
      streak: -1,
      correct: 2.2,
      status: 'playing',
      lastVerdict: 'nope',
      at: -1,
    });
    expect(parsed).toEqual({
      type: 'progress',
      round: 0,
      score: 1235,
      streak: 0,
      correct: 2,
      status: 'playing',
      lastVerdict: null,
      at: 0,
    });
  });

  it('falls back to safe defaults for a bad emoji/color on hello', () => {
    const parsed = parseMessage({ type: 'hello', name: '  Maanu  ', emoji: '', color: 'red', version: 1 });
    expect(parsed).toEqual({ type: 'hello', name: 'Maanu', emoji: '🎧', color: '#a855f7', version: 1 });
  });

  it('truncates an over-long name', () => {
    const parsed = parseMessage({ type: 'hello', name: 'x'.repeat(200), emoji: '🦊', color: '#fff', version: 1 });
    if (parsed?.type !== 'hello') throw new Error('expected hello');
    expect(parsed.name).toHaveLength(24);
  });
});

describe('parseMessage — invalid messages', () => {
  const invalid: unknown[] = [
    null,
    undefined,
    42,
    'not json',
    '[]',
    [],
    {},
    { type: 'nope' },
    { type: 'hello' },
    { type: 'hello', name: '', emoji: '🦊', color: '#fff', version: 1 },
    { type: 'hello', name: 'A', version: 'one' },
    { type: 'welcome' },
    { type: 'start' },
    { type: 'start', startAt: 'soon' },
    { type: 'start', startAt: Number.NaN },
    { type: 'progress', round: 1 },
    { type: 'progress', round: 1, score: 1, streak: 0, correct: 0, status: 'bogus', at: 1 },
    { type: 'finished', score: 1, correct: 1, rounds: 1 },
    { type: 'emote' },
    { type: 'emote', emoji: '   ' },
    { type: 'rematch' },
    { type: 'ping' },
    { type: 'pong', t: null },
    { type: 'init', settings: { mode: 'classic', packIds: ['p'] } },
    { type: 'init', settings: 'nope', tracks: [] },
    { type: 'init', settings: {}, tracks: [] },
    { type: 'init', settings: {}, tracks: [{ nope: true }] },
  ];

  it.each(invalid.map((v, i) => [i, v] as const))('rejects #%i', (_i, value) => {
    expect(parseMessage(value)).toBeNull();
  });

  it('rejects an oversized wire string without parsing it', () => {
    const huge = JSON.stringify({ type: 'emote', emoji: '🔥', pad: 'x'.repeat(MAX_MESSAGE_BYTES + 10) });
    expect(huge.length).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(parseMessage(huge)).toBeNull();
  });

  it('rejects an absurd track count outright', () => {
    const absurd = Array.from({ length: MAX_INIT_TRACKS * 8 + 1 }, (_, i) => makeTrack({ id: i + 1 }));
    expect(parseMessage({ type: 'init', settings: { mode: 'classic', packIds: ['p'] }, tracks: absurd })).toBeNull();
  });

  it('parseTrack rejects junk', () => {
    expect(parseTrack(null)).toBeNull();
    expect(parseTrack({ id: 'x', title: 't', artist: 'a' })).toBeNull();
    expect(parseTrack({ id: 1, title: '', artist: 'a' })).toBeNull();
    expect(parseTrack({ id: 1, title: 't' })).toBeNull();
  });
});

describe('handshake helpers', () => {
  it('builds hello/welcome from a PlayerConfig', () => {
    expect(helloFor(me)).toEqual({ type: 'hello', name: 'Rithul', emoji: '🎧', color: '#a855f7', version: 1 });
    expect(welcomeFor({ ...me, name: '' })).toEqual({
      type: 'welcome',
      hostName: 'Host',
      emoji: '🎧',
      color: '#a855f7',
    });
  });

  it('derives the opponent PlayerConfig', () => {
    const hello = helloFor({ ...me, name: 'Maanu', emoji: '🦊', color: '#f97316' });
    expect(playerFromHandshake(hello, 'peer-1')).toEqual({
      id: 'peer-1',
      name: 'Maanu',
      emoji: '🦊',
      color: '#f97316',
    });
    expect(playerFromHandshake(welcomeFor(me), 'host').name).toBe('Rithul');
  });

  it('only accepts the current protocol version', () => {
    expect(isCompatible(PROTOCOL_VERSION)).toBe(true);
    expect(isCompatible(PROTOCOL_VERSION + 1)).toBe(false);
    expect(isCompatible(0)).toBe(false);
  });
});

describe('room codes', () => {
  it('only draws from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it('is deterministic with an injected random', () => {
    expect(makeRoomCode(() => 0)).toBe('AAAAAA');
    expect(makeRoomCode(() => 0.999999)).toBe('999999');
  });

  it('has no lookalike characters in the alphabet', () => {
    for (const ch of '01OI') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
  });

  it('normalizes trimmed, lower-case and separated input', () => {
    expect(normalizeRoomCode(' abcdef ')).toBe('ABCDEF');
    expect(normalizeRoomCode('abc-def')).toBe('ABCDEF');
    expect(normalizeRoomCode('ABC DEF')).toBe('ABCDEF');
    expect(normalizeRoomCode('a2b3c4')).toBe('A2B3C4');
  });

  it('rejects wrong lengths and lookalike characters', () => {
    expect(normalizeRoomCode('ABCDE')).toBeNull();
    expect(normalizeRoomCode('ABCDEFG')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
    expect(normalizeRoomCode('ABCDE0')).toBeNull(); // 0 is not in the alphabet
    expect(normalizeRoomCode('ABCDE1')).toBeNull();
    expect(normalizeRoomCode('ABCDEO')).toBeNull();
    expect(normalizeRoomCode('ABCDEI')).toBeNull();
    expect(isRoomCode('ABCDEF')).toBe(true);
    expect(isRoomCode('ABCD0F')).toBe(false);
  });

  it('sanitizes progressive typing for the input field', () => {
    expect(sanitizeRoomCodeInput('ab')).toBe('AB');
    expect(sanitizeRoomCodeInput('a-b c1d')).toBe('ABCD');
    expect(sanitizeRoomCodeInput('abcdefghij')).toBe('ABCDEF');
    expect(sanitizeRoomCodeInput('0110')).toBe('');
  });

  it('maps codes to namespaced peer ids and back', () => {
    expect(peerIdFor('ABCDEF')).toBe('sgnr-abcdef');
    expect(peerIdFor('abcdef')).toBe('sgnr-abcdef');
    expect(codeFromPeerId('sgnr-abcdef')).toBe('ABCDEF');
    expect(codeFromPeerId('other-abcdef')).toBeNull();
    expect(codeFromPeerId('sgnr-abc')).toBeNull();
  });
});

describe('init payload shaping', () => {
  it('trims and de-duplicates the pool', () => {
    const pool = [...makeTracks(80), makeTrack({ id: 1 })];
    const trimmed = trimTrackPool(pool);
    expect(trimmed).toHaveLength(MAX_INIT_TRACKS);
    expect(new Set(trimmed.map((t) => t.id)).size).toBe(MAX_INIT_TRACKS);
    expect(trimTrackPool([makeTrack({ id: 1 }), makeTrack({ id: 1 })])).toHaveLength(1);
  });

  it('forces a solo race: no same-device modes, no player list, always seeded', () => {
    const settings = prepareInitSettings(
      { mode: 'duel', packIds: ['pop-hits'], players: [{ id: 'p1', name: 'A', emoji: '🦊', color: '#fff' }] },
      'seed-x',
    );
    expect(settings.mode).toBe('classic');
    expect(settings.players).toEqual([]);
    expect(settings.seed).toBe('seed-x');
  });

  it('gives an endless game a finish line (except blitz/survival)', () => {
    expect(prepareInitSettings({ mode: 'classic', packIds: ['p'], rounds: 0 }, 's').rounds).toBe(10);
    expect(prepareInitSettings({ mode: 'blitz', packIds: ['p'], rounds: 0 }, 's').rounds).toBe(0);
    expect(prepareInitSettings({ mode: 'survival', packIds: ['p'], rounds: 0 }, 's').rounds).toBe(0);
  });

  it('drops the daily flag (a duel is never a daily run)', () => {
    expect(prepareInitSettings({ mode: 'classic', packIds: ['p'], daily: '2026-09-26' }, 's').daily).toBeUndefined();
  });

  it('survives a parse round-trip unchanged (both peers end up with identical settings)', () => {
    const settings = prepareInitSettings({ mode: 'classic', packIds: ['pop-hits'], rounds: 6 }, 'seed-y');
    const parsed = parseMessage({ type: 'init', settings, tracks: makeTracks(3) });
    if (parsed?.type !== 'init') throw new Error('expected init');
    expect(parsed.settings).toEqual(settings);
  });
});
