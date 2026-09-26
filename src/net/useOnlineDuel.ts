/**
 * `useOnlineDuel` — the React face of an online duel.
 *
 * The session and all of its state live in a MODULE-LEVEL store, not in component state, so the
 * lobby (`/duel`) can hand off to the play screen (`/play`) and the results screen without the
 * connection being torn down on unmount. Every component that calls `useOnlineDuel()` sees the
 * same live duel; `leave()` is the only thing that closes it.
 *
 * ## What the screens do, in order
 *   Lobby (host)   duel.host(me) → show duel.code → wait for duel.opponent
 *                  → duel.sendInit(settings, tracks) once the pool is resolved
 *                  → duel.start() when duel.opponentReady
 *   Lobby (guest)  duel.join(code, me) → wait for duel.initPayload → duel.ready()
 *   Both           when duel.countdown === 0: useGameStore.start(initPayload.settings,
 *                  initPayload.tracks) — identical settings + seed + pool ⇒ identical game.
 *   Play           duel.sendProgress(state) on every round end;
 *                  duel.sendFinished(state) once state.status === 'finished'.
 *   Results        duel.outcome / duel.opponentFinished; duel.rematch() / duel.acceptRematch().
 */

import { useMemo, useSyncExternalStore } from 'react';
import type { GameSettings, GameState, PlayerConfig, Track } from '@/types';
import { createRng } from '@/game/rng';
import {
  createDuelSession,
  type DuelRole,
  type DuelSession,
  type DuelStatus,
  type PeerFactory,
} from './duel';
import { finishedFrom, outcome as computeOutcome, type Outcome, progressFrom } from './progress';
import {
  type FinishedMsg,
  type InitMsg,
  normalizeRoomCode,
  type ProgressMsg,
  prepareInitSettings,
  trimTrackPool,
} from './protocol';

/** Seconds of countdown between `start()` and the first clip. */
export const COUNTDOWN_MS = 3000;
/** A `startAt` further out than this means the peers' clocks disagree — fall back to a local 3 s. */
export const MAX_COUNTDOWN_MS = 10000;
export const EMOTE_TTL_MS = 4000;
export const MAX_EMOTES = 8;

export type DuelPhase = DuelStatus | 'idle';

export interface IncomingEmote {
  /** Unique per arrival, so the same emoji twice still animates twice. */
  id: string;
  emoji: string;
  at: number;
}

export interface OnlineDuelState {
  status: DuelPhase;
  code: string | null;
  role: DuelRole | null;
  me: PlayerConfig | null;
  opponent: PlayerConfig | null;
  latencyMs: number;
  error: string | null;
  /** Local-clock epoch ms when the race starts, or null. */
  startAt: number | null;
  /** Seconds left before the race starts: 3 → 0, then it stays 0. Null when nothing is scheduled. */
  countdown: number | null;
  /** The agreed settings + track pool. Feed BOTH of these to `useGameStore.start`. */
  initPayload: InitMsg | null;
  opponentReady: boolean;
  opponentProgress: ProgressMsg | null;
  opponentFinished: FinishedMsg | null;
  myFinished: FinishedMsg | null;
  /** Seed the opponent offered for a rematch (they are waiting on `acceptRematch`). */
  rematchOffer: string | null;
  /** Set once both sides agreed on a rematch; the host then calls `sendInit` again. */
  rematchSeed: string | null;
  /** True while my own rematch offer is unanswered. */
  rematchPending: boolean;
  incomingEmotes: IncomingEmote[];
}

export interface OnlineDuelActions {
  host(me: PlayerConfig, options?: SessionOptions): void;
  join(code: string, me: PlayerConfig, options?: SessionOptions): void;
  /**
   * Host only. Seeds the run (auto-generated when absent), trims the pool, broadcasts it.
   * Pass `useSettingsStore().settings` — partials are accepted and normalized.
   */
  sendInit(settings: Partial<GameSettings>, tracks: readonly Track[]): void;
  /** Guest only. Confirms the init was received. */
  ready(): void;
  /** Host only. Schedules the 3 s countdown on both sides. */
  start(): void;
  sendProgress(state: GameState): void;
  sendFinished(state: GameState): void;
  emote(emoji: string): void;
  rematch(): void;
  acceptRematch(): void;
  clearEmotes(): void;
  leave(): void;
}

