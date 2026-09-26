import { Link } from 'react-router';
import { ArrowRight, Play } from 'lucide-react';
import type { GameState } from '@/types';
import { R } from '@/routes';
import { useGameStore } from '@/store/gameStore';
import { isGameLive, type UseStartGame } from '@/hooks/useStartGame';
import { MODE_LABEL } from '@/components/setup/summary';
import { Button, Dialog, cn } from '@/components/ui';

/** "Round 4/10", "Round 4" (endless) or "Blitz" — where a live game currently is. */
export function progressLabel(state: GameState): string {
  if (state.settings.mode === 'blitz') return 'Blitz';
  const n = Math.max(1, state.currentRound + 1);
  const total = state.settings.rounds;
  return total > 0 ? `Round ${Math.min(n, total)}/${total}` : `Round ${n}`;
}

/** Slim "Round 4/10 in progress · Resume" strip shown on Home and Setup while a game is live. */
export function ResumeBanner({ className }: { className?: string }) {
  const state = useGameStore((s) => s.state);
  if (!isGameLive(state.status)) return null;
  return (
    <Link
      to={R.songooner.play}
      data-testid="resume-banner"
      className={cn(
        'glass group flex items-center gap-3 rounded-2xl border-accent/40 px-4 py-2.5 text-sm text-fg transition-colors hover:bg-surface-strong',
        className,
      )}
    >
      <span className="relative flex size-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-accent" />
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{progressLabel(state)}</span>
        <span className="text-muted"> · {MODE_LABEL[state.settings.mode]} in progress</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent">
        Resume
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

export interface ReplaceGameDialogProps {
  game: Pick<UseStartGame, 'pending' | 'confirmPending' | 'cancelPending'>;
}

/** Asks before a new start throws away a game that is still in progress. */
export function ReplaceGameDialog({ game }: ReplaceGameDialogProps) {
  const state = useGameStore((s) => s.state);
  return (
    <Dialog
      open={game.pending}
      onClose={game.cancelPending}
      size="sm"
      title="Replace the game in progress?"
      description={`${progressLabel(state)} of your ${MODE_LABEL[state.settings.mode]} game will be lost.`}
      footer={
        <>
          <Button variant="ghost" onClick={game.cancelPending}>
            Keep it
          </Button>
          <Button variant="glow" leadingIcon={<Play className="fill-current" />} onClick={game.confirmPending} data-testid="confirm-replace-game">
            Start new game
          </Button>
        </>
      }
    >
      <Link to={R.songooner.play} onClick={game.cancelPending} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
        Resume that game instead
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Dialog>
  );
}
