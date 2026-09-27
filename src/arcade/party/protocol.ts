/**
 * Party-room wire protocol (PeerJS data channel), star topology.
 *
 * Songooner's `src/net/` is deliberately 1v1 — it rejects a second guest, and its model is two
 * peers running identical deterministic engines from a shared seed with no authoritative state
 * anywhere. Late joins, disconnects, host migration and kicking have no home in that, so this is
 * a separate layer rather than an extension of it. What generalises is reused directly: the
 * room-code alphabet, the peer-id namespace, the size caps, and above all the discipline that
 * NOTHING off the wire is trusted — `parseMessage` REBUILDS every payload, so unknown keys,
 * wrong types and oversized blobs can never reach a reducer or a game engine.
 *
 * The host owns room state. Clients send intents; the host broadcasts the resulting state. A
 * client never mutates shared state locally, so a malicious client can lie about its own guess
 * and nothing else.
 */

import { PEER_ID_PREFIX, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@/net/protocol';

export const PARTY_PROTOCOL_VERSION = 1;

export { PEER_ID_PREFIX, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH };

/** Namespaced apart from the duel so a party code can never collide with a duel peer id. */
export const PARTY_PEER_PREFIX = `${PEER_ID_PREFIX}party-`;

export const MAX_PLAYERS = 12;
export const MAX_NAME_LENGTH = 16;
export const MAX_MESSAGE_BYTES = 256 * 1024;
export const MAX_ROSTER_BYTES = 64 * 1024;

export type PartyGame = 'price' | 'hilo';

export interface PartyPlayer {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** False while the socket is down but the seat is being held. */
  connected: boolean;
  score: number;
  /** True once this player has answered the live round. */
  answered: boolean;
  /** Set only for the player who created the room, or whoever inherited it. */
  host: boolean;
}

export type PartyPhase = 'lobby' | 'question' | 'reveal' | 'finished';

export interface PartyRoomState {
  code: string;
  game: PartyGame;
  phase: PartyPhase;
  players: readonly PartyPlayer[];
  /** Index of the live round. */
  round: number;
  totalRounds: number;
  /** Opaque to this layer: whatever settings the game needs, validated by the game. */
  settings: unknown;
  seed: string;
  /** Answers for the live round, keyed by player id. Cleared on every advance. */
  answers: Readonly<Record<string, number>>;
}

/* ---------------------------------------------------------------- messages */

export interface JoinMsg {
  type: 'join';
  v: number;
  name: string;
  emoji: string;
}
export interface WelcomeMsg {
  type: 'welcome';
  v: number;
  playerId: string;
  state: PartyRoomState;
}
export interface StateMsg {
  type: 'state';
  state: PartyRoomState;
}
export interface AnswerMsg {
  type: 'answer';
  value: number;
}
export interface AdvanceMsg {
  type: 'advance';
}
export interface StartMsg {
  type: 'start';
  settings: unknown;
  seed: string;
  totalRounds: number;
}
export interface KickMsg {
  type: 'kick';
  playerId: string;
}
export interface LeaveMsg {
  type: 'leave';
  reason?: string;
}
export interface HostMsg {
  type: 'host';
  playerId: string;
}

export type PartyMessage =
  | JoinMsg
  | WelcomeMsg
  | StateMsg
  | AnswerMsg
  | AdvanceMsg
  | StartMsg
  | KickMsg
  | LeaveMsg
  | HostMsg;

/* ------------------------------------------------------------- validation */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function byteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0xd800 || c >= 0xe000 ? 3 : ((i++, 4));
  }
  return bytes;
}

/** Rebuild a player from untrusted input. Null when the essentials are missing. */
export function parsePlayer(raw: unknown): PartyPlayer | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id, 40);
  const name = str(raw.name, MAX_NAME_LENGTH);
  if (!id || !name) return null;
  return {
    id,
    name,
    emoji: str(raw.emoji, 8) ?? '🙂',
    color: typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color : '#a855f7',
    connected: raw.connected !== false,
    score: Math.max(0, Math.round(num(raw.score) ?? 0)),
    answered: raw.answered === true,
    host: raw.host === true,
  };
}