export interface UseOnlineDuel extends OnlineDuelState, OnlineDuelActions {
  isHost: boolean;
  connected: boolean;
  outcome: Outcome;
}

export interface SessionOptions {
  /** Test seam: inject a fake PeerJS. */
  peerFactory?: PeerFactory;
  /** Host only: claim a specific room code instead of a random one. */
  code?: string;
}

// ---------------------------------------------------------------------------
// Module store
// ---------------------------------------------------------------------------

const IDLE: OnlineDuelState = {
  status: 'idle',
  code: null,
  role: null,
  me: null,
  opponent: null,
  latencyMs: 0,
  error: null,
  startAt: null,
  countdown: null,
  initPayload: null,
  opponentReady: false,
  opponentProgress: null,
  opponentFinished: null,
  myFinished: null,
  rematchOffer: null,
  rematchSeed: null,
  rematchPending: false,
  incomingEmotes: [],
};

/** Cleared whenever a new race is being set up. */
const PER_GAME: Pick<
  OnlineDuelState,
  'startAt' | 'countdown' | 'opponentProgress' | 'opponentFinished' | 'myFinished' | 'rematchOffer' | 'rematchPending'
> = {
  startAt: null,
  countdown: null,
  opponentProgress: null,
  opponentFinished: null,
  myFinished: null,
  rematchOffer: null,
  rematchPending: false,
};

let state: OnlineDuelState = IDLE;
const listeners = new Set<() => void>();

let session: DuelSession | null = null;
let unsubscribes: Array<() => void> = [];
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let emoteTimers: Array<ReturnType<typeof setTimeout>> = [];
let emoteCounter = 0;
/** Seed to use on the next `sendInit` (set by the rematch handshake). */
let pendingSeed: string | null = null;
/** Seed I offered, remembered until the opponent accepts. */
let offeredSeed: string | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): OnlineDuelState {
  return state;
}

function set(patch: Partial<OnlineDuelState>): void {
  state = { ...state, ...patch };
  for (const l of Array.from(listeners)) l();
}

