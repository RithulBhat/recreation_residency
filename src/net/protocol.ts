/**
 * Online-duel wire protocol (PeerJS data channel).
 *
 * Every message is a plain JSON-serialisable object with a `type` discriminant and a
 * `PROTOCOL_VERSION` handshake carried on `hello`. Nothing that arrives off the wire is
 * trusted: `parseMessage` re-validates every field and REBUILDS the payload, so unknown
 * keys, wrong types and oversized blobs can never reach the game engine.
 *
 * ## Design: synchronised race
 * Host and guest each run their own local game through `useGameStore` with the SAME
 * `settings` (including `settings.seed`) and the SAME track list. The engine is
 * deterministic given a seed — identical queue order and identical clip offsets — so no
 * turn coordination or lock-step is needed. The peers only exchange live progress.
 *
 * ## Message flow
 *   guest → hello      (identity + protocol version)
 *   host  → welcome    (identity; both sides now 'connected')
 *   host  → init       (settings incl. seed + the trimmed track pool)
 *   guest → ready
 *   host  → start      (startAt = epoch ms, ~3 s out; both count down and call start())
 *   both  ↔ progress   (on every round end)
 *   both  ↔ finished   (when the local game ends)
 *   both  ↔ emote / ping / pong / rematch / rematchAccept / leave
 */

import type { GameSettings, GameStatus, PlayerConfig, Track, Verdict } from '@/types';
import { normalizeSettings } from '@/game/presets';

export const PROTOCOL_VERSION = 1;

/** Room-code alphabet: 0/O and 1/I are left out so a code is never misheard or mistyped. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/** PeerJS peer ids are namespaced so we never collide with other apps on the public server. */
export const PEER_ID_PREFIX = 'sgnr-';

/** The host trims the pool to this before sending `init` (payload stays ~40 KB). */
export const MAX_INIT_TRACKS = 60;

/** Hard ceiling on a single serialised message. Anything bigger is dropped, not parsed. */
export const MAX_MESSAGE_BYTES = 512 * 1024;

export const MAX_NAME_LENGTH = 24;
export const MAX_EMOJI_LENGTH = 12;
export const MAX_TEXT_LENGTH = 200;
/** Absurd track counts are rejected outright instead of being trimmed. */
const MAX_INIT_TRACKS_HARD = MAX_INIT_TRACKS * 8;

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const GAME_STATUSES: readonly GameStatus[] = ['idle', 'loading', 'playing', 'round-over', 'finished'];
const VERDICTS: readonly Verdict[] = ['correct', 'partial', 'wrong', 'skipped', 'timeout'];

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Guest → host. First message on an open connection. */
export interface HelloMsg {
  type: 'hello';
  name: string;
  emoji: string;
  color: string;
  version: number;
}

/** Host → guest, answering `hello`. */
export interface WelcomeMsg {
  type: 'welcome';
  hostName: string;
  emoji: string;
  color: string;
}

/** Host → guest. The full race setup: identical settings (with a seed) + the track pool. */
export interface InitMsg {
  type: 'init';
  settings: GameSettings;
  tracks: Track[];
}

/** Guest → host, after `init` has been applied. */
export interface ReadyMsg {
  type: 'ready';
}

/** Host → guest. `startAt` is epoch ms (~3 s out); both sides start their local game then. */
export interface StartMsg {
  type: 'start';
  startAt: number;
}

/** Either side, on every round end. A live scoreboard, never authoritative. */
export interface ProgressMsg {
  type: 'progress';
  /** 1-based current round (0 before the first round opens). */
  round: number;
  score: number;
  streak: number;
  correct: number;
  status: GameStatus;
  lastVerdict: Verdict | null;
  /** Sender's clock (epoch ms) — display only, never trusted for timing. */
  at: number;
}

/** Either side, when the local game reaches 'finished'. */
export interface FinishedMsg {
  type: 'finished';
  score: number;
  correct: number;
  rounds: number;
  durationMs: number;
}

export interface EmoteMsg {
  type: 'emote';
  emoji: string;
}

/** Offer a rematch with a fresh seed. */
export interface RematchMsg {
  type: 'rematch';
  seed: string;
}

export interface RematchAcceptMsg {
  type: 'rematchAccept';
}

/** Heartbeat. `t` is the sender's clock; `pong` echoes it so only one clock is used. */
export interface PingMsg {
  type: 'ping';
  t: number;
}

export interface PongMsg {
  type: 'pong';
  t: number;
}

/** Graceful goodbye (also used to reject a second guest). */
export interface LeaveMsg {
  type: 'leave';
  reason?: string;
}

export type NetMessage =
  | HelloMsg
  | WelcomeMsg
  | InitMsg
  | ReadyMsg
  | StartMsg
  | ProgressMsg
  | FinishedMsg
  | EmoteMsg
  | RematchMsg
  | RematchAcceptMsg
  | PingMsg
  | PongMsg
  | LeaveMsg;

export type NetMessageType = NetMessage['type'];

