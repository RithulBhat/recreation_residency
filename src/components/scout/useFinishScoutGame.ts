/**
 * What happens when the Scout store reaches 'finished' while the play screen is up: fold the session
 * into `scoutResultStore` and go to Results — unless the player quit before doing anything, in which
 * case there is nothing to record and Setup is where they meant to be. Mirrors
 * `src/components/play/useFinishGame.ts`.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from '@/components/ui/Toast';
import { R } from '@/routes';
import type { ScoutState } from '@/scout/types';
import { useScoutResultStore } from '@/store/scoutResultStore';
import { useScoutStore } from '@/store/scoutStore';

/** Did the player actually engage with any round? */
export function scoutAttempted(state: ScoutState): boolean {
  return state.rounds.some((r) => r.guesses.length > 0 || r.status === 'won');
}

/** A session quit before a single guess — never recorded, never shown on Results. */
export function isDiscardedScoutGame(state: ScoutState): boolean {
  return state.status === 'finished' && state.endReason === 'quit' && !scoutAttempted(state);
}

export function useFinishScoutGame(): void {
  const navigate = useNavigate();
  const status = useScoutStore((s) => s.state.status);
  useEffect(() => {
    if (status !== 'finished') return;
    const state = useScoutStore.getState().state;
    if (isDiscardedScoutGame(state)) {
      toast({ title: 'Session discarded', description: 'Nothing was guessed, so nothing was recorded.', duration: 2500 });
      navigate(R.scout.setup, { replace: true });
      return;
    }
    useScoutResultStore.getState().recordGame(state);
    navigate(R.scout.results, { replace: true });
  }, [status, navigate]);
}