function stopCountdown(): void {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function clearEmoteTimers(): void {
  for (const t of emoteTimers) clearTimeout(t);
  emoteTimers = [];
}

function secondsLeft(startAt: number): number {
  return Math.max(0, Math.ceil((startAt - Date.now()) / 1000));
}

function scheduleStart(remoteStartAt: number): void {
  const delta = remoteStartAt - Date.now();
  // Clock skew between two browsers is unbounded, so an implausible startAt becomes a local 3 s.
  const startAt = delta >= 0 && delta <= MAX_COUNTDOWN_MS ? remoteStartAt : Date.now() + COUNTDOWN_MS;
  stopCountdown();
  set({ startAt, countdown: secondsLeft(startAt) });
  countdownTimer = setInterval(() => {
    const left = secondsLeft(startAt);
    if (left !== state.countdown) set({ countdown: left });
    if (left <= 0) stopCountdown();
  }, 100);
}

function pushEmote(emoji: string): void {
  const id = `${Date.now().toString(36)}-${emoteCounter++}`;
  const next = [...state.incomingEmotes, { id, emoji, at: Date.now() }].slice(-MAX_EMOTES);
  set({ incomingEmotes: next });
  const timer = setTimeout(() => {
    set({ incomingEmotes: state.incomingEmotes.filter((e) => e.id !== id) });
  }, EMOTE_TTL_MS);
  emoteTimers.push(timer);
}

function teardown(): void {
  for (const off of unsubscribes) off();
  unsubscribes = [];
  stopCountdown();
  clearEmoteTimers();
  session?.close();
  session = null;
  pendingSeed = null;
  offeredSeed = null;
}

/** Drop the whole duel and go back to idle. Exported for tests and for hard resets. */
export function resetOnlineDuel(): void {
  teardown();
  state = IDLE;
  for (const l of Array.from(listeners)) l();
}

/** The live session, or null. Escape hatch for debugging — screens should use the hook. */
export function currentDuelSession(): DuelSession | null {
  return session;
}

function bind(next: DuelSession, me: PlayerConfig): void {
  session = next;
  unsubscribes = [
    next.on('status', (status) => set({ status, code: next.code, error: next.error })),
    next.on('opponent', (opponent) => set({ opponent })),
    next.on('latency', (latencyMs) => set({ latencyMs })),
    next.on('error', (message) => set({ error: message })),
    next.on('message', (msg) => {
      switch (msg.type) {
        case 'init':
          set({ ...PER_GAME, initPayload: msg, opponentReady: false, rematchSeed: null });
          break;
        case 'ready':
          set({ opponentReady: true });
          break;
        case 'start':
          scheduleStart(msg.startAt);
          break;
        case 'progress':
          set({ opponentProgress: msg });
          break;
        case 'finished':
          set({ opponentFinished: msg });
          break;
        case 'emote':
          pushEmote(msg.emoji);
          break;
        case 'rematch':
          set({ rematchOffer: msg.seed, rematchPending: false });
          break;
        case 'rematchAccept':
          pendingSeed = offeredSeed;
          set({ ...PER_GAME, rematchSeed: offeredSeed, opponentReady: false });
          offeredSeed = null;
          break;
        default:
          break;
      }
    }),
  ];
  set({
    ...IDLE,
    me,
    role: next.role,
    code: next.code,
    status: next.status,
    error: next.error,
  });
}

// ---------------------------------------------------------------------------
// Actions (module-level, so the object handed to components stays stable)
// ---------------------------------------------------------------------------

const actions: OnlineDuelActions = {
  host(me, options) {
    teardown();
    state = IDLE;
    bind(createDuelSession({ role: 'host', me, code: options?.code, peerFactory: options?.peerFactory }), me);
  },

  join(code, me, options) {
    const normalized = normalizeRoomCode(code);
    teardown();
    if (!normalized) {
      state = { ...IDLE, role: 'guest', me, status: 'error', error: 'That room code looks wrong' };
      for (const l of Array.from(listeners)) l();
      return;
    }
    state = IDLE;
    bind(createDuelSession({ role: 'guest', code: normalized, me, peerFactory: options?.peerFactory }), me);
  },

  sendInit(settings, tracks) {
    if (!session) return;
    const seed = pendingSeed ?? (settings.seed && settings.seed.trim() ? settings.seed.trim() : createRng().id());
    pendingSeed = null;
    const msg: InitMsg = {
      type: 'init',
      settings: prepareInitSettings(settings, seed),
      tracks: trimTrackPool(tracks),
    };
    session.send(msg);
    set({ ...PER_GAME, initPayload: msg, opponentReady: false, rematchSeed: null });
  },

  ready() {
    session?.send({ type: 'ready' });
  },

  start() {
    if (!session) return;
    const startAt = Date.now() + COUNTDOWN_MS;
    session.send({ type: 'start', startAt });
    scheduleStart(startAt);
  },

  sendProgress(gameState) {
    session?.send(progressFrom(gameState));
  },

  sendFinished(gameState) {
    if (!session) return;
    const msg = finishedFrom(gameState);
    session.send(msg);
    set({ myFinished: msg });
  },

  emote(emoji) {
    if (!emoji) return;
    session?.send({ type: 'emote', emoji });
  },

  rematch() {
    if (!session) return;
    const seed = createRng().id();
    offeredSeed = seed;
    session.send({ type: 'rematch', seed });
    set({ rematchPending: true, rematchOffer: null });
  },

  acceptRematch() {
    const seed = state.rematchOffer;
    if (!session || !seed) return;
    session.send({ type: 'rematchAccept' });
    pendingSeed = seed;
    set({ ...PER_GAME, rematchSeed: seed, opponentReady: false });
  },

  clearEmotes() {
    clearEmoteTimers();
    set({ incomingEmotes: [] });
  },

  leave() {
    resetOnlineDuel();
  },
};

export function useOnlineDuel(): UseOnlineDuel {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(
    () => ({
      ...snapshot,
      ...actions,
      isHost: snapshot.role === 'host',
      connected:
        snapshot.status === 'connected' || snapshot.status === 'playing' || snapshot.status === 'finished',
      outcome: computeOutcome(snapshot.myFinished, snapshot.opponentFinished),
    }),
    [snapshot],
  );
}
