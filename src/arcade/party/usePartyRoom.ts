/**
 * PeerJS transport for a party room.
 *
 * Star topology: the host is a PeerJS peer whose id is derived from the room code, and every
 * client dials that id directly. The host runs `room.ts` and broadcasts the resulting state;
 * clients render what they are sent and send intents back. No client ever mutates shared state,
 * so a hostile client can lie about its own answer and nothing else.
 *
 * All rules live in the reducer. This file only moves bytes and manages sockets, which is why
 * late joins, disconnects, host migration and kicking are testable without a network.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataConnection, Peer } from 'peerjs';
import type { PartyGame, PartyMessage, PartyRoomState } from './protocol';
import { PARTY_PROTOCOL_VERSION, makeRoomCode, parseMessage, peerIdFor } from './protocol';
import { createRoom, reduce, type RoomAction } from './room';

export type PartyRole = 'host' | 'client';
export type PartyStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

export interface PartyIdentity {
  name: string;
  emoji: string;
  color: string;
}

export interface UsePartyRoom {
  status: PartyStatus;
  error: string | null;
  role: PartyRole | null;
  code: string | null;
  /** This peer's own player id. */
  selfId: string | null;
  state: PartyRoomState | null;
  host: (game: PartyGame, identity: PartyIdentity) => Promise<void>;
  join: (code: string, identity: PartyIdentity) => Promise<void>;
  /** Host only: apply an action locally and broadcast the result. */
  apply: (action: RoomAction) => void;
  /** Client only: send an intent to the host. */
  send: (message: PartyMessage) => void;
  leave: () => void;
}

/** PeerJS is a heavy dependency and only party mode needs it, so it is imported on demand. */
async function loadPeer(): Promise<typeof import('peerjs')> {
  return import('peerjs');
}

export function usePartyRoom(): UsePartyRoom {
  const [status, setStatus] = useState<PartyStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<PartyRole | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [state, setState] = useState<PartyRoomState | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const hostConnRef = useRef<DataConnection | null>(null);
  const stateRef = useRef<PartyRoomState | null>(null);

  const setRoom = useCallback((next: PartyRoomState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const broadcast = useCallback((next: PartyRoomState) => {
    for (const conn of connectionsRef.current.values()) {
      if (conn.open) conn.send({ type: 'state', state: next });
    }
  }, []);

  const apply = useCallback(
    (action: RoomAction) => {
      const current = stateRef.current;
      if (!current) return;
      const next = reduce(current, action);
      if (next === current) return;
      setRoom(next);
      broadcast(next);
    },
    [broadcast, setRoom],
  );

  const teardown = useCallback(() => {
    for (const conn of connectionsRef.current.values()) {
      try {
        conn.close();
      } catch {
        /* already gone */
      }
    }
    connectionsRef.current.clear();
    hostConnRef.current = null;
    try {
      peerRef.current?.destroy();
    } catch {
      /* already gone */
    }
    peerRef.current = null;
  }, []);

  const host = useCallback(
    async (game: PartyGame, identity: PartyIdentity) => {
      setStatus('connecting');
      setError(null);
      try {
        const { Peer: PeerCtor } = await loadPeer();
        const roomCode = makeRoomCode();
        const hostId = `host-${roomCode}`;
        const peer = new PeerCtor(peerIdFor(roomCode));
        peerRef.current = peer;

        peer.on('open', () => {
          setRole('host');
          setCode(roomCode);
          setSelfId(hostId);
          setRoom(
            createRoom(roomCode, game, {
              id: hostId,
              name: identity.name,
              emoji: identity.emoji,
              color: identity.color,
            }),
          );
          setStatus('connected');
        });

        peer.on('error', (err) => {
          setError(err.message || 'Could not open the room');
          setStatus('error');
        });

        peer.on('connection', (conn) => {
          connectionsRef.current.set(conn.peer, conn);

          conn.on('data', (raw) => {
            const msg = parseMessage(raw);
            if (!msg) return;
            const current = stateRef.current;
            if (!current) return;

            if (msg.type === 'join') {
              const next = reduce(current, {
                type: 'join',
                playerId: conn.peer,
                name: msg.name,
                emoji: msg.emoji,
                color: identityColor(conn.peer),
              });
              setRoom(next);
              conn.send({ type: 'welcome', v: PARTY_PROTOCOL_VERSION, playerId: conn.peer, state: next });
              broadcast(next);
              return;
            }
            if (msg.type === 'answer') {
              apply({ type: 'answer', playerId: conn.peer, value: msg.value });
              return;
            }
            if (msg.type === 'leave') {
              apply({ type: 'leave', playerId: conn.peer });
            }
          });

          // A dropped socket holds the seat; only an explicit leave frees it.
          conn.on('close', () => {
            connectionsRef.current.delete(conn.peer);
            apply({ type: 'disconnect', playerId: conn.peer });
          });
          conn.on('error', () => {
            connectionsRef.current.delete(conn.peer);
            apply({ type: 'disconnect', playerId: conn.peer });
          });
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open the room');
        setStatus('error');
      }
    },
    [apply, broadcast, setRoom],
  );

  const join = useCallback(
    async (roomCode: string, identity: PartyIdentity) => {
      setStatus('connecting');
      setError(null);
      try {
        const { Peer: PeerCtor } = await loadPeer();
        const peer = new PeerCtor();
        peerRef.current = peer;

        peer.on('open', () => {
          const conn = peer.connect(peerIdFor(roomCode), { reliable: true });
          hostConnRef.current = conn;

          conn.on('open', () => {
            setRole('client');
            setCode(roomCode.toUpperCase());
            conn.send({
              type: 'join',
              v: PARTY_PROTOCOL_VERSION,
              name: identity.name,
              emoji: identity.emoji,
            });
          });

          conn.on('data', (raw) => {
            const msg = parseMessage(raw);
            if (!msg) return;
            if (msg.type === 'welcome') {
              setSelfId(msg.playerId);
              setRoom(msg.state);
              setStatus('connected');
              return;
            }
            if (msg.type === 'state') setRoom(msg.state);
          });

          conn.on('close', () => setStatus('closed'));
          conn.on('error', () => {
            setError('Lost the connection to the room');
            setStatus('error');
          });
        });

        peer.on('error', (err) => {
          // The overwhelmingly common case is a code that was mistyped or a room that has closed.
          const message = /peer-unavailable/i.test(err.type ?? '')
            ? 'No room with that code'
            : err.message || 'Could not reach the room';
          setError(message);
          setStatus('error');
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reach the room');
        setStatus('error');
      }
    },
    [setRoom],
  );

  const send = useCallback((message: PartyMessage) => {
    const conn = hostConnRef.current;
    if (conn?.open) conn.send(message);
  }, []);

  const leave = useCallback(() => {
    if (hostConnRef.current?.open) hostConnRef.current.send({ type: 'leave' });
    teardown();
    setStatus('closed');
    setRole(null);
    setState(null);
    stateRef.current = null;
  }, [teardown]);

  useEffect(() => () => teardown(), [teardown]);

  return useMemo(
    () => ({ status, error, role, code, selfId, state, host, join, apply, send, leave }),
    [status, error, role, code, selfId, state, host, join, apply, send, leave],
  );
}

const PALETTE = ['#f97316', '#a855f7', '#34d399', '#22d3ee', '#f472b6', '#fbbf24', '#818cf8', '#fb7185'];

/** Stable colour per peer so a player keeps the same one across a reconnect. */
function identityColor(peerId: string): string {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
