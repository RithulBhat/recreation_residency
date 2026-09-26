import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerConfig } from '@/types';
import { makeTracks } from '@/game/fixtures';
import {
  MAX_ID_ATTEMPTS,
  PONG_TIMEOUT_MS,
  createDuelSession,
  friendlyPeerError,
  type DuelSession,
  type DuelStatus,
} from './duel';
import { type NetMessage, peerIdFor, prepareInitSettings } from './protocol';
import { createFakeNetwork, type FakeNetwork } from './testUtils/fakePeer';

const CODE = 'ABCDEF';
const HOST_ID = peerIdFor(CODE);

const hostMe: PlayerConfig = { id: 'you', name: 'Rithul', emoji: '🎵', color: '#a855f7' };
const guestMe: PlayerConfig = { id: 'you', name: 'Maanu', emoji: '🦊', color: '#f97316' };
const guest2Me: PlayerConfig = { id: 'you', name: 'Gatecrash', emoji: '👻', color: '#818cf8' };

const sessions: DuelSession[] = [];

function track(session: DuelSession): { messages: NetMessage[]; statuses: DuelStatus[]; errors: string[] } {
  const messages: NetMessage[] = [];
  const statuses: DuelStatus[] = [];
  const errors: string[] = [];
  session.on('message', (m) => messages.push(m));
  session.on('status', (s) => statuses.push(s));
  session.on('error', (e) => errors.push(e));
  return { messages, statuses, errors };
}

function open(net: FakeNetwork, role: 'host' | 'guest', me: PlayerConfig, code = CODE): DuelSession {
  const session = createDuelSession({ role, code, me, peerFactory: net.peerFactory });
  sessions.push(session);
  return session;
}

/** A connected host + guest pair, handshake complete. */
async function pair(net: FakeNetwork = createFakeNetwork()) {
  const host = open(net, 'host', hostMe);
  const guest = open(net, 'guest', guestMe);
  await net.flush();
  return { net, host, guest };
}

afterEach(() => {
  for (const s of sessions.splice(0)) s.close();
  vi.useRealTimers();
});

describe('handshake', () => {
  it('walks host and guest through hello → welcome', async () => {
    const net = createFakeNetwork();
    const host = open(net, 'host', hostMe);
    const hostSeen = track(host);
    expect(host.status).toBe('connecting');
    expect(host.code).toBe(CODE);

    const guest = open(net, 'guest', guestMe);
    const guestSeen = track(guest);
    await net.flush();

    expect(host.status).toBe('connected');
    expect(guest.status).toBe('connected');
    expect(host.opponent).toMatchObject({ name: 'Maanu', emoji: '🦊', color: '#f97316' });
    expect(guest.opponent).toMatchObject({ name: 'Rithul', emoji: '🎵', color: '#a855f7' });
    expect(hostSeen.messages.map((m) => m.type)).toEqual(['hello']);
    expect(guestSeen.messages.map((m) => m.type)).toEqual(['welcome']);
    expect(hostSeen.statuses).toEqual(['waiting', 'connected']);
    expect(guestSeen.statuses).toEqual(['connected']);
    expect(hostSeen.errors).toEqual([]);
  });

  it('runs init → ready → start and lands both sides in playing', async () => {
    const { net, host, guest } = await pair();
    const guestSeen = track(guest);
    const hostSeen = track(host);

    const settings = prepareInitSettings({ mode: 'classic', packIds: ['pop-hits'], rounds: 5 }, 'seed-duel');
    host.send({ type: 'init', settings, tracks: makeTracks(6) });
    await net.flush();
    const init = guestSeen.messages.find((m) => m.type === 'init');
    expect(init?.type).toBe('init');
    if (init?.type !== 'init') throw new Error('expected init');
    expect(init.settings.seed).toBe('seed-duel');
    expect(init.settings.rounds).toBe(5);
    expect(init.tracks).toHaveLength(6);

    guest.send({ type: 'ready' });
    await net.flush();
    expect(hostSeen.messages.some((m) => m.type === 'ready')).toBe(true);

    const startAt = Date.now() + 3000;
    host.send({ type: 'start', startAt });
    await net.flush();
    expect(host.status).toBe('playing');
    expect(guest.status).toBe('playing');
    const start = guestSeen.messages.find((m) => m.type === 'start');
    if (start?.type !== 'start') throw new Error('expected start');
    expect(start.startAt).toBe(startAt);
  });

  it('rejects an opponent on a different protocol version', async () => {
    const net = createFakeNetwork();
    const host = open(net, 'host', hostMe);
    const guest = open(net, 'guest', guestMe);
    await net.flush();
    // hand-craft an incompatible hello on the raw connection
    const guestPeer = net.created[1];
    guestPeer.conns[0].send({ type: 'hello', name: 'Old', emoji: '🦊', color: '#fff', version: 99 });
    await net.flush();
    expect(host.status).toBe('error');
    expect(host.error).toMatch(/different version/i);
    expect(guest.status).toBe('connected');
  });

  it('exchanges progress and only reaches finished when BOTH sides are done', async () => {
    const { net, host, guest } = await pair();
    const hostSeen = track(host);

    guest.send({ type: 'start', startAt: Date.now() });
    await net.flush();
    guest.send({
      type: 'progress',
      round: 2,
      score: 1500,
      streak: 1,
      correct: 1,
      status: 'round-over',
      lastVerdict: 'correct',
      at: Date.now(),
    });
    await net.flush();
    const progress = hostSeen.messages.find((m) => m.type === 'progress');
    if (progress?.type !== 'progress') throw new Error('expected progress');
    expect(progress.score).toBe(1500);

    guest.send({ type: 'finished', score: 4000, correct: 4, rounds: 5, durationMs: 60_000 });
    await net.flush();
    expect(host.status).toBe('playing');
    host.send({ type: 'finished', score: 5000, correct: 5, rounds: 5, durationMs: 55_000 });
    await net.flush();
    expect(host.status).toBe('finished');
    expect(guest.status).toBe('finished');
  });

  it('returns both sides to connected after a rematch is accepted', async () => {
    const { net, host, guest } = await pair();
    const hostSeen = track(host);
    host.send({ type: 'start', startAt: Date.now() });
    host.send({ type: 'finished', score: 10, correct: 1, rounds: 1, durationMs: 1 });
    guest.send({ type: 'finished', score: 20, correct: 2, rounds: 1, durationMs: 1 });
    await net.flush();
    expect(host.status).toBe('finished');

    guest.send({ type: 'rematch', seed: 'seed-2' });
    await net.flush();
    const offer = hostSeen.messages.find((m) => m.type === 'rematch');
    if (offer?.type !== 'rematch') throw new Error('expected rematch');
    expect(offer.seed).toBe('seed-2');

    host.send({ type: 'rematchAccept' });
    await net.flush();
    expect(host.status).toBe('connected');
    expect(guest.status).toBe('connected');
  });
});

