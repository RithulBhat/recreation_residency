import { useEffect, useMemo } from 'react';
import { Navigate } from 'react-router';
import { useOnlineDuel } from '@/net';
import { summarizeGame } from '@/stats/aggregate';
import { isMultiplayer } from '@/game/presets';
import { useStartGame } from '@/hooks/useStartGame';
import { useGameStore } from '@/store/gameStore';
import { useResultStore } from '@/store/resultStore';
import { isDuelActive } from '@/components/play/useOnlineDuelSync';
import { isLiveGame } from '@/components/play/useGameAudio';
import { isDiscardedGame } from '@/components/play/useFinishGame';
import { R } from '@/routes';
import {
  ChallengeBanner,
  DailyCard,
  DuelOutcome,
  Podium,
  ProgressionCard,
  ResultActions,
  ResultsHero,
  RoundList,
  usePreviewPlayer,
} from '@/components/results';

/** Results screen — the post-game wrap-up: score, what next, standings, progression, every round. */
export default function Results() {
  const state = useGameStore((s) => s.state);
  // A game quit before anything happened is never shown or recorded (see `useFinishGame`).
  const finished = state.status === 'finished' && !isDiscardedGame(state);
  const gameId = state.id;
  const stored = useResultStore((s) => (s.gameId === gameId ? s.result : null));
  const challenger = useResultStore((s) => s.challenger);
  const duel = useOnlineDuel();
  const duelActive = isDuelActive(duel);
  const player = usePreviewPlayer();
  const { start, loading, error } = useStartGame();
  const record = useMemo(() => (finished ? summarizeGame(state) : null), [finished, state]);

  // Normally recorded by Play before navigating here; this covers a direct visit (idempotent).
  useEffect(() => {
    if (finished) useResultStore.getState().record(useGameStore.getState().state);
  }, [finished, gameId]);

  // "Play again" (and a duel rematch) flip the store to the new game a moment before they navigate
  // to /play; bouncing through /setup in that window flashed the lobby and rewrote history. Only a
  // genuinely unfinished game with no start in flight is sent to Setup.
  if (!finished || record === null) {
    if (loading) return null;
    if (duelActive && isLiveGame(state)) return duel.startAt !== null ? null : <Navigate to={R.songooner.play} replace />;
    return <Navigate to={R.songooner.setup} replace />;
  }

  const { settings } = state;
  const playAgain = () => {
    player.stop();
    void start({ ...settings, seed: undefined, daily: undefined });
  };

  // The actions sit right under the hero so "Play again" and "Share" are on screen at 390×844 even
  // when a party podium, a rank-up card and a daily grid follow.
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8 sm:gap-5">
      <ResultsHero state={state} record={record} />
      {challenger && !duelActive && <ChallengeBanner challenger={challenger} score={state.totalScore} />}
      {duelActive && <DuelOutcome duel={duel} state={state} />}
      {!duelActive && <ResultActions state={state} onPlayAgain={playAgain} loading={loading} />}
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
      {isMultiplayer(settings) && <Podium state={state} />}
      <ProgressionCard result={stored} />
      {settings.daily && <DailyCard state={state} date={settings.daily} />}
      <RoundList state={state} player={player} />
    </div>
  );
}
