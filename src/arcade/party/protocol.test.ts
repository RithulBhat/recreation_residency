import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_LENGTH,
  PARTY_PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  isCompatible,
  makeRoomCode,
  parseMessage,
  parsePlayer,
  parseRoomState,
  peerIdFor,
} from './protocol';
import { createRoom } from './room';

const HOST = { id: 'h', name: 'Host', emoji: '👑', color: '#a855f7' };

describe('makeRoomCode', () => {
  it('uses an alphabet with no misreadable characters', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OI]/);
    const code = makeRoomCode(() => 0.5);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
  });

  it('namespaces the peer id so a party can never collide with a duel', () => {
    expect(peerIdFor('abc234')).toContain('party-');
    expect(peerIdFor('abc234')).toBe(peerIdFor('ABC234'));
  });
});

describe('parsePlayer', () => {
  it('rebuilds a valid player', () => {
    const p = parsePlayer({ id: 'a', name: 'Ana', emoji: '🦊', color: '#f97316', score: 10 });
    expect(p?.name).toBe('Ana');
    expect(p?.score).toBe(10);
  });

  it('rejects a player with no id or name', () => {
    expect(parsePlayer({ name: 'x' })).toBeNull();
    expect(parsePlayer({ id: 'a' })).toBeNull();
    expect(parsePlayer(null)).toBeNull();
  });

  it('refuses a colour that is not real hex — it gets painted into the UI', () => {
    expect(parsePlayer({ id: 'a', name: 'A', color: 'javascript:alert(1)' })?.color).toMatch(
      /^#[0-9a-f]{6}$/i,
    );
  });

  it('truncates an over-long name rather than accepting it', () => {
    const p = parsePlayer({ id: 'a', name: 'x'.repeat(500) });
    expect(p?.name.length).toBe(MAX_NAME_LENGTH);
  });

  it('never trusts a negative or fractional score', () => {
    expect(parsePlayer({ id: 'a', name: 'A', score: -99 })?.score).toBe(0);
    expect(parsePlayer({ id: 'a', name: 'A', score: 1.7 })?.score).toBe(2);
  });
});

describe('parseRoomState', () => {
  const good = { ...createRoom('ABC234', 'price', HOST), seed: 's' };

  it('round-trips a real state', () => {
    const parsed = parseRoomState(JSON.parse(JSON.stringify(good)));
    expect(parsed?.code).toBe('ABC234');
    expect(parsed?.players).toHaveLength(1);
  });

  it('rejects an unknown game or phase', () => {
    expect(parseRoomState({ ...good, game: 'chess' })).toBeNull();
    expect(parseRoomState({ ...good, phase: 'dancing' })).toBeNull();
  });

  it('drops duplicate players rather than seating someone twice', () => {
    const parsed = parseRoomState({ ...good, players: [good.players[0], good.players[0]] });
    expect(parsed?.players).toHaveLength(1);
  });

  it('drops an answer attributed to somebody not in the room', () => {
    const parsed = parseRoomState({ ...good, answers: { h: 5, ghost: 9 } });
    expect(parsed?.answers).toEqual({ h: 5 });
  });

  it('caps an absurd roster', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(parseRoomState({ ...good, players: many })?.players.length).toBeLessThanOrEqual(12);
  });

  it('does not throw on junk', () => {
    expect(parseRoomState(null)).toBeNull();
    expect(parseRoomState('nope')).toBeNull();
    expect(parseRoomState({ code: 'X' })).toBeNull();
  });
});

describe('parseMessage', () => {
  it('accepts every message the protocol defines', () => {
    expect(parseMessage({ type: 'join', v: 1, name: 'Ana', emoji: '🦊' })?.type).toBe('join');
    expect(parseMessage({ type: 'answer', value: 12 })?.type).toBe('answer');
    expect(parseMessage({ type: 'advance' })?.type).toBe('advance');
    expect(parseMessage({ type: 'kick', playerId: 'a' })?.type).toBe('kick');
    expect(parseMessage({ type: 'leave' })?.type).toBe('leave');
    expect(parseMessage({ type: 'host', playerId: 'a' })?.type).toBe('host');
    expect(parseMessage({ type: 'start', settings: {}, seed: 's', totalRounds: 3 })?.type).toBe(
      'start',
    );
  });

  it('parses a JSON string as well as an object', () => {
    expect(parseMessage(JSON.stringify({ type: 'advance' }))?.type).toBe('advance');
  });

  it('rejects an unknown type rather than passing it through', () => {
    expect(parseMessage({ type: 'selfDestruct' })).toBeNull();
  });

  it('rejects a malformed payload for a known type', () => {
    expect(parseMessage({ type: 'join' })).toBeNull();
    expect(parseMessage({ type: 'answer', value: 'lots' })).toBeNull();
    expect(parseMessage({ type: 'answer', value: Infinity })).toBeNull();
    expect(parseMessage({ type: 'kick' })).toBeNull();
  });

  it('rejects an oversized frame without parsing it', () => {
    expect(parseMessage(JSON.stringify({ type: 'leave', reason: 'x'.repeat(400_000) }))).toBeNull();
  });

  it('does not throw on unparseable input', () => {
    expect(parseMessage('{oh no')).toBeNull();
    expect(parseMessage(undefined)).toBeNull();
    expect(parseMessage(42)).toBeNull();
  });

  it('clamps a start with an absurd round count', () => {
    const msg = parseMessage({ type: 'start', settings: null, seed: 's', totalRounds: -5 });
    expect(msg?.type === 'start' && msg.totalRounds).toBe(1);
  });
});

describe('isCompatible', () => {
  it('accepts only this protocol version', () => {
    expect(isCompatible(PARTY_PROTOCOL_VERSION)).toBe(true);
    expect(isCompatible(PARTY_PROTOCOL_VERSION + 1)).toBe(false);
  });
});