const PHASES: readonly PartyPhase[] = ['lobby', 'question', 'reveal', 'finished'];

/** Rebuild a whole room state from untrusted input. */
export function parseRoomState(raw: unknown): PartyRoomState | null {
  if (!isRecord(raw)) return null;
  const code = str(raw.code, ROOM_CODE_LENGTH);
  if (!code) return null;
  // A lobby has no seed yet — it is set when the host starts. Requiring one here rejected every
  // welcome message a guest was ever sent, so guests joined successfully on the host's screen
  // and then sat on a spinner forever. Only found by running two browsers against each other.
  if (raw.seed !== undefined && raw.seed !== null && typeof raw.seed !== 'string') return null;
  const seed = typeof raw.seed === 'string' ? raw.seed.slice(0, 64) : '';
  if (raw.game !== 'price' && raw.game !== 'hilo') return null;
  if (typeof raw.phase !== 'string' || !PHASES.includes(raw.phase as PartyPhase)) return null;
  if (!Array.isArray(raw.players)) return null;

  const players: PartyPlayer[] = [];
  for (const entry of raw.players) {
    const p = parsePlayer(entry);
    if (p && !players.some((x) => x.id === p.id)) players.push(p);
    if (players.length >= MAX_PLAYERS) break;
  }

  const answers: Record<string, number> = {};
  if (isRecord(raw.answers)) {
    for (const [k, v] of Object.entries(raw.answers)) {
      const value = num(v);
      if (value !== null && players.some((p) => p.id === k)) answers[k] = value;
    }
  }

  return {
    code,
    game: raw.game,
    phase: raw.phase as PartyPhase,
    players,
    round: Math.max(0, Math.round(num(raw.round) ?? 0)),
    totalRounds: Math.max(0, Math.round(num(raw.totalRounds) ?? 0)),
    settings: raw.settings ?? null,
    seed,
    answers,
  };
}

/**
 * Validate an inbound value and rebuild it as a `PartyMessage`. Returns `null` for anything
 * malformed, unknown or oversized — callers ignore nulls rather than throwing, so one bad frame
 * cannot take a room down.
 */
export function parseMessage(raw: unknown): PartyMessage | null {
  let value = raw;
  if (typeof value === 'string') {
    if (byteLength(value) > MAX_MESSAGE_BYTES) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;

  switch (value.type) {
    case 'join': {
      const name = str(value.name, MAX_NAME_LENGTH);
      if (!name) return null;
      return {
        type: 'join',
        v: num(value.v) ?? 0,
        name,
        emoji: str(value.emoji, 8) ?? '🙂',
      };
    }
    case 'welcome': {
      const playerId = str(value.playerId, 40);
      const state = parseRoomState(value.state);
      if (!playerId || !state) return null;
      return { type: 'welcome', v: num(value.v) ?? 0, playerId, state };
    }
    case 'state': {
      const state = parseRoomState(value.state);
      return state ? { type: 'state', state } : null;
    }
    case 'answer': {
      const v = num(value.value);
      return v === null ? null : { type: 'answer', value: v };
    }
    case 'advance':
      return { type: 'advance' };
    case 'start': {
      const seed = str(value.seed, 64);
      if (!seed) return null;
      return {
        type: 'start',
        settings: value.settings ?? null,
        seed,
        totalRounds: Math.max(1, Math.round(num(value.totalRounds) ?? 1)),
      };
    }
    case 'kick': {
      const playerId = str(value.playerId, 40);
      return playerId ? { type: 'kick', playerId } : null;
    }
    case 'host': {
      const playerId = str(value.playerId, 40);
      return playerId ? { type: 'host', playerId } : null;
    }
    case 'leave':
      return { type: 'leave', reason: str(value.reason, 120) ?? undefined };
    default:
      return null;
  }
}

export function isCompatible(version: number): boolean {
  return version === PARTY_PROTOCOL_VERSION;
}

/** A room code from the shared alphabet — 0/O and 1/I are absent so it is never misheard. */
export function makeRoomCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

export function peerIdFor(code: string): string {
  return `${PARTY_PEER_PREFIX}${code.toUpperCase()}`;
}
