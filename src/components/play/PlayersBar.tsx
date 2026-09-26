import { Flame, Zap } from 'lucide-react';
import type { GameState, PlayerState } from '@/types';
import { Avatar, Kbd, NumberTicker, cn } from '@/components/ui';
import { isBuzzerDuel } from '@/game/presets';
import { activePlayer, currentRound } from '@/game/selectors';

export interface PlayersBarProps {
  state: GameState;
  onBuzz: (playerId: string) => void;
}

export const BUZZ_KEYS = ['A', 'L'] as const;

function PlayerCard({
  player,
  active,
  locked,
  buzzKey,
  canBuzz,
  onBuzz,
}: {
  player: PlayerState;
  active: boolean;
  locked: boolean;
  buzzKey?: string;
  canBuzz: boolean;
  onBuzz?: () => void;
}) {
  return (
    <li
      className={cn(
        'glass relative flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl p-2 pr-3 transition-[opacity,box-shadow,border-color] duration-300',
        active && 'glow border-accent/40',
        locked && 'opacity-45',
      )}
      style={active ? { borderColor: `color-mix(in oklab, ${player.color} 60%, var(--sg-border))` } : undefined}
      aria-current={active ? 'true' : undefined}
      data-testid={`player-${player.id}`}
    >
      <Avatar emoji={player.emoji} color={player.color} size="sm" name={player.name} active={active} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-fg">{player.name}</div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted tabular">
          <NumberTicker value={player.score} animateOnMount={false} className="text-fg" />
          {player.streak >= 2 && (
            <span className="inline-flex items-center gap-0.5 text-warn">
              <Flame className="size-3 fill-current" aria-hidden />
              {player.streak}
            </span>
          )}
          {locked && <span className="text-danger">locked out</span>}
        </div>
      </div>
      {buzzKey && (
        <button
          type="button"
          onClick={onBuzz}
          disabled={!canBuzz}
          aria-label={`${player.name} buzz in (key ${buzzKey})`}
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-2xl border font-display text-lg font-black transition-[transform,background-color,box-shadow] active:scale-95 disabled:cursor-not-allowed',
            active
              ? 'border-transparent bg-gradient-accent text-accent-fg shadow-glow'
              : canBuzz
                ? 'border-border-strong bg-surface-strong text-fg hover:shadow-glow'
                : 'border-border bg-surface text-muted opacity-60',
          )}
          style={canBuzz && !active ? { boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${player.color} 55%, transparent)` } : undefined}
        >
          {active ? <Zap className="size-5 fill-current" aria-hidden /> : buzzKey}
        </button>
      )}
    </li>
  );
}

/** Scoreboard for local duels / party: avatars, scores, buzzers (A / L) or whose turn it is. */
export function PlayersBar({ state, onBuzz }: PlayersBarProps) {
  const round = currentRound(state);
  const buzzer = isBuzzerDuel(state.settings);
  const live = state.status === 'playing' && round?.status === 'playing';
  const active = activePlayer(state);
  const nobodyBuzzed = buzzer && live && !round?.activePlayerId;

  return (
    <section aria-label="Players" className="flex flex-col gap-2" data-testid="players-bar">
      {!buzzer && active && (
        <p className="text-center font-display text-base font-bold text-fg" aria-live="polite">
          {active.name}&apos;s turn <span aria-hidden>{active.emoji}</span>
        </p>
      )}
      {buzzer && (
        <p className="text-center font-mono text-[11px] uppercase tracking-widest text-muted" aria-live="polite">
          {nobodyBuzzed ? (
            <>
              Buzz in: <Kbd size="sm">A</Kbd> or <Kbd size="sm">L</Kbd>
            </>
          ) : round?.activePlayerId ? (
            `${active?.name ?? 'Someone'} is guessing…`
          ) : (
            'Round over'
          )}
        </p>
      )}
      <ul className="flex gap-2">
        {state.players.map((p, i) => {
          const locked = !!round?.lockedOutPlayerIds.includes(p.id);
          const isActive = buzzer ? round?.activePlayerId === p.id : active?.id === p.id;
          return (
            <PlayerCard
              key={p.id}
              player={p}
              active={!!isActive && (live || state.status === 'round-over')}
              locked={locked}
              buzzKey={buzzer ? BUZZ_KEYS[i] : undefined}
              canBuzz={buzzer && live && !locked && !round?.activePlayerId}
              onBuzz={() => onBuzz(p.id)}
            />
          );
        })}
      </ul>
    </section>
  );
}
