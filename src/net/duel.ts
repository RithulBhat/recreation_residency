/**
 * `createDuelSession` — one PeerJS connection between exactly two players, wrapped in a tiny
 * typed emitter. No backend: the public PeerJS cloud (0.peerjs.com, no key) is used purely for
 * signalling; game messages travel peer-to-peer over a reliable WebRTC data channel.
 *
 * Host: `new Peer('sgnr-<code>')` — the room code IS the peer id, so the guest needs nothing but
 * the code. If the id is taken ('unavailable-id') a new code is drawn, up to `MAX_ID_ATTEMPTS`.
 * Guest: an anonymous peer that `connect()`s to `peerIdFor(code)` with `{ reliable: true }`.
 *
 * Liveness: a `ping` every `PING_INTERVAL_MS`; the peer echoes `pong` with the same clock stamp,
 * so `latencyMs` is a true round trip and no clock sync is needed. No pong for
 * `PONG_TIMEOUT_MS` → status 'error' with "Opponent disconnected".
 *
 * Only ONE guest per room: a second incoming connection is answered with `leave` and closed.
 *
 * Everything PeerJS-shaped goes through the `PeerLike` / `ConnLike` interfaces, so tests inject
 * `createFakeNetwork()` (src/net/testUtils/fakePeer.ts) and never touch the network.
 */

import type { PlayerConfig } from '@/types';
import {
  helloFor,
  isCompatible,
  makeRoomCode,
  type NetMessage,
  normalizeRoomCode,
  parseMessage,
  peerIdFor,
  playerFromHandshake,
  welcomeFor,
} from './protocol';

export const PING_INTERVAL_MS = 5000;
export const PONG_TIMEOUT_MS = 15000;
/** Room-code collisions are rare; three tries is plenty before we give up. */
export const MAX_ID_ATTEMPTS = 3;

export type DuelRole = 'host' | 'guest';

export type DuelStatus =
  | 'connecting' // opening the peer / dialling the room
  | 'waiting' // host: room is live, nobody has joined yet
  | 'connected' // handshake done, both identities known
  | 'playing' // a `start` has been exchanged
  | 'finished' // both sides reported `finished`
  | 'error'
  | 'closed';

/** Minimal shape of a PeerJS error (`PeerError`) — only what we map to a message. */
export interface NetErrorLike {
  type?: string;
  message?: string;
}

/** The parts of a PeerJS `DataConnection` this module uses. */
export interface ConnLike {
  readonly peer: string;
  readonly open: boolean;
  send(data: unknown): void | Promise<void>;
  close(options?: { flush?: boolean }): void;
  on(event: 'open', cb: () => void): void;
  on(event: 'data', cb: (data: unknown) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (err: NetErrorLike) => void): void;
}

/** The parts of a PeerJS `Peer` this module uses. */
export interface PeerLike {
  readonly id: string;
  readonly open: boolean;
  readonly destroyed: boolean;
  connect(peer: string, options?: { reliable?: boolean }): ConnLike;
  reconnect(): void;
  destroy(): void;
  on(event: 'open', cb: (id: string) => void): void;
  on(event: 'connection', cb: (conn: ConnLike) => void): void;
  on(event: 'disconnected', cb: (currentId: string) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (err: NetErrorLike) => void): void;
}

/** A factory may be handed the desired peer id (host) or nothing at all (guest). */
export type PeerFactory = (id?: string) => PeerLike;

export interface DuelEvents {
  status: (status: DuelStatus) => void;
  message: (msg: NetMessage) => void;
  opponent: (opponent: PlayerConfig | null) => void;
  error: (message: string) => void;
  latency: (ms: number) => void;
}