describe('room occupancy', () => {
  it('allows only one guest and bounces the second with leave', async () => {
    const { net, host, guest } = await pair();
    const g2 = open(net, 'guest', guest2Me);
    const g2Seen = track(g2);
    await net.flush();

    expect(g2Seen.messages.map((m) => m.type)).toContain('leave');
    expect(g2.status).toBe('closed');
    expect(guest.status).toBe('connected');
    expect(host.opponent?.name).toBe('Maanu');
  });

  it('bounces a second guest that arrives in the same tick as the first', async () => {
    const net = createFakeNetwork();
    const host = open(net, 'host', hostMe);
    await net.flush();
    const g1 = open(net, 'guest', guestMe);
    const g2 = open(net, 'guest', guest2Me);
    const g2Seen = track(g2);
    await net.flush();
    expect(g1.status).toBe('connected');
    expect(g2.status).toBe('closed');
    expect(g2Seen.messages.map((m) => m.type)).toContain('leave');
    expect(host.opponent?.name).toBe('Maanu');
  });

  it('frees the room when the guest leaves, so a new guest can join', async () => {
    const { net, host, guest } = await pair();
    guest.close();
    await net.flush();
    expect(host.status).toBe('waiting');
    expect(host.opponent).toBeNull();

    const g2 = open(net, 'guest', guest2Me);
    await net.flush();
    expect(g2.status).toBe('connected');
    expect(host.status).toBe('connected');
    expect(host.opponent?.name).toBe('Gatecrash');
  });

  it('treats a mid-race departure as an error', async () => {
    const { net, host, guest } = await pair();
    host.send({ type: 'start', startAt: Date.now() });
    await net.flush();
    guest.close();
    await net.flush();
    expect(host.status).toBe('error');
    expect(host.error).toMatch(/left|disconnected/i);
  });
});

describe('heartbeat', () => {
  it('measures latency from ping/pong', async () => {
    vi.useFakeTimers();
    const net = createFakeNetwork();
    const host = open(net, 'host', hostMe);
    open(net, 'guest', guestMe);
    await net.flush();
    const latencies: number[] = [];
    host.on('latency', (ms) => latencies.push(ms));

    await vi.advanceTimersByTimeAsync(5000);
    await net.flush();
    expect(latencies.length).toBeGreaterThan(0);
    expect(host.latencyMs).toBeGreaterThanOrEqual(0);
    expect(host.status).toBe('connected');
  });

  it('errors with "Opponent disconnected" when pongs stop', async () => {
    vi.useFakeTimers();
    const net = createFakeNetwork();
    const host = open(net, 'host', hostMe);
    open(net, 'guest', guestMe);
    await net.flush();
    expect(host.status).toBe('connected');

    net.mute(net.created[1].id); // the guest goes silent without closing
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS + 6000);
    await net.flush();

    expect(host.status).toBe('error');
    expect(host.error).toBe('Opponent disconnected');
  });
});

