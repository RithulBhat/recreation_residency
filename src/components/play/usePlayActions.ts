/**
 * The Play screen's verbs — submit (typed / spoken), next, hint, buzz — wired to the game store with
 * the screen-side consequences (shake on a miss, pass-the-phone, focus back in the field).
 */

import { useCallback, type RefObject } from 'react';
import type { HintKind, PlayerState } from '@/types';
import { pickVoiceGuess } from '@/voice';
import { toast } from '@/components/ui/Toast';
import { isBuzzerDuel, isMultiplayer } from '@/game/presets';
import { activePlayer, canGuess, currentRound } from '@/game/selectors';
import { useGameStore } from '@/store/gameStore';

export interface PlayActionsInput {
  stopAudio: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  setQuery: (q: string) => void;
  /** A wrong guess landed (shake the box). */
  onMiss: () => void;
  /** Pass-and-play: the next player is up. */
  onPass: (player: PlayerState) => void;
}

export interface PlayActions {
  submit: (text: string) => void;
  /** Voice: try every form of what was said against the round and submit the one the matcher accepts. */
  submitVoice: (cleaned: string, raw: string) => void;
  next: () => void;
  hint: (kind: HintKind) => void;
  buzz: (playerId: string) => void;
  /** Buzz for the player at that index (A = 0, L = 1). */
  buzzAt: (index: number) => void;
}

/** Focus the guess field, but only where a keyboard is already out (never pop the mobile keyboard). */
export function focusSoon(ref: RefObject<HTMLInputElement | null>): void {
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: fine)').matches) return;
  requestAnimationFrame(() => ref.current?.focus());
}

export function usePlayActions({ stopAudio, inputRef, setQuery, onMiss, onPass }: PlayActionsInput): PlayActions {
  const { guess, hint, next, buzz } = useGameStore.getState();

  const submit = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      const s = useGameStore.getState().state;
      const r = currentRound(s);
      if (!r || s.status !== 'playing') return;
      if (!canGuess(s)) {
        toast({ title: 'Buzz in first', description: 'Press A or L to grab the buzzer.', tone: 'warn', duration: 1800 });
        return;
      }
      const before = r.guesses.length;
      guess(t, isBuzzerDuel(s.settings) ? r.activePlayerId : undefined);
      const after = useGameStore.getState().state.rounds[r.index];
      const last = after?.guesses[after.guesses.length - 1];
      if (after && after.guesses.length > before && last?.verdict === 'wrong') onMiss();
      setQuery('');
    },
    [guess, onMiss, setQuery],
  );

  // Transcript cleanup is lossy ("Stand By Me" → "Stand - Me", "It's My Life" → …).
  const submitVoice = useCallback(
    (cleaned: string, raw: string) => {
      const s = useGameStore.getState().state;
      const r = currentRound(s);
      submit(r ? pickVoiceGuess(cleaned, raw, r.track, s.settings.guessTarget) : cleaned);
    },
    [submit],
  );

  const onNext = useCallback(() => {
    if (useGameStore.getState().state.status !== 'round-over') return;
    stopAudio();
    next();
    setQuery('');
    const s = useGameStore.getState().state;
    if (s.status === 'playing' && isMultiplayer(s.settings) && !isBuzzerDuel(s.settings)) {
      const p = activePlayer(s);
      if (p) onPass(p);
    } else if (s.status === 'playing' && !isBuzzerDuel(s.settings)) focusSoon(inputRef);
  }, [next, stopAudio, setQuery, onPass, inputRef]);

  const onHint = useCallback((kind: HintKind) => hint(kind), [hint]);

  const onBuzz = useCallback(
    (playerId: string) => {
      buzz(playerId);
      if (canGuess(useGameStore.getState().state)) focusSoon(inputRef);
    },
    [buzz, inputRef],
  );
  const buzzAt = useCallback(
    (i: number) => {
      const s = useGameStore.getState().state;
      const p = s.players[i];
      if (p && isBuzzerDuel(s.settings)) onBuzz(p.id);
    },
    [onBuzz],
  );

  return { submit, submitVoice, next: onNext, hint: onHint, buzz: onBuzz, buzzAt };
}
