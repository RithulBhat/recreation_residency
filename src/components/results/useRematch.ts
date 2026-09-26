/**
 * Online-duel rematch choreography on the Results screen.
 *   both  → rematch() / acceptRematch()             (buttons)
 *   host  → rematchSeed arrives → sendInit(same settings + pool, new seed) → wait for ready → start()
 *   guest → a NEW initPayload arrives → ready()
 *   both  → countdown reaches 0 → startLoadedGame(initPayload) → /play
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { UseOnlineDuel } from '@/net';
import { startLoadedGame } from '@/lib/startGame';

export function useRematch(duel: UseOnlineDuel, enabled: boolean): void {
  const navigate = useNavigate();
  const { isHost, rematchSeed, initPayload, opponentReady, countdown, sendInit, start, ready } = duel;
  /** The init of the game that was just played — anything else is a rematch. */
  const baseline = useRef(initPayload);
  const sentFor = useRef<string | null>(null);
  const started = useRef(false);
  const prevCountdown = useRef(countdown);

  useEffect(() => {
    if (!enabled || !isHost || !rematchSeed || !initPayload || sentFor.current === rematchSeed) return;
    sentFor.current = rematchSeed;
    sendInit(initPayload.settings, initPayload.tracks);
  }, [enabled, isHost, rematchSeed, initPayload, sendInit]);

  useEffect(() => {
    if (!enabled || isHost || !initPayload || initPayload === baseline.current) return;
    baseline.current = initPayload;
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
    if (!enabled || countdown !== 0 || prev === null || prev <= 0 || !initPayload) return;
    startLoadedGame(initPayload);
    navigate('/play');
  }, [enabled, countdown, initPayload, navigate]);
}
