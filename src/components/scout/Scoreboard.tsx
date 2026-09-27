import { Crown, Handshake } from 'lucide-react';
import { Avatar, Badge, cn } from '@/components/ui';
import { isTie, standings } from '@/scout/selectors';
import type { ScoutState } from '@/scout/types';

export interface ScoreboardProps {
  state: ScoutState;
  className?: string;
}

/**
 * The final table for a duel or a party: who won, by how much, and what everyone else did.
 *
 * `standings` already applies the tie-break the engine uses (score, then calls made, then seat order),
 * so this only paints — and a genuine tie on score is called a tie rather than quietly handing the
 * trophy to whoever sat down first.
 */
export function Scoreboard({ state, className }: ScoreboardProps) {
  const board = standings(state);
  if (board.length === 0) return null;
  const tied = isTie(state);
  const top = board[0];

  return (
    <section
      className={cn('glass flex flex-col gap-3 rounded-4xl p-4 sm:p-5', className)}
      aria-label="Final standings"
      data-testid="scout-scoreboard"
    >
      <header className="flex min-w-0 items-center gap-2.5">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-accent-fg shadow-glow [&>svg]:size-5"
          aria-hidden
        >
          {tied ? <Handshake /> : <Crown />}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-fg" data-testid="scout-scoreboard-title">
            {tied ? 'Dead level' : `${top.name} takes it`}
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {board.length} {board.length === 2 ? 'seats · head to head' : 'seats · pass and play'}
          </p>
        </div>
      </header>

      <ol className="flex flex-col gap-2">
        {board.map((p, i) => {
          const winner = !tied && i === 0;
          const level = tied && p.score === top.score;
          return (
            <li
              key={p.id}
              data-testid="scout-scoreboard-row"
              data-player={p.id}
              data-rank={i + 1}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border p-2.5',
                winner || level ? 'border-success/50 bg-success/10' : 'border-border bg-surface',
              )}
            >
              <span
                className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-bg-elevated font-mono text-xs font-bold text-muted tabular"
                aria-hidden
              >
                {i + 1}
              </span>
              <Avatar emoji={p.emoji} color={p.color} size="sm" name={p.name} active={winner} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-bold text-fg">{p.name}</span>
                  {winner && (
                    <Badge tone="success" size="sm">
                      Winner
                    </Badge>
                  )}
                </div>
                <div className="font-mono text-[11px] text-muted tabular">
                  {p.correct} right · best streak {p.bestStreak}
                </div>
              </div>
              <span className="shrink-0 font-display text-xl font-black text-fg tabular">
                {p.score.toLocaleString('en-US')}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
