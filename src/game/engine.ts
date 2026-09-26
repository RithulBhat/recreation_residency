/**
 * Songooner game engine — a pure reducer over `GameState`.
 *
 * ## Usage
 *   state = createInitialState()
 *   state = reduce(state, { type: 'start', settings, tracks, now }, rng?)
 *   state = reduce(state, { type: 'guess', text, now })  …
 *
 * `reduce` never mutates; invalid actions for the current status return the SAME reference,
 * so `next === prev` is a reliable "nothing happened" check.
 * `rng` is only consulted by 'start' (game id, plus the queue shuffle of unseeded runs). Every later random choice
 * (start offsets) is derived by hashing `state.id`, so replaying the same seed yields the same
 * queue AND offsets without needing the rng again.
 *
 * ## Status transitions
 *   idle ──start──▶ playing ──(round ends)──▶ round-over ──next──▶ playing … ──▶ finished
 *   'start' is accepted from ANY status (it begins a fresh game). 'quit' works from playing or
 *   round-over. Blitz never enters round-over: rounds auto-advance and 'tick' ends the game.
 *
 * ## Rounds
 *   - 'start' orders `tracks` (deduped by id) into `queue` and opens round 0 from its head. Seeded
 *     runs (daily / challenge / online duel) sort by a per-track hash of `seed|track.id`, so two
 *     devices whose pools differ slightly still play the same songs in the same order; unseeded
 *     runs are a plain rng shuffle.
 *     Start offset per `startPosition` inside a preview assumed 30 s long (or `track.duration`
 *     if shorter): start → 0; random → [0, 30 − maxClip]; middle → [10, 20]; end → [20, 30 − maxClip].
 *   - `round.startedAt` is the round clock: it is set when the round opens and RESET on the first
 *     'play' of the round (so the time bonus and the round timer count from the first listen).
 *   - 'play' increments `playsThisTry`.
 *   - 'guess' runs `matchGuess`:
 *       correct → round 'won', `score` via `scoreGuess`, player + game streaks/totals updated.
 *       partial → recorded, 30% credit remembered in `round.score`, consumes a try.
 *       wrong   → consumes a try. Tries exhausted → round 'lost' (streak reset).
 *     Consuming a try: `tryIndex + 1`, `playsThisTry = 0`, new offset if `!sameStartEachTry`.
 *     Empty text, or a `playerId` that is not the active player → no-op.
 *   - 'skip' consumes a try (this is how escalating stages unlock); last try → round 'lost'.
 *     No-op when `allowSkip` is false. Recorded as a Guess with verdict 'skipped'.
 *   - 'giveUp' loses the round immediately (verdict 'skipped'); 'timeout' likewise ('timeout').
 *   - 'hint' appends to `hintsUsed` (no duplicates, hints enabled, hint available for the track,
 *     budget = min(3, tries − 1)).
 *   - 'next' (round-over only): finishes the game when rounds are exhausted (`rounds` > 0),
 *     the queue is empty, or (survival) lives are 0; otherwise rotates the active player
 *     (duel-turns / party) and opens the next round.
 *   - `totalScore` and player scores only change when a round ends. A lost round with a partial
 *     guess credits its 30% to the player who made that guess.
 *
 * ## Modes
 *   blitz     — `blitzEndsAt = start + blitzDuration`. Any wrong/partial/skip/giveUp: −3 s and
 *               the next round opens immediately; correct also opens the next round immediately.
 *               'tick' (now ≥ blitzEndsAt) → finished 'time'. Queue empty → finished 'queue-empty'.
 *               `rounds` is ignored (endless).
 *   survival  — each player has `lives`. A lost round costs a life; 'next' with 0 lives →
 *               finished 'lives'. Clip length shrinks 15% per round won (see selectors).
 *   duel      — buzzer: nobody can guess until 'buzz' sets `activePlayerId`; a wrong guess locks
 *               that player out (`lockedOutPlayerIds`) and clears the buzzer; everyone locked out
 *               → round lost. A 'guess' carrying a valid, un-locked `playerId` while nobody has
 *               buzzed counts as buzz + guess. turns: `activePlayerIndex` rotates per round.
 *   party     — like duel-turns with 2–8 players.
 *   single-player modes get one implicit player with id 'you' (name/emoji/color from
 *   `settings.players[0]` when provided).
 *
 * 'tick' also fires 'timeout' when `roundTimer` > 0 and the round clock has run out.
 * 'quit' → finished 'quit' (an in-progress round is marked 'skipped').
 */

