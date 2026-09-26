/**
 * Online-duel rematch choreography on the Results screen.
 *   both  → rematch() / acceptRematch()             (buttons)
 *   host  → rematchSeed arrives → sendInit(same settings + pool, new seed) → wait for ready → start()
 *   guest → a NEW initPayload arrives → ready()
 *   both  → countdown reaches 0 → startLoadedGame(initPayload) → /play   (exactly once)
 * Returns the phase so the banner can say what everyone is waiting for.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { UseOnlineDuel } from '@/net';
import { startLoadedGame } from '@/lib/startGame';

export type RematchPhase =
  | 'idle'
  | 'offer' // they asked; I can accept
  | 'pending' // I asked; waiting for them
  | 'setup' // agreed; host is (re)sending the init
  | 'waitingReady' // host: init sent, guest not ready yet
  | 'ready' // guest readied / host about to start
  | 'countdown'
  | 'go';

export function useRematch(duel: UseOnlineDuel, enabled: boolean): RematchPhase {
  const navigate = useNavigate();
  const { isHost, rematchSeed, rematchOffer, rematchPending, initPayload, opponentReady, myReady, countdown, sendInit, start, ready } = duel;
  /** The init of the game that was just played — anything else is a rematch. */
  const baseline = useRef(initPayload);
  const sentFor = useRef<string | null>(null);
  /** Guest: the rematch init this hook readied up for (`myReady` alone still reflects the game just played). */
  const readiedFor = useRef<typeof initPayload>(null);
  const started = useRef(false);
  const launched = useRef(false);
  const prevCountdown = useRef(countdown);
  const fresh = initPayload !== null && initPayload !== baseline.current;

  useEffect(() => {
    if (!enabled || !isHost || !rematchSeed || !initPayload || sentFor.current === rematchSeed) return;
    sentFor.current = rematchSeed;
    sendInit(initPayload.settings, initPayload.tracks);
  }, [enabled, isHost, rematchSeed, initPayload, sendInit]);

  useEffect(() => {
    if (!enabled || isHost || !initPayload || initPayload === baseline.current) return;
    baseline.current = initPayload;
    readiedFor.current = initPayload;
    ready();
  }, [enabled, isHost, initPayload, ready]);

  useEffect(() => {
    if (!enabled || !isHost || !opponentReady || !initPayload || initPayload === baseline.current || started.current) return;
    started.current = true;
    start();
  }, [enabled, isHost, opponentReady, initPayload, start]);

  useEffect(() => {
    const prev = prevCountdown.current;
    prevCountdown.current = countdown;
    if (!enabled || countdown !== 0 || prev === null || prev <= 0 || !initPayload || launched.current) return;
    launched.current = true;
    startLoadedGame(initPayload);
    navigate('/play');
  }, [enabled, countdown, initPayload, navigate]);

  if (countdown !== null && countdown > 0) return 'countdown';
  if (countdown === 0) return 'go';
  if (rematchOffer) return 'offer';
  if (rematchPending) return 'pending';
  if (rematchSeed) return 'setup';
  if (isHost && fresh) return opponentReady ? 'ready' : 'waitingReady';
  if (!isHost && myReady && initPayload !== null && readiedFor.current === initPayload) return 'ready';
  return 'idle';
}
