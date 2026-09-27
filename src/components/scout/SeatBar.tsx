import { Flame, Zap } from 'lucide-react';
import { Avatar, Kbd, NumberTicker, cn } from '@/components/ui';
import { isScoutBuzzerDuel } from '@/scout/formats';
import {
  activePlayer,
  awaitingBuzz,
  buzzKeyFor,
  canPlayerBuzz,
  currentRound,
  lockedOutPlayerIds,
  runPlayers,
} from '@/scout/selectors';
import type { ScoutPlayerState, ScoutState } from '@/scout/types';

export interface SeatBarProps {
  state: ScoutState;
  /** Duel buzzer only — ignored by every other format. */
  onBuzz?: (playerId: string) => void;
  className?: string;
}

function Seat({
  player,
  active,
  locked,
  won,
  buzzKey,
  canBuzz,
  onBuzz,
}: {
  player: ScoutPlayerState;
  active: boolean;
  locked: boolean;
  won: boolean;
  buzzKey?: string;
  canBuzz: boolean;
  onBuzz?: () => void;
}) {
  return (
    <li
      className={cn(
        'glass relative flex min-w-[9.5rem] flex-1 items-center gap-2.5 rounded-2xl p-2 pr-2.5 transition-[opacity,box-shadow,border-color] duration-300',
        active && 'glow border-accent/40',
        won && 'border-success/50',
        locked && 'opacity-45',
      )}
      style={active ? { borderColor: `color-mix(in oklab, ${player.color} 60%, var(--sg-border))` } : undefined}
      aria-current={active ? 'true' : undefined}
      data-testid="scout-seat"
      data-player={player.id}
      data-active={active ? 'true' : 'false'}
      data-locked={locked ? 'true' : 'false'}
    >
      <Avatar emoji={player.emoji} color={player.color} size="sm" name={player.name} active={active} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-fg">{player.name}</div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 overflow-hidden font-mono text-xs text-muted tabular">
          <NumberTicker value={player.score} animateOnMount={false} className="text-fg" />
          {player.streak >= 2 && (
            <span className="inline-flex items-center gap-0.5 text-warn">
              <Flame className="size-3 fill-current" aria-hidden />
              {player.streak}
            </span>
          )}
          {locked && <span className="shrink-0 whitespace-nowrap text-danger">locked out</span>}
        </div>
      </div>
      {buzzKey !== undefined && (
        <button
          type="button"
          onClick={onBuzz}
          disabled={!canBuzz}
          aria-label={`${player.name} buzz in (key ${buzzKey.toUpperCase()})`}
          data-testid="scout-buzz"
          data-player={player.id}
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-2xl border font-display text-lg font-black transition-[transform,background-color,box-shadow] active:scale-95 disabled:cursor-not-allowed',
            active
              ? 'border-transparent bg-gradient-accent text-accent-fg shadow-glow'
              : canBuzz
                ? 'border-border-strong bg-surface-strong text-fg hover:shadow-glow'
                : 'border-border bg-surface text-muted opacity-60',
          )}
          style={
            canBuzz && !active
              ? { boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${player.color} 55%, transparent)` }
              : undefined
          }
        >
          {active ? <Zap className="size-5 fill-current" aria-hidden /> : buzzKey.toUpperCase()}
        </button>
      )}
    </li>
  );
}

/**
 * The seats: scores, whose turn it is, who is locked out, and the buzzers.
 *
 * A buzzer duel is the interesting one — nobody may answer until somebody claims the round, a wrong
 * claim locks that seat out of it, and both keys are on screen as `Kbd` so nobody has to be told what
 * A and L do. A party (or a duel on turns) has no buzzers: the line above the seats names the player
 * whose turn it is instead.
 */
export function SeatBar({ state, onBuzz, className }: SeatBarProps) {
  const players = runPlayers(state);
  if (players.length === 0) return null;
  const round = currentRound(state);
  const buzzer = isScoutBuzzerDuel(state.settings);
  const locked = lockedOutPlayerIds(state);
  const open = awaitingBuzz(state);
  const active = activePlayer(state);
  const live = state.status === 'playing' && round?.status === 'playing';

  return (
    <section
      className={cn('flex min-w-0 flex-col gap-2', className)}
      aria-label="Players"
      data-testid="scout-seats"
      data-format={state.settings.format ?? 'standard'}
    >
      {buzzer ? (
        <p className="text-center font-mono text-[11px] uppercase tracking-widest text-muted" aria-live="polite">
          {open ? (
            <>
              Buzz in: <Kbd size="sm">A</Kbd> or <Kbd size="sm">L</Kbd>
            </>
          ) : round?.activePlayerId !== undefined ? (
            <span className="text-fg" data-testid="scout-seat-prompt">
              {active?.name ?? 'Someone'} is guessing…
            </span>
          ) : (
            'Round over'
          )}
        </p>
      ) : (
        active && (
          <p
            className="text-center font-display text-base font-bold text-fg"
            aria-live="polite"
            data-testid="scout-seat-prompt"
          >
            {active.name}&apos;s turn <span aria-hidden>{active.emoji}</span>
          </p>
        )
      )}
      {/* Two seats split the row; a party wraps into as many rows as it needs, each seat never
          narrower than its avatar, name and score. */}
      <ul className="flex min-w-0 flex-wrap gap-2">
        {players.map((p) => {
          const isLocked = locked.includes(p.id);
          const isActive = buzzer ? round?.activePlayerId === p.id : active?.id === p.id;
          return (
            <Seat
              key={p.id}
              player={p}
              active={Boolean(isActive) && (live || state.status === 'round-over')}
              locked={isLocked}
              won={round?.winnerPlayerId === p.id}
              buzzKey={buzzer ? buzzKeyFor(state, p.id) : undefined}
              canBuzz={buzzer && Boolean(live) && canPlayerBuzz(state, p.id)}
              onBuzz={onBuzz ? () => onBuzz(p.id) : undefined}
            />
          );
        })}
      </ul>
    </section>
  );
}
