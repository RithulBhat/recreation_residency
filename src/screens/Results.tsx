import { useEffect, useMemo } from 'react';
import { Navigate } from 'react-router';
import { useOnlineDuel } from '@/net';
import { summarizeGame } from '@/stats/aggregate';
import { isMultiplayer } from '@/game/presets';
import { useStartGame } from '@/hooks/useStartGame';
import { useGameStore } from '@/store/gameStore';
import { useResultStore } from '@/store/resultStore';
import { isDuelActive } from '@/components/play/useOnlineDuelSync';
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

/** Results screen — the post-game wrap-up: score, progression, standings, every round, and what next. */
export default function Results() {
  const state = useGameStore((s) => s.state);
  const finished = state.status === 'finished';
  const gameId = state.id;
  const stored = useResultStore((s) => (s.gameId === gameId ? s.result : null));
  const challenger = useResultStore((s) => s.challenger);
  const duel = useOnlineDuel();
  const duelActive = isDuelActive(duel);
  const player = usePreviewPlayer();
  const { start, loading, error } = useStartGame();
  const record = useMemo(() => summarizeGame(state), [state]);

  // Normally recorded by Play before navigating here; this covers a direct visit (idempotent).
  useEffect(() => {
    if (finished) useResultStore.getState().record(useGameStore.getState().state);
  }, [finished, gameId]);

  if (!finished) return <Navigate to="/setup" replace />;

  const { settings } = state;
  const playAgain = () => {
    player.stop();
    void start({ ...settings, seed: undefined, daily: undefined });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8 sm:gap-5">
      <ResultsHero state={state} record={record} />
      {challenger && !duelActive && <ChallengeBanner challenger={challenger} score={state.totalScore} />}
      {duelActive && <DuelOutcome duel={duel} state={state} />}
      {isMultiplayer(settings) && <Podium state={state} />}
      {!duelActive && <ResultActions state={state} onPlayAgain={playAgain} loading={loading} />}
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
      <ProgressionCard result={stored} />
      {settings.daily && <DailyCard state={state} date={settings.daily} />}
      <RoundList state={state} player={player} />
    </div>
  );
}