import type { GameAction, GameSettings, GameState, Guess, PlayerState, Round, Track, Verdict } from '@/types';
import { hintText, maxHints } from './hints';
import { matchGuess } from './match';
import { DEFAULT_SETTINGS, SOLO_PLAYER, isBuzzerDuel, isMultiplayer, maxClipLength, normalizeSettings } from './presets';
import { createRng, hashToUnit, type Rng } from './rng';
import { clipLengthFor, hasListened, wonRounds } from './selectors';
import { scoreGuess } from './scoring';

export { hasListened } from './selectors';

export const BLITZ_PENALTY_MS = 3000;
export const PREVIEW_LENGTH = 30;

export function createInitialState(): GameState {
  return {
    id: '',
    settings: { ...DEFAULT_SETTINGS, stages: [...DEFAULT_SETTINGS.stages], modifiers: { ...DEFAULT_SETTINGS.modifiers } },
    status: 'idle',
    rounds: [],
    currentRound: 0,
    players: [],
    activePlayerIndex: 0,
    queue: [],
    totalScore: 0,
    streak: 0,
    bestStreak: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Deterministic start offset for (game, round, track, try). */
export function pickStartOffset(settings: GameSettings, track: Track, key: string): number {
  const previewLen = track.duration > 0 ? Math.min(PREVIEW_LENGTH, track.duration) : PREVIEW_LENGTH;
  const latest = Math.max(0, previewLen - maxClipLength(settings));
  let lo = 0;
  let hi = latest;
  switch (settings.startPosition) {
    case 'start':
      return 0;
    case 'middle':
      lo = Math.min(10, latest);
      hi = Math.min(20, latest);
      break;
    case 'end':
      lo = Math.min(20, latest);
      hi = latest;
      break;
    case 'random':
    default:
      break;
  }
  if (hi <= lo) return round2(lo);
  return round2(lo + hashToUnit(key) * (hi - lo));
}

function offsetKey(gameId: string, roundIndex: number, trackId: number, tryIndex: number): string {
  return `${gameId}|${roundIndex}|${trackId}|${tryIndex}`;
}

function buildPlayers(settings: GameSettings): PlayerState[] {
  const configs = isMultiplayer(settings)
    ? settings.players
    : [{ ...SOLO_PLAYER, ...(settings.players[0] ?? {}), id: SOLO_PLAYER.id }];
  return configs.map((c) => {
    const p: PlayerState = { ...c, score: 0, streak: 0, bestStreak: 0, correct: 0 };
    if (settings.mode === 'survival') p.lives = settings.lives;
    return p;
  });
}

function openRound(state: GameState, track: Track, now: number): GameState {
  const index = state.rounds.length;
  const { settings } = state;
  let activePlayerId: string | undefined;
  if (isBuzzerDuel(settings)) activePlayerId = undefined;
  else activePlayerId = state.players[state.activePlayerIndex]?.id;
  const round: Round = {
    index,
    track,
    startOffset: pickStartOffset(settings, track, offsetKey(state.id, index, track.id, 0)),
    tryIndex: 0,
    guesses: [],
    hintsUsed: [],
    status: 'playing',
    score: 0,
    startedAt: now,
    playsThisTry: 0,
    activePlayerId,
    lockedOutPlayerIds: [],
  };
  return {
    ...state,
    status: 'playing',
    rounds: [...state.rounds, round],
    currentRound: index,
    queue: state.queue.slice(1),
  };
}

function replaceRound(state: GameState, round: Round): GameState {
  const rounds = state.rounds.slice();
  rounds[round.index] = round;
  return { ...state, rounds };
}

function finish(state: GameState, endReason: NonNullable<GameState['endReason']>, now: number): GameState {
  let s = state;
  const r = s.rounds[s.currentRound];
  if (r && r.status === 'playing') s = replaceRound(s, { ...r, status: 'skipped', endedAt: now });
  return { ...s, status: 'finished', endReason, finishedAt: now };
}

function updatePlayer(players: PlayerState[], id: string | undefined, fn: (p: PlayerState) => PlayerState): PlayerState[] {
  if (!id) return players;
  return players.map((p) => (p.id === id ? fn(p) : p));
}

/**
 * Close a round (status already set to won/lost/skipped) and apply scoring, streaks, lives.
 * Blitz auto-advances; every other mode goes to 'round-over'.
 */
function finishRound(state: GameState, round: Round, now: number): GameState {
  const { settings } = state;
  let players = state.players;
  let streak = state.streak;
  let bestStreak = state.bestStreak;
  let totalScore = state.totalScore;

  if (round.status === 'won') {
    totalScore += round.score;
    streak += 1;
    bestStreak = Math.max(bestStreak, streak);
    players = updatePlayer(players, round.winnerPlayerId, (p) => {
      const ps = p.streak + 1;
      return { ...p, score: p.score + round.score, streak: ps, bestStreak: Math.max(p.bestStreak, ps), correct: p.correct + 1 };
    });
  } else {
    streak = 0;
    // partial credit (30%) goes to whoever made the partial guess
    const partial = round.guesses.find((g) => g.verdict === 'partial');
    if (partial && round.score > 0) {
      totalScore += round.score;
      players = updatePlayer(players, partial.playerId ?? players[0]?.id, (p) => ({ ...p, score: p.score + round.score }));
    }
    // streak resets for the player(s) responsible
    const losers = isBuzzerDuel(settings)
      ? round.lockedOutPlayerIds.length
        ? round.lockedOutPlayerIds
        : players.map((p) => p.id)
      : [round.activePlayerId ?? players[state.activePlayerIndex]?.id ?? players[0]?.id];
    players = players.map((p) => (losers.includes(p.id) ? { ...p, streak: 0 } : p));
    if (settings.mode === 'survival' && round.status === 'lost') {
      const loserId = round.activePlayerId ?? players[0]?.id;
      players = updatePlayer(players, loserId, (p) => ({ ...p, lives: Math.max(0, (p.lives ?? settings.lives) - 1) }));
    }
  }

  const closed = replaceRound(state, { ...round, endedAt: round.endedAt ?? now });
  const next: GameState = { ...closed, players, streak, bestStreak, totalScore, status: 'round-over' };
  if (settings.mode === 'blitz') return advanceBlitz(next, now);
  return next;
}

function advanceBlitz(state: GameState, now: number): GameState {
  if (state.blitzEndsAt !== undefined && now >= state.blitzEndsAt) return finish(state, 'time', now);
  if (state.queue.length === 0) return finish(state, 'queue-empty', now);
  return openRound({ ...state, status: 'playing' }, state.queue[0], now);
}

function makeGuess(
  state: GameState,
  round: Round,
  text: string,
  verdict: Verdict,
  now: number,
  playerId: string | undefined,
  matched: { title: boolean; artist: boolean } = { title: false, artist: false },
): Guess {
  const g: Guess = {
    text,
    verdict,
    tryIndex: round.tryIndex,
    clipLength: clipLengthFor(state.settings, round.tryIndex, wonRounds(state)),
    at: now,
    matchedTitle: matched.title,
    matchedArtist: matched.artist,
  };
  if (playerId) g.playerId = playerId;
  return g;
}

/** Consume one try (wrong / partial / skip). Loses the round when none are left. */
function consumeTry(state: GameState, round: Round, now: number): GameState {
  const { settings } = state;
  if (settings.mode === 'blitz') {
    const penalized: GameState = {
      ...state,
      blitzEndsAt: state.blitzEndsAt !== undefined ? state.blitzEndsAt - BLITZ_PENALTY_MS : undefined,
    };
    return finishRound(penalized, { ...round, status: 'lost', endedAt: now }, now);
  }
  const nextTry = round.tryIndex + 1;
  if (nextTry >= settings.tries) {
    return finishRound(state, { ...round, status: 'lost', endedAt: now }, now);
  }
  const startOffset = settings.sameStartEachTry
    ? round.startOffset
    : pickStartOffset(settings, round.track, offsetKey(state.id, round.index, round.track.id, nextTry));
  return replaceRound(state, { ...round, tryIndex: nextTry, playsThisTry: 0, startOffset });
}

function loseRound(state: GameState, round: Round, now: number): GameState {
  if (state.settings.mode === 'blitz') {
    const penalized: GameState = {
      ...state,
      blitzEndsAt: state.blitzEndsAt !== undefined ? state.blitzEndsAt - BLITZ_PENALTY_MS : undefined,
    };
    return finishRound(penalized, { ...round, status: 'lost', endedAt: now }, now);
  }
  return finishRound(state, { ...round, status: 'lost', endedAt: now }, now);
}

function activeRound(state: GameState): Round | undefined {
  if (state.status !== 'playing') return undefined;
  const r = state.rounds[state.currentRound];
  return r && r.status === 'playing' ? r : undefined;
}

/** Resolve who is guessing; undefined when the action must be ignored. */
function resolveGuesser(state: GameState, round: Round, playerId: string | undefined): string | undefined {
  if (isBuzzerDuel(state.settings)) {
    if (round.activePlayerId) {
      if (playerId && playerId !== round.activePlayerId) return undefined;
      return round.activePlayerId;
    }
    if (!playerId) return undefined;
    if (!state.players.some((p) => p.id === playerId)) return undefined;
    if (round.lockedOutPlayerIds.includes(playerId)) return undefined;
    return playerId;
  }
  const active = round.activePlayerId ?? state.players[state.activePlayerIndex]?.id;
  if (playerId && active && playerId !== active) return undefined;
  return active;
}

// ---------------------------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------------------------

/**
 * Round order. Seeded: each track gets the key `hashToUnit(`${seed}|${id}`)` and the pool is sorted
 * by it — a track missing on one device (region-locked preview, rotated playlist snapshot,
 * recently-played exclusion) only removes itself instead of reshuffling everything. Unseeded:
 * Fisher–Yates from the rng.
 */
function orderQueue(tracks: Track[], seed: string | undefined, rng: Rng): Track[] {
  if (seed === undefined) return rng.shuffle(tracks);
  const key = new Map<number, number>();
  for (const t of tracks) key.set(t.id, hashToUnit(`${seed}|${t.id}`));
  return tracks.slice().sort((a, b) => (key.get(a.id) ?? 0) - (key.get(b.id) ?? 0) || a.id - b.id);
}

function onStart(action: Extract<GameAction, { type: 'start' }>, rng?: Rng): GameState {
  const settings = normalizeSettings(action.settings);
  const r = rng ?? createRng(settings.seed);
  const seen = new Set<number>();
  const tracks = action.tracks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
  const base: GameState = {
    ...createInitialState(),
    id: r.id(),
    settings,
    players: buildPlayers(settings),
    activePlayerIndex: 0,
    queue: orderQueue(tracks, settings.seed, r),
    startedAt: action.now,
  };
  if (settings.mode === 'blitz') base.blitzEndsAt = action.now + settings.blitzDuration * 1000;
  if (base.queue.length === 0) return finish(base, 'queue-empty', action.now);
  return openRound(base, base.queue[0], action.now);
}

function onPlay(state: GameState, now: number): GameState {
  const round = activeRound(state);
  if (!round) return state;
  const firstListen = !hasListened(round);
  return replaceRound(state, {
    ...round,
    playsThisTry: round.playsThisTry + 1,
    startedAt: firstListen && now > round.startedAt ? now : round.startedAt,
  });
}

function onGuess(state: GameState, action: Extract<GameAction, { type: 'guess' }>): GameState {
  const round = activeRound(state);
  if (!round) return state;
  const text = action.text.trim();
  if (!text) return state;
  const playerId = resolveGuesser(state, round, action.playerId);
  if (isBuzzerDuel(state.settings) && !playerId) return state;
  if (action.playerId && !playerId) return state;

  const { settings } = state;
  const result = matchGuess(text, round.track, settings.guessTarget);
  const guess = makeGuess(state, round, text, result.verdict, action.now, playerId, {
    title: result.matchedTitle,
    artist: result.matchedArtist,
  });
  const clipLength = guess.clipLength;
  const player = state.players.find((p) => p.id === playerId);
  const elapsedMs = Math.max(0, action.now - round.startedAt);

  if (result.verdict === 'correct') {
    const breakdown = scoreGuess({
      clipLength,
      tryIndex: round.tryIndex,
      tries: settings.tries,
      elapsedMs,
      hintsUsed: round.hintsUsed.length,
      streak: player?.streak ?? state.streak,
    });
    const won: Round = {
      ...round,
      guesses: [...round.guesses, guess],
      status: 'won',
      score: breakdown.total,
      endedAt: action.now,
      winnerPlayerId: playerId,
      activePlayerId: playerId ?? round.activePlayerId,
    };
    return finishRound(state, won, action.now);
  }

  if (result.verdict === 'partial') {
    const partialScore = scoreGuess({
      clipLength,
      tryIndex: round.tryIndex,
      tries: settings.tries,
      elapsedMs,
      hintsUsed: round.hintsUsed.length,
      streak: player?.streak ?? state.streak,
      partial: true,
    }).total;
    const withGuess: Round = { ...round, guesses: [...round.guesses, guess], score: Math.max(round.score, partialScore) };
    if (isBuzzerDuel(settings)) return buzzerWrong(state, withGuess, playerId, action.now);
    return consumeTry(state, withGuess, action.now);
  }

  const withGuess: Round = { ...round, guesses: [...round.guesses, guess] };
  if (isBuzzerDuel(settings)) return buzzerWrong(state, withGuess, playerId, action.now);
  return consumeTry(state, withGuess, action.now);
}

function buzzerWrong(state: GameState, round: Round, playerId: string | undefined, now: number): GameState {
  const locked = playerId && !round.lockedOutPlayerIds.includes(playerId)
    ? [...round.lockedOutPlayerIds, playerId]
    : round.lockedOutPlayerIds;
  const cleared: Round = { ...round, lockedOutPlayerIds: locked, activePlayerId: undefined };
  const allLocked = state.players.every((p) => locked.includes(p.id));
  if (allLocked) return finishRound(state, { ...cleared, status: 'lost', endedAt: now }, now);
  return replaceRound(state, cleared);
}

function onSkip(state: GameState, now: number): GameState {
  const round = activeRound(state);
  if (!round) return state;
  if (!state.settings.allowSkip) return state;
  const playerId = isBuzzerDuel(state.settings) ? undefined : round.activePlayerId;
  const withGuess: Round = { ...round, guesses: [...round.guesses, makeGuess(state, round, '', 'skipped', now, playerId)] };
  return consumeTry(state, withGuess, now);
}

function onGiveUp(state: GameState, now: number, verdict: 'skipped' | 'timeout'): GameState {
  const round = activeRound(state);
  if (!round) return state;
  const playerId = isBuzzerDuel(state.settings) ? undefined : round.activePlayerId;
  const withGuess: Round = { ...round, guesses: [...round.guesses, makeGuess(state, round, '', verdict, now, playerId)] };
  return loseRound(state, withGuess, now);
}

function onHint(state: GameState, action: Extract<GameAction, { type: 'hint' }>): GameState {
  const round = activeRound(state);
  if (!round) return state;
  const { settings } = state;
  if (!settings.hintsEnabled) return state;
  if (round.hintsUsed.includes(action.kind)) return state;
  if (round.hintsUsed.length >= maxHints(settings)) return state;
  if (hintText(action.kind, round.track) === null) return state;
  return replaceRound(state, { ...round, hintsUsed: [...round.hintsUsed, action.kind] });
}

function onBuzz(state: GameState, action: Extract<GameAction, { type: 'buzz' }>): GameState {
  const round = activeRound(state);
  if (!round) return state;
  if (!isBuzzerDuel(state.settings)) return state;
  if (round.activePlayerId) return state;
  if (!state.players.some((p) => p.id === action.playerId)) return state;
  if (round.lockedOutPlayerIds.includes(action.playerId)) return state;
  return replaceRound(state, { ...round, activePlayerId: action.playerId });
}

function onNext(state: GameState, now: number): GameState {
  if (state.status !== 'round-over') return state;
  const { settings } = state;
  if (settings.mode === 'survival' && state.players.length > 0 && state.players.every((p) => (p.lives ?? 0) <= 0)) {
    return finish(state, 'lives', now);
  }
  if (settings.rounds > 0 && state.rounds.length >= settings.rounds) return finish(state, 'rounds', now);
  if (state.queue.length === 0) return finish(state, 'queue-empty', now);
  let activePlayerIndex = state.activePlayerIndex;
  if (isMultiplayer(settings) && !isBuzzerDuel(settings) && state.players.length > 0) {
    activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  }
  return openRound({ ...state, activePlayerIndex }, state.queue[0], now);
}

function onTick(state: GameState, now: number): GameState {
  if (state.status !== 'playing') return state;
  if (state.settings.mode === 'blitz' && state.blitzEndsAt !== undefined && now >= state.blitzEndsAt) {
    return finish(state, 'time', now);
  }
  const round = activeRound(state);
  // The round timer only runs once the player has actually listened (startedAt is reset on the
  // first play); before that, a slow preview load must not burn the round. `timeLeftMs` mirrors this.
  if (round && hasListened(round) && state.settings.roundTimer > 0 && now >= round.startedAt + state.settings.roundTimer * 1000) {
    return onGiveUp(state, now, 'timeout');
  }
  return state;
}

function onQuit(state: GameState, now: number): GameState {
  if (state.status !== 'playing' && state.status !== 'round-over') return state;
  return finish(state, 'quit', now);
}

// ---------------------------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------------------------

export function reduce(state: GameState, action: GameAction, rng?: Rng): GameState {
  switch (action.type) {
    case 'start':
      return onStart(action, rng);
    case 'play':
      return onPlay(state, action.now);
    case 'guess':
      return onGuess(state, action);
    case 'skip':
      return onSkip(state, action.now);
    case 'giveUp':
      return onGiveUp(state, action.now, 'skipped');
    case 'timeout':
      return onGiveUp(state, action.now, 'timeout');
    case 'hint':
      return onHint(state, action);
    case 'buzz':
      return onBuzz(state, action);
    case 'next':
      return onNext(state, action.now);
    case 'tick':
      return onTick(state, action.now);
    case 'quit':
      return onQuit(state, action.now);
    default:
      return state;
  }
}
