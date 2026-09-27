import { motion, useReducedMotion } from 'motion/react';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { cn } from '@/components/ui/cn';
import { formatCompact, formatValue } from '@/arcade/units';
import type { ContentItem } from '@/arcade/types';

export interface HiloCardProps {
  item: ContentItem;
  /** What the value means, shown under the number ("people", "draft pick"). */
  measure: string;
  /** Hide the number until the reveal. */
  hidden?: boolean;
  /** Animate the number counting up. */
  revealing?: boolean;
  /** Round the figure rather than showing it exactly. */
  rounded?: boolean;
  className?: string;
}

/**
 * One side of the comparison.
 *
 * The value is rendered with the SAME formatter whether it is the known side or the revealed
 * side. Formatting one differently would be a tell — the mistake the price generator made with
 * distractors, one level up.
 */
export function HiloCard({
  item,
  measure,
  hidden = false,
  revealing = false,
  rounded = false,
  className,
}: HiloCardProps) {
  const reduced = useReducedMotion();

  /**
   * Big numbers are shown compactly whatever the setting says.
   *
   * A GDP written out in full is "$279,641,257,615" — fifteen characters that overflow the card
   * at 375px and clip at both edges, and that nobody reads as a quantity anyway. The `exact`
   * setting still does its job on everything human-scale (weights, draft picks, chart positions);
   * past a million, compact IS the readable form, not a degraded one.
   */
  const format = (v: number) =>
    !rounded && Math.abs(v) < 1_000_000 ? formatValue(v, item.unit) : formatCompact(v, item.unit);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-3xl border border-border bg-surface px-4 py-6 text-center',
        className,
      )}
    >
      <span className="text-4xl leading-none sm:text-5xl" aria-hidden>
        {item.emoji ?? '❓'}
      </span>
      <p className="line-clamp-2 font-display text-base font-bold leading-tight text-fg sm:text-lg">
        {item.name}
      </p>
      {item.blurb && <p className="line-clamp-1 text-xs text-muted">{item.blurb}</p>}

      <div className="flex min-h-14 flex-col items-center justify-center">
        {hidden ? (
          <motion.span
            className="font-display text-4xl font-bold text-muted"
            aria-label="Value hidden"
            animate={reduced ? undefined : { opacity: [0.35, 0.7, 0.35] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          >
            ?
          </motion.span>
        ) : revealing ? (
          <NumberTicker
            value={item.value}
            format={format}
            className="max-w-full break-words font-display text-3xl font-bold text-accent sm:text-4xl"
          />
        ) : (
          <span className="max-w-full break-words font-display text-3xl font-bold text-fg sm:text-4xl">
            {format(item.value)}
          </span>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          {measure}
        </span>
      </div>
    </div>
  );
}
