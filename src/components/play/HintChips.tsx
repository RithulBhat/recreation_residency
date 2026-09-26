import { forwardRef } from 'react';
import { Lightbulb } from 'lucide-react';
import type { GameSettings, HintKind, Round } from '@/types';
import { Chip, cn } from '@/components/ui';
import { HINT_LABELS, availableHints, hintText, maxHints } from '@/game/hints';

export interface HintChipsProps {
  settings: GameSettings;
  round: Round;
  onHint: (kind: HintKind) => void;
  disabled?: boolean;
  className?: string;
}

/** Used hints as revealed text, still-available hints as chips with their 15 % cost. */
export const HintChips = forwardRef<HTMLButtonElement, HintChipsProps>(function HintChips(
  { settings, round, onHint, disabled, className },
  firstChipRef,
) {
  if (!settings.hintsEnabled || maxHints(settings) === 0) return null;
  const available = round.status === 'playing' ? availableHints(settings, round) : [];
  const used = round.hintsUsed;
  if (available.length === 0 && used.length === 0) return null;
  const left = Math.max(0, maxHints(settings) - used.length);

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="hints">
      {used.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Hints revealed">
          {used.map((kind) => (
            <li
              key={kind}
              className="inline-flex items-center gap-1.5 rounded-xl border border-warn/30 bg-warn/10 px-2.5 py-1 text-xs font-medium text-fg"
            >
              <Lightbulb className="size-3.5 text-warn" aria-hidden />
              {hintText(kind, round.track)}
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Hints, ${left} left, each costs 15 percent`}>
          {available.map((kind, i) => (
            <Chip
              key={kind}
              ref={i === 0 ? firstChipRef : undefined}
              size="sm"
              icon={<Lightbulb />}
              disabled={disabled}
              onClick={() => onHint(kind)}
              aria-label={`${HINT_LABELS[kind]} hint, costs 15 percent`}
            >
              {HINT_LABELS[kind]} <span className="text-muted">−15%</span>
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
});