// ---------------------------------------------------------------------------
// Runtime validation
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s.slice(0, max);
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Non-negative integer (scores, rounds, counters). */
function count(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return Math.max(0, Math.round(n));
}

function color(v: unknown, fallback = '#a855f7'): string {
  return typeof v === 'string' && HEX_COLOR_RE.test(v.trim()) ? v.trim() : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/** Rebuild a Track from untrusted input, dropping unknown keys. Null when required fields are bad. */
export function parseTrack(raw: unknown): Track | null {
  if (!isRecord(raw)) return null;
  const id = num(raw.id);
  const title = str(raw.title, MAX_TEXT_LENGTH);
  const artist = str(raw.artist, MAX_TEXT_LENGTH);
  if (id === null || title === null || artist === null) return null;
  const track: Track = {
    id: Math.round(id),
    title,
    titleFull: str(raw.titleFull, MAX_TEXT_LENGTH) ?? title,
    artist,
    artistId: Math.round(num(raw.artistId) ?? 0),
    album: str(raw.album, MAX_TEXT_LENGTH) ?? '',
    albumId: Math.round(num(raw.albumId) ?? 0),
    cover: typeof raw.cover === 'string' ? raw.cover.slice(0, 512) : '',
    coverBig: typeof raw.coverBig === 'string' ? raw.coverBig.slice(0, 512) : '',
    preview: typeof raw.preview === 'string' ? raw.preview.slice(0, 1024) : '',
    previewFetchedAt: count(raw.previewFetchedAt) ?? 0,
    duration: Math.max(0, Math.round(num(raw.duration) ?? 0)),
    rank: Math.max(0, Math.round(num(raw.rank) ?? 0)),
    explicit: raw.explicit === true,
  };
  const year = num(raw.releaseYear);
  if (year !== null) track.releaseYear = Math.round(year);
  const bpm = num(raw.bpm);
  if (bpm !== null) track.bpm = bpm;
  const packId = str(raw.packId, 64);
  if (packId !== null) track.packId = packId;
  return track;
}

/** Cheap UTF-8 byte length without allocating a Buffer. */
function byteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Validate an inbound value (an already-deserialised object, or a JSON string) and rebuild it
 * as a `NetMessage`. Returns `null` for anything malformed, unknown or oversized — callers
 * simply ignore nulls.
 */
export function parseMessage(raw: unknown): NetMessage | null {
  let value = raw;
  if (typeof value === 'string') {
    if (byteLength(value) > MAX_MESSAGE_BYTES) return null;
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;

  switch (value.type) {
    case 'hello': {
      const name = str(value.name, MAX_NAME_LENGTH);
      const version = num(value.version);
      if (name === null || version === null) return null;
      return {
        type: 'hello',
        name,
        emoji: str(value.emoji, MAX_EMOJI_LENGTH) ?? '🎧',
        color: color(value.color),
        version: Math.round(version),
      };
    }
    case 'welcome': {
      const hostName = str(value.hostName, MAX_NAME_LENGTH);
      if (hostName === null) return null;
      return {
        type: 'welcome',
        hostName,
        emoji: str(value.emoji, MAX_EMOJI_LENGTH) ?? '🎧',
        color: color(value.color),
      };
    }
    case 'init': {
      if (!isRecord(value.settings) || !Array.isArray(value.tracks)) return null;
      if (value.tracks.length === 0 || value.tracks.length > MAX_INIT_TRACKS_HARD) return null;
      const tracks: Track[] = [];
      const seen = new Set<number>();
      for (const t of value.tracks) {
        const track = parseTrack(t);
        if (!track || seen.has(track.id)) continue;
        seen.add(track.id);
        tracks.push(track);
        if (tracks.length >= MAX_INIT_TRACKS) break;
      }
      if (tracks.length === 0) return null;
      return { type: 'init', settings: normalizeSettings(value.settings as Partial<GameSettings>), tracks };
    }
    case 'ready':
      return { type: 'ready' };
    case 'start': {
      const startAt = num(value.startAt);
      if (startAt === null) return null;
      return { type: 'start', startAt: Math.round(startAt) };
    }
    case 'progress': {
      const round = count(value.round);
      const score = count(value.score);
      const streak = count(value.streak);
      const correct = count(value.correct);
      const status = oneOf(value.status, GAME_STATUSES);
      if (round === null || score === null || streak === null || correct === null || status === null) return null;
      return {
        type: 'progress',
        round,
        score,
        streak,
        correct,
        status,
        lastVerdict: oneOf(value.lastVerdict, VERDICTS),
        at: count(value.at) ?? 0,
      };
    }
    case 'finished': {
      const score = count(value.score);
      const correct = count(value.correct);
      const rounds = count(value.rounds);
      const durationMs = count(value.durationMs);
      if (score === null || correct === null || rounds === null || durationMs === null) return null;
      return { type: 'finished', score, correct, rounds, durationMs };
    }
    case 'emote': {
      const emoji = str(value.emoji, MAX_EMOJI_LENGTH);
      if (emoji === null) return null;
      return { type: 'emote', emoji };
    }
    case 'rematch': {
      const seed = str(value.seed, 64);
      if (seed === null) return null;
      return { type: 'rematch', seed };
    }
    case 'rematchAccept':
      return { type: 'rematchAccept' };
    case 'ping': {
      const t = num(value.t);
      if (t === null) return null;
      return { type: 'ping', t: Math.round(t) };
    }
    case 'pong': {
      const t = num(value.t);
      if (t === null) return null;
      return { type: 'pong', t: Math.round(t) };
    }
    case 'leave': {
      const reason = str(value.reason, MAX_TEXT_LENGTH);
      return reason === null ? { type: 'leave' } : { type: 'leave', reason };
    }
    default:
      return null;
  }
}

/** True when the peer speaks a protocol we can play with. */
export function isCompatible(version: number): boolean {
  return version === PROTOCOL_VERSION;
}

export function helloFor(me: PlayerConfig): HelloMsg {
  return {
    type: 'hello',
    name: me.name.slice(0, MAX_NAME_LENGTH) || 'Guest',
    emoji: me.emoji || '🎧',
    color: color(me.color),
    version: PROTOCOL_VERSION,
  };
}

export function welcomeFor(me: PlayerConfig): WelcomeMsg {
  return {
    type: 'welcome',
    hostName: me.name.slice(0, MAX_NAME_LENGTH) || 'Host',
    emoji: me.emoji || '🎵',
    color: color(me.color),
  };
}

/** The opponent's identity as a `PlayerConfig`, derived from their hello/welcome. */
export function playerFromHandshake(msg: HelloMsg | WelcomeMsg, id: string): PlayerConfig {
  return {
    id,
    name: msg.type === 'hello' ? msg.name : msg.hostName,
    emoji: msg.emoji,
    color: msg.color,
  };
}

// ---------------------------------------------------------------------------
// Init payload shaping (host side)
// ---------------------------------------------------------------------------

/** Cap the pool at `MAX_INIT_TRACKS`, de-duplicated by track id. Order is preserved. */
export function trimTrackPool(tracks: readonly Track[], max = MAX_INIT_TRACKS): Track[] {
  const out: Track[] = [];
  const seen = new Set<number>();
  for (const t of tracks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Settings both peers will run. A duel is a race of two *local solo* games, so the
 * same-device multiplayer modes collapse to 'classic' and the player list is cleared.
 * A seed is mandatory (that is what makes the two games identical) and the race needs a
 * finish line, so endless round counts become 10 outside blitz/survival.
 */
export function prepareInitSettings(settings: Partial<GameSettings>, seed: string): GameSettings {
  const mode = settings.mode === 'duel' || settings.mode === 'party' ? 'classic' : settings.mode;
  const next = normalizeSettings({ ...settings, mode, players: [], seed, daily: undefined });
  if (next.rounds === 0 && next.mode !== 'blitz' && next.mode !== 'survival') next.rounds = 10;
  return next;
}

// ---------------------------------------------------------------------------
// Room codes
// ---------------------------------------------------------------------------

function randomUnit(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

/** A fresh 6-character room code from `ROOM_CODE_ALPHABET`. */
export function makeRoomCode(random: () => number = randomUnit): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const idx = Math.min(ROOM_CODE_ALPHABET.length - 1, Math.floor(random() * ROOM_CODE_ALPHABET.length));
    out += ROOM_CODE_ALPHABET[idx];
  }
  return out;
}

/** What a room-code input should show while the player types: upper-case, alphabet-only, ≤ 6. */
export function sanitizeRoomCodeInput(input: string): string {
  if (typeof input !== 'string') return '';
  let out = '';
  for (const ch of input.toUpperCase()) {
    if (ROOM_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length >= ROOM_CODE_LENGTH) break;
  }
  return out;
}

/**
 * Validate a typed/pasted room code. Trims, upper-cases and strips separators; returns null
 * unless exactly 6 characters of the alphabet remain. Lookalikes (0, 1, O, I) are NOT remapped —
 * they are not in the alphabet, so a code containing one is simply invalid.
 */
export function normalizeRoomCode(input: string): string | null {
  if (typeof input !== 'string') return null;
  const stripped = input.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (stripped.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of stripped) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return stripped;
}

export function isRoomCode(input: string): boolean {
  return normalizeRoomCode(input) !== null;
}

/** PeerJS id for a room. Lower-cased so codes are case-insensitive on the signalling server. */
export function peerIdFor(code: string): string {
  return `${PEER_ID_PREFIX}${code.toLowerCase()}`;
}

/** Inverse of `peerIdFor`. Null when the id is not one of ours. */
export function codeFromPeerId(peerId: string): string | null {
  if (!peerId.startsWith(PEER_ID_PREFIX)) return null;
  return normalizeRoomCode(peerId.slice(PEER_ID_PREFIX.length));
}
