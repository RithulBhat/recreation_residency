/**
 * Keeps an online duel informed: progress after every round, the final result once, and a toast
 * when the connection complains. `active` is true while a duel SESSION is live (see `isDuelActive`).
 */

import { useEffect } from 'react';
import { useOnlineDuel, type UseOnlineDuel } from '@/net';
import { toast } from '@/components/ui/Toast';
import { useGameEvents } from './gameEvents';

/**
 * A duel is live while the session exists: a role is set, the opponent is known or an init has been
 * exchanged, and the connection is neither idle, closed nor failed. A rematch passes through
 * 'connected' between two races — keying this on 'playing | finished' used to unmount the rematch
 * choreography mid-handshake and leave both players on a solo results page.
 */
export function isDuelActive(duel: Pick<UseOnlineDuel, 'role' | 'status' | 'opponent' | 'initPayload'>): boolean {
  if (duel.role === null) return false;
  if (duel.status === 'idle' || duel.status === 'closed' || duel.status === 'error') return false;
  return duel.opponent !== null || duel.initPayload !== null;
}

export function useOnlineDuelSync(): { duel: UseOnlineDuel; active: boolean } {
  const duel = useOnlineDuel();
  const active = isDuelActive(duel);

  const { sendProgress, sendFinished, initPayload, error } = duel;
  useGameEvents((event) => {
    if (!initPayload || event.state.id === '') return;
    if (event.type === 'roundOver') sendProgress(event.state);
    if (event.type === 'finished') sendFinished(event.state);
  });

  useEffect(() => {
    if (error) toast.error('Duel connection', error);
  }, [error]);

  return { duel, active };
}
