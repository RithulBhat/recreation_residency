import { Check, Loader, UserPlus } from 'lucide-react';
import type { PlayerConfig } from '@/types';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { cn } from '../ui/cn';

export interface PlayerSlotProps {
  player: PlayerConfig | null;
  /** 'Host' / 'Challenger' — who this seat belongs to. */
  role: string;
  /** Marks the seat as mine. */
  you?: boolean;
  /** Shows a "Ready" tick. */
  ready?: boolean;
  /** Copy for the empty seat. */
  emptyLabel?: string;
  className?: string;
}

/** One seat in the room: a player, or the empty chair we are waiting on. */
export function PlayerSlot({ player, role, you, ready, emptyLabel = 'Waiting for a challenger', className }: PlayerSlotProps) {
  if (!player) {
    return (
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col items-center gap-2 rounded-3xl border border-dashed border-border-strong p-4 text-center',
          className,
        )}
      >
        <span className="grid size-14 place-items-center rounded-full bg-surface text-muted">
          <UserPlus className="size-6" aria-hidden />
        </span>
        <div className="w-full min-w-0">
          <div className="text-balance text-sm font-semibold leading-snug text-muted">{emptyLabel}</div>
          <div className="mt-0.5 truncate text-[11px] uppercase tracking-widest text-muted/70">{role}</div>
        </div>
        <Loader className="size-3.5 animate-spin-slow text-muted" aria-hidden />
      </div>
    );
  }

  return (
    <div
      className={cn('glass flex min-w-0 flex-1 flex-col items-center gap-2 rounded-3xl p-4 text-center', className)}
      style={{ borderColor: `color-mix(in oklab, ${player.color} 40%, var(--sg-border))` }}
      data-testid={you ? 'duel-me' : 'duel-opponent'}
    >
      <Avatar emoji={player.emoji} color={player.color} size="lg" name={player.name} />
      <div className="w-full min-w-0">
        <div className="truncate font-display text-base font-bold text-fg">{player.name}</div>
        <div className="mt-0.5 truncate text-[11px] uppercase tracking-widest text-muted">
          {you ? `You · ${role}` : role}
        </div>
      </div>
      {ready ? (
        <Badge tone="success" icon={<Check />}>
          Ready
        </Badge>
      ) : (
        <Badge tone="neutral">In the room</Badge>
      )}
    </div>
  );
}