export interface DuelSession {
  /** The room code. May change once while hosting if the first code was taken. */
  readonly code: string;
  readonly role: DuelRole;
  readonly status: DuelStatus;
  readonly opponent: PlayerConfig | null;
  /** Round-trip time in ms, 0 until the first pong. */
  readonly latencyMs: number;
  readonly error: string | null;
  send(msg: NetMessage): void;
  on<E extends keyof DuelEvents>(event: E, cb: DuelEvents[E]): () => void;
  close(reason?: string): void;
}

export interface CreateDuelOptions {
  role: DuelRole;
  /** Host: the code to claim (a fresh one is drawn when omitted). Guest: required. */
  code?: string;
  me: PlayerConfig;
  /** Injected for tests; defaults to a lazily imported real PeerJS `Peer`. */
  peerFactory?: PeerFactory;
  /** Injected clock, for tests. */
  now?: () => number;
}

/** Friendly copy for every PeerJS error type we can hit. */
export function friendlyPeerError(type: string | undefined, fallback = 'Connection error'): string {
  switch (type) {
    case 'peer-unavailable':
      return 'Room not found';
    case 'network':
      return "Can't reach the matchmaking server";
    case 'browser-incompatible':
      return "This browser can't do peer-to-peer (try Chrome, Safari or Firefox)";
    case 'server-error':
      return 'The matchmaking server is having a moment — try again';
    case 'unavailable-id':
      return 'That room code is already in use';
    case 'invalid-id':
    case 'invalid-key':
      return 'That room code is invalid';
    case 'ssl-unavailable':
    case 'socket-error':
    case 'socket-closed':
      return 'Lost the connection to the matchmaking server';
    case 'disconnected':
      return 'Disconnected from the matchmaking server';
    case 'webrtc':
    case 'negotiation-failed':
      return "Couldn't open a direct connection — your network may block peer-to-peer";
    case 'connection-closed':
      return 'Opponent disconnected';
    default:
      return fallback;
  }
}

type AnyHandler = (...args: never[]) => void;

/** Lazily imported so the PeerJS bundle only loads when someone actually opens a duel. */
let peerModule: Promise<typeof import('peerjs')> | null = null;

function loadPeer(): Promise<typeof import('peerjs')> {
  peerModule ??= import('peerjs');
  return peerModule;
}

