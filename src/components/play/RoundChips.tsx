import { Flame, Lightbulb } from 'lucide-react';
import type { GameState } from '@/types';
import { cn } from '@/components/ui';
import { getPack } from '@/lib/catalog';
import { maxHints } from '@/game/hints';
import { isMultiplayer } from '@/game/presets';
import { activePlayer, currentRound, wonRounds } from '@/game/selectors';

export interface PackSummary {
  emoji: string;
  name: string;
  /** How many more packs are in the mix. */
  extra: number;
}

/** The first pack of the game, plus how many more are mixed in; null when none resolves. */
export function packSummary(state: GameState): PackSummary | null {
  const packs = state.settings.packIds.map((id) => getPack(id)).filter((p): p is NonNullable<typeof p> => p !== undefined);
  const first = packs[0];
  if (!first) return null;
  return { emoji: first.emoji, name: first.name, extra: packs.length - 1 };
}

/** The running streak that matters on screen: the active player's in multiplayer, the game's otherwise. */
export function currentStreak(state: GameState): number {
  return isMultiplayer(state.settings) ? (activePlayer(state)?.streak ?? 0) : state.streak;
}

const chip = 'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 font-mono text-xs text-muted tabular';

/**
 * Small persistent chips for the slot the verdict pill uses on phones — pack, streak and hint budget
 * — so the space is never a hole and nothing jumps when a verdict lands.
 */
export function RoundChips({ state, className }: { state: GameState; className?: string }) {
  const round = currentRound(state);
  const pack = packSummary(state);
  const streak = currentStreak(state);
  const blitz = state.settings.mode === 'blitz';
  const hintBudget = maxHints(state.settings);
  const hintsOffer = round && hintBudget > 0 ? Math.max(0, hintBudget - round.hintsUsed.length) : 0;

  return (
    <div className={cn('flex w-full min-w-0 flex-wrap items-center gap-1.5', className)} data-testid="round-chips">
      {pack && (
        <span className={cn(chip, 'max-w-[55%] text-fg')} title={pack.extra > 0 ? `${pack.name} +${pack.extra} more` : pack.name}>
          <span aria-hidden>{pack.emoji}</span>
          <span className="truncate">{pack.name}</span>
          {pack.extra > 0 && <span className="text-muted">+{pack.extra}</span>}
        </span>
      )}
      {blitz ? (
        <span className={chip}>
          <span className="text-fg">{wonRounds(state)}</span> songs
        </span>
      ) : (
        <span className={cn(chip, streak >= 2 && 'border-warn/40 bg-warn/15 text-warn')} aria-label={`${streak} in a row`}>
          <Flame className={cn('size-3.5', streak >= 2 && 'fill-current')} aria-hidden />
          {streak}
        </span>
      )}
      {hintBudget > 0 && (
        <span className={chip} aria-label={`${hintsOffer} ${hintsOffer === 1 ? 'hint' : 'hints'} left`}>
          <Lightbulb className="size-3.5" aria-hidden />
          {hintsOffer}
        </span>
      )}
    </div>
  );
}
