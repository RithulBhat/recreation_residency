import { Swords } from 'lucide-react';
import type { GameState } from '@/types';
import type { UseOnlineDuel } from '@/net';
import { Avatar, Button, cn } from '@/components/ui';
import { points } from '@/components/play/format';
import { R } from '@/routes';
import { useRematch, type RematchPhase } from './useRematch';

export interface DuelOutcomeProps {
  duel: UseOnlineDuel;
  state: GameState;
}

const BANNER = {
  win: { title: 'You win!', tone: 'text-success', ring: 'border-success/40' },
  loss: { title: 'They got you.', tone: 'text-danger', ring: 'border-danger/40' },
  tie: { title: 'Dead heat.', tone: 'text-warn', ring: 'border-warn/40' },
  pending: { title: 'Waiting for opponent…', tone: 'text-muted', ring: 'border-border' },
  gone: { title: 'Your opponent left.', tone: 'text-muted', ring: 'border-border' },
  rematch: { title: 'Rematch!', tone: 'text-accent', ring: 'border-accent/40' },
} as const;

/** Once a rematch is agreed the per-game results are cleared, so the outcome would read "pending". */
const HANDSHAKE: ReadonlySet<RematchPhase> = new Set(['setup', 'waitingReady', 'ready', 'countdown', 'go']);

/** What the rematch button says (and the line under it) for each phase of the handshake. */
export function rematchCopy(phase: RematchPhase, them: string, countdown: number | null, isHost: boolean): { label: string; note: string | null } {
  switch (phase) {
    case 'countdown':
      return { label: `Starting rematch in ${countdown ?? 0}…`, note: 'Same songs, new order. Ears ready.' };
    case 'go':
      return { label: 'Go!', note: null };
    case 'offer':
      return { label: 'Accept rematch', note: `${them} wants a rematch!` };
    case 'pending':
      return { label: `Waiting for ${them} to accept…`, note: null };
    case 'setup':
      return { label: 'Setting up the rematch…', note: null };
    case 'waitingReady':
      return { label: `Waiting for ${them}…`, note: `${them} is loading the songs.` };
    case 'ready':
      return isHost ? { label: 'Starting…', note: null } : { label: 'Ready', note: `${them} is starting the rematch…` };
    default:
      return { label: 'Rematch', note: null };
  }
}

/** Online duel banner: outcome, both scores, rematch handshake. */
export function DuelOutcome({ duel, state }: DuelOutcomeProps) {
  const phase = useRematch(duel, true);
  const banner = BANNER[!duel.connected ? 'gone' : HANDSHAKE.has(phase) ? 'rematch' : duel.outcome];
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
  const theirName = them?.name ?? 'your opponent';
  const { label, note } = rematchCopy(phase, theirName, duel.countdown, duel.isHost);
  const busy = phase !== 'idle' && phase !== 'offer';

  return (
    <section
      className={cn('glass rounded-4xl border p-5', banner.ring)}
      aria-label="Duel result"
      data-testid="duel-outcome"
      data-rematch={phase}
      aria-live="polite"
    >
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
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant={phase === 'offer' ? 'glow' : 'primary'}
          onClick={phase === 'offer' ? duel.acceptRematch : duel.rematch}
          disabled={!duel.connected || busy}
          loading={phase === 'setup'}
          data-testid="rematch"
        >
          {label}
        </Button>
        <Button variant="ghost" onClick={duel.leave} to={R.songooner.duel}>
          Leave duel
        </Button>
      </div>
      {note && (
        <p className="mt-2 text-sm text-muted" data-testid="rematch-note">
          {note}
        </p>
      )}
    </section>
  );
}