export function createDuelSession(opts: CreateDuelOptions): DuelSession {
  const { role, me } = opts;
  const now = opts.now ?? (() => Date.now());
  const listeners = new Map<keyof DuelEvents, Set<AnyHandler>>();

  // A host's bad code is simply replaced; a guest's bad code is a dead end (see below).
  const requestedCode = opts.code ? normalizeRoomCode(opts.code) : null;
  let code = requestedCode ?? makeRoomCode();
  let status: DuelStatus = 'connecting';
  let opponent: PlayerConfig | null = null;
  let latencyMs = 0;
  let errorMessage: string | null = null;

  let peer: PeerLike | null = null;
  let conn: ConnLike | null = null;
  /** Host: the connection that owns the room's single guest slot, claimed before it even opens. */
  let claimed: ConnLike | null = null;
  let idAttempts = 0;
  let reconnectTried = false;
  let closed = false;
  let localFinished = false;
  let remoteFinished = false;
  let lastPongAt = 0;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function emit<E extends keyof DuelEvents>(event: E, ...args: Parameters<DuelEvents[E]>): void {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of Array.from(set)) {
      (cb as unknown as (...a: Parameters<DuelEvents[E]>) => void)(...args);
    }
  }

  function setStatus(next: DuelStatus): void {
    if (status === next || status === 'closed') return;
    status = next;
    emit('status', next);
  }

  function setOpponent(next: PlayerConfig | null): void {
    opponent = next;
    emit('opponent', next);
  }

  function stopHeartbeat(): void {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  function fail(message: string): void {
    if (closed || status === 'error') return;
    stopHeartbeat();
    errorMessage = message;
    emit('error', message);
    setStatus('error');
  }

  function rawSend(msg: NetMessage): void {
    if (!conn || !conn.open) return;
    try {
      const result = conn.send(msg);
      if (result && typeof result.then === 'function') result.then(undefined, () => undefined);
    } catch {
      // A send into a half-closed channel is not fatal; the heartbeat will notice.
    }
  }

  function send(msg: NetMessage): void {
    switch (msg.type) {
      case 'start':
        localFinished = false;
        remoteFinished = false;
        setStatus('playing');
        break;
      case 'finished':
        localFinished = true;
        if (remoteFinished) setStatus('finished');
        break;
      case 'rematchAccept':
        localFinished = false;
        remoteFinished = false;
        setStatus('connected');
        break;
      default:
        break;
    }
    rawSend(msg);
  }

  function startHeartbeat(): void {
    stopHeartbeat();
    lastPongAt = now();
    heartbeat = setInterval(() => {
      if (closed || status === 'error') {
        stopHeartbeat();
        return;
      }
      if (now() - lastPongAt > PONG_TIMEOUT_MS) {
        fail('Opponent disconnected');
        return;
      }
      rawSend({ type: 'ping', t: now() });
    }, PING_INTERVAL_MS);
  }

  /** The opponent went away. Hosts fall back to 'waiting' so a new guest can walk in. */
  function handleGone(reason: string): void {
    stopHeartbeat();
    conn = null;
    claimed = null;
    setOpponent(null);
    if (closed) return;
    if (status === 'playing') {
      fail(reason);
      return;
    }
    if (role === 'host' && peer && !peer.destroyed) {
      localFinished = false;
      remoteFinished = false;
      setStatus('waiting');
    } else {
      setStatus('closed');
    }
  }

  function handleMessage(msg: NetMessage): void {
    lastPongAt = now();
    switch (msg.type) {
      case 'hello': {
        if (role !== 'host') break;
        if (!isCompatible(msg.version)) {
          fail('Your opponent is running a different version of Songooner');
          return;
        }
        rawSend(welcomeFor(me));
        setOpponent(playerFromHandshake(msg, conn?.peer ?? 'guest'));
        setStatus('connected');
        break;
      }
      case 'welcome': {
        if (role !== 'guest') break;
        setOpponent(playerFromHandshake(msg, conn?.peer ?? 'host'));
        setStatus('connected');
        break;
      }
      case 'ping':
        rawSend({ type: 'pong', t: msg.t });
        break;
      case 'pong':
        latencyMs = Math.max(0, now() - msg.t);
        emit('latency', latencyMs);
        break;
      case 'start':
        localFinished = false;
        remoteFinished = false;
        setStatus('playing');
        break;
      case 'finished':
        remoteFinished = true;
        if (localFinished) setStatus('finished');
        break;
      case 'rematchAccept':
        localFinished = false;
        remoteFinished = false;
        setStatus('connected');
        break;
      case 'leave':
        emit('message', msg);
        handleGone(msg.reason ?? 'Opponent left the duel');
        return;
      default:
        break;
    }
    emit('message', msg);
  }

  function bindConn(next: ConnLike): void {
    next.on('open', () => {
      if (closed) {
        next.close();
        return;
      }
      conn = next;
      startHeartbeat();
      if (role === 'guest') rawSend(helloFor(me));
    });
    next.on('data', (data) => {
      const msg = parseMessage(data);
      if (msg) handleMessage(msg);
    });
    next.on('close', () => {
      if (claimed === next) claimed = null;
      if (conn !== next) return; // a bounced or superseded connection
      handleGone('Opponent disconnected');
    });
    next.on('error', (err) => {
      if (conn && conn !== next) return;
      fail(friendlyPeerError(err.type, 'Connection lost'));
    });
  }

  function rejectExtra(extra: ConnLike): void {
    const bounce = (): void => {
      try {
        extra.send({ type: 'leave', reason: 'This room already has two players' });
      } catch {
        // ignore — we are closing it anyway
      }
      extra.close({ flush: true });
    };
    if (extra.open) bounce();
    else extra.on('open', bounce);
  }

  /** Host: the room is live. Guest: dial the room — but never twice (see 'disconnected'). */
  function onPeerOpen(p: PeerLike): void {
    if (conn) return;
    if (role === 'host') setStatus('waiting');
    else bindConn(p.connect(peerIdFor(code), { reliable: true }));
  }

  function bindPeer(next: PeerLike): void {
    /** Events from a peer we already replaced (a retried room code) are dead letters. */
    const stale = (): boolean => peer !== next;

    next.on('open', () => {
      if (stale()) return;
      if (closed) {
        next.destroy();
        return;
      }
      onPeerOpen(next);
    });

    next.on('connection', (incoming) => {
      if (stale() || role !== 'host' || closed) {
        rejectExtra(incoming);
        return;
      }
      if (claimed || (conn && conn.open)) {
        rejectExtra(incoming);
        return;
      }
      claimed = incoming;
      bindConn(incoming);
    });

    next.on('disconnected', () => {
      if (stale() || closed || status === 'error') return;
      if (!reconnectTried && !next.destroyed) {
        reconnectTried = true;
        try {
          next.reconnect();
        } catch {
          fail('Disconnected from the matchmaking server');
        }
        return;
      }
      fail('Disconnected from the matchmaking server');
    });

    next.on('close', () => {
      if (stale() || closed) return;
      if (status !== 'error') setStatus('closed');
    });

    next.on('error', (err) => {
      if (stale() || closed) return;
      if (err.type === 'unavailable-id' && role === 'host' && !conn) {
        if (idAttempts < MAX_ID_ATTEMPTS - 1) {
          idAttempts++;
          peer = null; // retire this peer first: its 'close' must not close the session
          try {
            next.destroy();
          } catch {
            // ignore
          }
          code = makeRoomCode();
          openPeer();
          return;
        }
        fail("Couldn't claim a room code — try again");
        return;
      }
      fail(friendlyPeerError(err.type));
    });
  }

  function attach(p: PeerLike): void {
    if (closed) {
      p.destroy();
      return;
    }
    peer = p;
    bindPeer(p);
    // A peer created already-open (fakes, or a warm PeerJS socket) never re-emits 'open'.
    if (p.open) onPeerOpen(p);
  }

  function openPeer(): void {
    setStatus('connecting');
    const factory = opts.peerFactory;
    if (factory) {
      attach(factory(role === 'host' ? peerIdFor(code) : undefined));
      return;
    }
    loadPeer().then(
      ({ Peer }) => {
        if (closed) return;
        attach(role === 'host' ? new Peer(peerIdFor(code)) : new Peer());
      },
      () => fail("Couldn't load the peer-to-peer engine"),
    );
  }

  function close(reason?: string): void {
    if (closed) return;
    closed = true;
    stopHeartbeat();
    if (conn) {
      try {
        conn.send({ type: 'leave', reason });
      } catch {
        // ignore
      }
      try {
        conn.close({ flush: true });
      } catch {
        // ignore
      }
      conn = null;
    }
    if (peer) {
      try {
        peer.destroy();
      } catch {
        // ignore
      }
    }
    status = 'closed';
    emit('status', 'closed');
    listeners.clear();
  }

  if (role === 'guest' && !requestedCode) {
    // Nothing valid to dial — surface it instead of silently hanging.
    setTimeout(() => fail('Enter a valid room code to join'), 0);
  } else {
    openPeer();
  }

  return {
    get code() {
      return code;
    },
    role,
    get status() {
      return status;
    },
    get opponent() {
      return opponent;
    },
    get latencyMs() {
      return latencyMs;
    },
    get error() {
      return errorMessage;
    },
    send,
    on(event, cb) {
      const set = listeners.get(event) ?? new Set<AnyHandler>();
      listeners.set(event, set);
      set.add(cb as AnyHandler);
      return () => {
        set.delete(cb as AnyHandler);
      };
    },
    close,
  };
}