describe('peer failures', () => {
  it('maps peer-unavailable to "Room not found"', async () => {
    const net = createFakeNetwork();
    const guest = open(net, 'guest', guestMe, 'ZZZZZZ');
    await net.flush();
    expect(guest.status).toBe('error');
    expect(guest.error).toBe('Room not found');
  });

  it('retries with a fresh code when the room id is taken', async () => {
    const net = createFakeNetwork({ taken: [HOST_ID] });
    const host = open(net, 'host', hostMe);
    await net.flush();
    expect(host.status).toBe('waiting');
    expect(host.code).not.toBe(CODE);
    expect(net.created).toHaveLength(2);
    expect(net.created[1].id).toBe(peerIdFor(host.code));
  });

  it('gives up after MAX_ID_ATTEMPTS taken codes', async () => {
    const net = createFakeNetwork({ takeAll: true });
    const host = open(net, 'host', hostMe);
    await net.flush();
    expect(net.created).toHaveLength(MAX_ID_ATTEMPTS);
    expect(host.status).toBe('error');
    expect(host.error).toMatch(/room code/i);
  });

  it('reconnects to the signalling server exactly once', async () => {
    const { net, host } = await pair();
    const peer = net.peer(HOST_ID);
    if (!peer) throw new Error('host peer missing');

    peer.emitDisconnected();
    await net.flush();
    expect(peer.reconnectCount).toBe(1);
    expect(host.status).toBe('connected');

    peer.emitDisconnected();
    await net.flush();
    expect(peer.reconnectCount).toBe(1);
    expect(host.status).toBe('error');
    expect(host.error).toMatch(/matchmaking server/i);
  });

  it('surfaces a network error with friendly copy', async () => {
    const { net, guest } = await pair();
    net.created[1].emitError('network');
    expect(guest.status).toBe('error');
    expect(guest.error).toBe("Can't reach the matchmaking server");
  });

  it('replaces an invalid host code with a valid one', async () => {
    const net = createFakeNetwork();
    const session = createDuelSession({ role: 'host', code: 'oops!', me: hostMe, peerFactory: net.peerFactory });
    sessions.push(session);
    expect(session.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    await net.flush();
    expect(session.status).toBe('waiting');
  });

  it('refuses to dial an invalid room code', async () => {
    const session = createDuelSession({
      role: 'guest',
      code: 'nope',
      me: guestMe,
      peerFactory: createFakeNetwork().peerFactory,
    });
    sessions.push(session);
    await new Promise((r) => setTimeout(r, 1));
    expect(session.status).toBe('error');
    expect(session.error).toMatch(/room code/i);
  });

  it('refuses to dial without a code', async () => {
    const session = createDuelSession({ role: 'guest', me: guestMe, peerFactory: createFakeNetwork().peerFactory });
    sessions.push(session);
    await new Promise((r) => setTimeout(r, 1));
    expect(session.status).toBe('error');
    expect(session.error).toMatch(/room code/i);
  });

  it('maps every PeerJS error type we care about', () => {
    expect(friendlyPeerError('peer-unavailable')).toBe('Room not found');
    expect(friendlyPeerError('network')).toBe("Can't reach the matchmaking server");
    expect(friendlyPeerError('browser-incompatible')).toMatch(/browser/i);
    expect(friendlyPeerError('server-error')).toMatch(/matchmaking server/i);
    expect(friendlyPeerError('unavailable-id')).toMatch(/room code/i);
    expect(friendlyPeerError('webrtc')).toMatch(/peer-to-peer/i);
    expect(friendlyPeerError(undefined)).toBe('Connection error');
    expect(friendlyPeerError('who-knows', 'fallback')).toBe('fallback');
  });
});

describe('close', () => {
  it('says goodbye, destroys the peer and stops emitting', async () => {
    const { net, host, guest } = await pair();
    const guestSeen = track(guest);
    host.close('done');
    await net.flush();

    expect(host.status).toBe('closed');
    expect(net.peer(HOST_ID)).toBeUndefined();
    expect(guestSeen.messages.some((m) => m.type === 'leave')).toBe(true);
    expect(guest.status).toBe('closed');

    // a closed session is inert
    host.send({ type: 'ping', t: 1 });
    await net.flush();
    expect(host.status).toBe('closed');
  });

  it('unsubscribes listeners on demand', async () => {
    const { net, host, guest } = await pair();
    const seen: NetMessage[] = [];
    const off = host.on('message', (m) => seen.push(m));
    guest.send({ type: 'emote', emoji: '🔥' });
    await net.flush();
    expect(seen).toHaveLength(1);
    off();
    guest.send({ type: 'emote', emoji: '💀' });
    await net.flush();
    expect(seen).toHaveLength(1);
  });
});
