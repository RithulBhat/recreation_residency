/**
 * What happens when the game store reaches 'finished' while the Play screen is up: record the game
 * and go to Results — unless the player quit before doing anything, in which case there is nothing
 * to record and Setup is where they wanted to be.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { GameState } from '@/types';
import { toast } from '@/components/ui/Toast';
import { anyRoundAttempted } from '@/stats/aggregate';
import { useGameStore } from '@/store/gameStore';
import { useResultStore } from '@/store/resultStore';
import { useSettingsStore } from '@/store/settingsStore';

/** A game quit before a single listen, guess or verdict — never counted, never shown on Results. */
export function isDiscardedGame(state: GameState): boolean {
  return state.status === 'finished' && state.endReason === 'quit' && !anyRoundAttempted(state);
}

export function useFinishGame(): void {
  const navigate = useNavigate();
  const status = useGameStore((s) => s.state.status);
  useEffect(() => {
    if (status !== 'finished') return;
    const state = useGameStore.getState().state;
    if (isDiscardedGame(state)) {
      toast({ title: 'Game discarded', description: 'Nothing was played, so nothing was recorded.', duration: 2500 });
      navigate('/setup', { replace: true });
      return;
    }
    useResultStore.getState().record(state);
    useSettingsStore.getState().pushRecentTracks(state.rounds.map((r) => r.track.id));
    navigate('/results', { replace: true });
  }, [status, navigate]);
}
