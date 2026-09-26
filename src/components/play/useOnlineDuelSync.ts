/**
 * Keeps an online duel informed: progress after every round, the final result once, and a toast
 * when the connection complains. `active` is true only while a race is actually running.
 */

import { useEffect } from 'react';
import { useOnlineDuel, type UseOnlineDuel } from '@/net';
import { toast } from '@/components/ui/Toast';
import { useGameEvents } from './gameEvents';

export function isDuelActive(duel: Pick<UseOnlineDuel, 'initPayload' | 'status'>): boolean {
  return duel.initPayload !== null && (duel.status === 'playing' || duel.status === 'finished');
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
