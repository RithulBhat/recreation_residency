import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Trophy } from 'lucide-react';
import {
  FormatOutcome,
  ProgressionCard,
  ResultActions,
  ResultsHero,
  RoundList,
  Scoreboard,
  isDiscardedScoutGame,
  startScoutGame,
  useScoutClips,
  useScoutStarting,
} from '@/components/scout';
import { R } from '@/routes';
import { isMultiplayerRun } from '@/scout/selectors';
import { summarizeScoutGame, useScoutResultStore } from '@/store/scoutResultStore';
import { useScoutStatsStore, type RecordScoutGameResult } from '@/store/scoutStatsStore';
import { useScoutStore } from '@/store/scoutStore';

/** "You beat Maya's 6,420!" — shown when this run came from a challenge link. */
function ChallengeBanner({ by, theirScore, yourScore }: { by: string; theirScore: number; yourScore: number }) {
  const won = yourScore > theirScore;
  const diff = Math.abs(yourScore - theirScore).toLocaleString('en-US');
  return (
    <section
      className="glass flex items-center gap-3 rounded-4xl border-accent/30 p-4"
      aria-label="Challenge result"
      data-testid="scout-challenge-banner"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-accent-fg [&>svg]:size-5" aria-hidden>
        <Trophy />
      </span>
      <p className="min-w-0 text-sm text-fg">
        <span className="font-bold">{won ? `You beat ${by}!` : yourScore === theirScore ? `Dead level with ${by}.` : `${by} still leads.`}</span>{' '}
        <span className="text-muted">
          {won ? `+${diff} clear of ${theirScore.toLocaleString('en-US')}.` : yourScore === theirScore ? `${theirScore.toLocaleString('en-US')} each.` : `${diff} short of ${theirScore.toLocaleString('en-US')}.`}
        </span>
      </p>
    </section>
  );
}

/**
 * Highlight Scout — the post-session wrap-up: what the FORMAT did, the score, the board, what next.
 *
 * Two stores get the run. `scoutResultStore` is the play → results hand-off (and the short history the
 * home screen reads); `scoutStatsStore` is the LIFETIME record — XP, ranks, the 47 badges, the per-club
 * heatmap — and it is folded in HERE rather than in `useFinishScoutGame`, because the card that shows a
 * rank-up and the badges needs the result of the fold, and `recordScoutGame` is idempotent per run id
 * (a second call returns `duplicate: true` and writes nothing).
 */
export default function ScoutResults() {
  const navigate = useNavigate();
  const state = useScoutStore((s) => s.state);
  const finished = state.status === 'finished' && !isDiscardedScoutGame(state);
  const challenger = useScoutResultStore((s) => s.challenger);
  const clips = useScoutClips();
  const { starting } = useScoutStarting();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<RecordScoutGameResult | null>(null);

  const record = useMemo(() => (finished ? summarizeScoutGame(state) : null), [finished, state]);
  const multiplayer = isMultiplayerRun(state);

  // Normally recorded by Play before it navigates here; this covers a direct visit (both idempotent).
  // The ref is what keeps the FIRST fold: StrictMode runs this effect twice, and the second call
  // legitimately comes back `duplicate: true` with no XP and no badges — which is the right answer for
  // a genuine revisit and the wrong one to paint over a rank-up the player just earned.
  const foldedRunId = useRef<string | null>(null);
  useEffect(() => {
    if (!finished || foldedRunId.current === state.id) return;
    foldedRunId.current = state.id;
    const run = useScoutStore.getState().state;
    useScoutResultStore.getState().recordGame(run);
    const stats = useScoutStatsStore.getState();
    const folded = run.settings.daily
      ? stats.recordScoutDaily(run, run.settings.daily)
      : stats.recordScoutGame(run);
    setProgress(folded);
  }, [finished, state.id]);

  const playAgain = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await startScoutGame({ ...useScoutStore.getState().state.settings, seed: undefined, daily: undefined });
      navigate(R.scout.play);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not start another session.');
    }
  }, [navigate]);

  if (!finished || record === null) {
    // A "play again" in flight flips the store to a live session a moment before it navigates;
    // bouncing through Setup in that window would flash the lobby and rewrite history.
    if (busy || starting) return null;
    return <Navigate to={R.scout.setup} replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8 sm:gap-5">
      <ResultsHero record={record} state={state} />
      {challenger && <ChallengeBanner by={challenger.by} theirScore={challenger.score} yourScore={record.score} />}
      <ResultActions state={state} record={record} onPlayAgain={() => void playAgain()} loading={busy} />
      {error !== null && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
      {multiplayer ? <Scoreboard state={state} /> : <FormatOutcome state={state} />}
      <ProgressionCard result={progress} />
      <RoundList state={state} clips={clips} />
    </div>
  );
}
