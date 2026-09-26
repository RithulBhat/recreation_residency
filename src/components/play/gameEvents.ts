/**
 * Turns two consecutive `GameState`s into a list of semantic events (guess, round over, buzz,
 * streak milestone, finished…). Pure and framework-free so the sfx / host / net side effects can
 * all key off one diff. `useGameEvents` subscribes to the game store and feeds a handler.
 */

import { useEffect, useRef } from 'react';
import type { GameState, Guess, PlayerState, Round } from '@/types';
import { isBuzzerDuel } from '@/game/presets';
import { useGameStore } from '@/store/gameStore';

export const STREAK_MILESTONES: readonly number[] = [3, 5, 10];

export type GameEvent =
  | { type: 'gameStart'; state: GameState }
  | { type: 'roundStart'; round: Round; state: GameState }
  | { type: 'buzz'; round: Round; player: PlayerState; state: GameState }
  | { type: 'guess'; round: Round; guess: Guess; triesLeft: number; state: GameState }
  | { type: 'roundOver'; round: Round; state: GameState }
  | { type: 'streak'; player: PlayerState; streak: number; state: GameState }
  | { type: 'finished'; state: GameState };

/** Events that happened between `prev` and `next`, in the order they logically occurred. */
export function diffGameEvents(prev: GameState, next: GameState): GameEvent[] {
  if (prev === next || next.status === 'idle') return [];
  const out: GameEvent[] = [];
  const sameGame = prev.id === next.id && prev.status !== 'idle';
  if (!sameGame) out.push({ type: 'gameStart', state: next });

  for (const round of next.rounds) {
    const before = sameGame ? prev.rounds[round.index] : undefined;
    if (before === round) continue;
    if (!before) out.push({ type: 'roundStart', round, state: next });
    const prevGuesses = before?.guesses.length ?? 0;

    if (
      isBuzzerDuel(next.settings) &&
      round.activePlayerId &&
      before?.activePlayerId !== round.activePlayerId &&
      round.guesses.length === prevGuesses
    ) {
      const player = next.players.find((p) => p.id === round.activePlayerId);
      if (player) out.push({ type: 'buzz', round, player, state: next });
    }

    for (let j = prevGuesses; j < round.guesses.length; j++) {
      const triesLeft = round.status === 'playing' ? Math.max(0, next.settings.tries - round.tryIndex) : 0;
      out.push({ type: 'guess', round, guess: round.guesses[j], triesLeft, state: next });
    }

    if ((before?.status ?? 'playing') === 'playing' && round.status !== 'playing') {
      out.push({ type: 'roundOver', round, state: next });
    }
  }

  for (const player of next.players) {
    const before = sameGame ? prev.players.find((p) => p.id === player.id) : undefined;
    const was = before?.streak ?? 0;
    if (player.streak > was && STREAK_MILESTONES.includes(player.streak)) {
      out.push({ type: 'streak', player, streak: player.streak, state: next });
    }
  }

  if (next.status === 'finished' && (!sameGame || prev.status !== 'finished')) {
    out.push({ type: 'finished', state: next });
  }
  return out;
}

/**
 * Events to replay when the Play screen mounts on a game that started before it was listening:
 * the game/round start of an untouched first round.
 */
export function initialGameEvents(state: GameState): GameEvent[] {
  if (state.status !== 'playing') return [];
  const round = state.rounds[state.currentRound];
  if (!round || round.index !== 0 || round.guesses.length > 0 || round.playsThisTry > 0) return [];
  return [
    { type: 'gameStart', state },
    { type: 'roundStart', round, state },
  ];
}

/** Subscribe to game store transitions and hand every derived event to `handler`. */
export function useGameEvents(handler: (event: GameEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(
    () =>
      useGameStore.subscribe((store, prev) => {
        for (const event of diffGameEvents(prev.state, store.state)) ref.current(event);
      }),
    [],
  );
}
