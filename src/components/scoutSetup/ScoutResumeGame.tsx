import { Link } from 'react-router';
import { Binoculars } from 'lucide-react';
import { progress } from '@/scout/selectors';
import { useScoutStore } from '@/store/scoutStore';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { R } from '@/routes';
import { SCOUT_MODE_LABEL } from './summary';
import { isScoutRunLive, type UseStartScout } from './useStartScout';

/** `Round 3/10` (or `Round 3` when the run is endless). */
function progressLabel(round: number, total: number): string {
  return total > 0 ? `Round ${round}/${total}` : `Round ${round}`;
}

/** A slim banner when a Scout run is still live, so it is never lost by accident. */
export function ScoutResumeBanner() {
  const state = useScoutStore((s) => s.state);
  if (!isScoutRunLive(state.status)) return null;
  const p = progress(state);

  return (
    <Link
      to={R.scout.play}
      data-testid="scout-resume-banner"
      className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors hover:bg-surface-strong"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-accent text-accent-fg" aria-hidden>
        <Binoculars className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-fg">Run in progress</span>
        <span className="block truncate font-mono text-[11px] tabular text-muted">
          {state.settings.mixModes ? 'Mixed bag' : SCOUT_MODE_LABEL[state.settings.mode]} ·{' '}
          {progressLabel(p.round, p.total)}
        </span>
      </span>
      <span className="shrink-0 text-sm font-bold text-accent">Resume</span>
    </Link>
  );
}

/** "Replace the run in progress?" — shown when Start would throw a live run away. */
export function ScoutReplaceDialog({ game }: { game: UseStartScout }) {
  const state = useScoutStore((s) => s.state);
  const p = progress(state);

  return (
    <Dialog
      open={game.pending}
      onClose={game.cancelPending}
      title="Replace the run in progress?"
      description={`You are on ${progressLabel(p.round, p.total)}. Starting a new run ends it — the score so far is lost.`}
      footer={
        <>
          <Button variant="ghost" onClick={game.cancelPending}>
            Keep it
          </Button>
          <Button variant="glow" onClick={game.confirmPending} data-testid="scout-confirm-replace">
            Start a new run
          </Button>
        </>
      }
    />
  );
}
