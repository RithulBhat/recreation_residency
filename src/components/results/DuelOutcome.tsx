import { Swords } from 'lucide-react';
import type { GameState } from '@/types';
import type { UseOnlineDuel } from '@/net';
import { Avatar, Button, cn } from '@/components/ui';
import { points } from '@/components/play/format';
import { useRematch } from './useRematch';

export interface DuelOutcomeProps {
  duel: UseOnlineDuel;
  state: GameState;
}

const BANNER = {
  win: { title: 'You win!', tone: 'text-success', ring: 'border-success/40' },
  loss: { title: 'They got you.', tone: 'text-danger', ring: 'border-danger/40' },
  tie: { title: 'Dead heat.', tone: 'text-warn', ring: 'border-warn/40' },
  pending: { title: 'Waiting for opponent…', tone: 'text-muted', ring: 'border-border' },
} as const;

/** Online duel banner: outcome, both scores, rematch handshake. */
export function DuelOutcome({ duel, state }: DuelOutcomeProps) {
  useRematch(duel, true);
  const banner = BANNER[duel.outcome];
  const me = duel.me;
  const them = duel.opponent;
  const theirs = duel.opponentFinished;
  const mineDone = duel.myFinished;
  /** Equal scores are settled on correct calls, then on time (see `net/progress.outcome`) — say which. */
  const tiebreak =
    mineDone && theirs && mineDone.score === theirs.score
      ? mineDone.correct !== theirs.correct
        ? 'Same points — more correct calls takes it.'
        : mineDone.durationMs !== theirs.durationMs
          ? 'Same points, same calls — the faster run takes it.'
          : null
      : null;
  const counting = duel.countdown !== null && duel.countdown > 0;
  const rematchLabel = counting
    ? `Starting in ${duel.countdown}…`
    : duel.rematchOffer
      ? 'Accept rematch'
      : duel.rematchPending
        ? 'Waiting for opponent…'
        : duel.rematchSeed
          ? 'Setting up…'
          : 'Rematch';

  return (
    <section className={cn('glass rounded-4xl border p-5', banner.ring)} aria-label="Duel result" data-testid="duel-outcome" aria-live="polite">
      <div className="flex items-center gap-3">
        <Swords className="size-5 text-accent" aria-hidden />
        <h2 className={cn('font-display text-2xl font-black', banner.tone)}>{banner.title}</h2>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2">
          {me && <Avatar emoji={me.emoji} color={me.color} size="sm" name={me.name} />}
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-fg">{me?.name ?? 'You'}</div>
            <div className="font-mono text-lg font-bold text-fg tabular">{points(state.totalScore)}</div>
          </div>
        </div>
        <span className="font-display text-sm text-muted">vs</span>
        <div className="flex items-center justify-end gap-2 text-right">
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-fg">{them?.name ?? 'Opponent'}</div>
            <div className="font-mono text-lg font-bold text-fg tabular">{theirs ? points(theirs.score) : '…'}</div>
          </div>
          {them && <Avatar emoji={them.emoji} color={them.color} size="sm" name={them.name} />}
        </div>
      </div>
      {tiebreak && <p className="mt-2 text-center text-xs text-muted">{tiebreak}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant={duel.rematchOffer ? 'glow' : 'primary'}
          onClick={duel.rematchOffer ? duel.acceptRematch : duel.rematch}
          disabled={!duel.connected || duel.rematchPending || counting || !!duel.rematchSeed}
          loading={counting}
        >
          {rematchLabel}
        </Button>
        <Button variant="ghost" onClick={duel.leave} to="/duel">
          Leave duel
        </Button>
      </div>
    </section>
  );
}
