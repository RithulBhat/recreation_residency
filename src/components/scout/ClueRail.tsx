import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Calendar,
  CalendarClock,
  ChartColumn,
  ClipboardList,
  Crosshair,
  Film,
  Globe,
  GraduationCap,
  Hash,
  Landmark,
  Map,
  Palette,
  Ruler,
  Shield,
  Sparkles,
  Star,
  Swords,
  Trophy,
  Type,
} from 'lucide-react';
import { cn } from '@/components/ui';
import type { ScoutClue, ScoutClueKind } from '@/scout/types';

export interface ClueRailProps {
  /** Every clue unlocked so far (cumulative, newest last). */
  clues: readonly ScoutClue[];
  /** How many of the tail are brand new — those animate in. */
  newCount?: number;
  /** How many clues the ladder will eventually give, for the "n more" line. */
  total?: number;
  /** Stacked under the stage (mobile) or a column beside it (desktop). */
  layout?: 'row' | 'column';
  className?: string;
}

const ICON: Readonly<Record<ScoutClueKind, ReactNode>> = {
  position: <Crosshair />,
  team: <Shield />,
  conference: <Globe />,
  division: <Map />,
  jersey: <Hash />,
  experience: <CalendarClock />,
  draft: <ClipboardList />,
  college: <GraduationCap />,
  physical: <Ruler />,
  initials: <Type />,
  stat: <ChartColumn />,
  play: <Film />,
  fact: <Sparkles />,
  venue: <Landmark />,
  superBowls: <Trophy />,
  founded: <Calendar />,
  rival: <Swords />,
  legend: <Star />,
  colors: <Palette />,
};

/**
 * The clues you have earned, as labelled chips (`Position · Quarterback`). The newest one lands with
 * a spring and keeps an accent ring for as long as it is the newest, so a miss always has something
 * to show for itself.
 *
 * On a phone this sits under the stage; from `lg` up the play screen passes `layout="column"` and it
 * becomes a rail beside it.
 */
export function ClueRail({ clues, newCount = 0, total, layout = 'row', className }: ClueRailProps) {
  const reduce = useReducedMotion();
  const firstNew = Math.max(0, clues.length - Math.max(0, newCount));
  const remaining = typeof total === 'number' ? Math.max(0, total - clues.length) : 0;

  if (clues.length === 0 && remaining === 0) return null;

  const column = layout === 'column';

  return (
    <section
      className={cn('flex min-w-0 flex-col gap-2', className)}
      aria-labelledby="scout-clues-title"
      data-testid="scout-clue-rail"
    >
      <div className="flex items-baseline gap-2">
        <h2 id="scout-clues-title" className="eyebrow-readable">
          Clues
        </h2>
        <span className="font-mono text-[11px] text-muted tabular">
          {clues.length}
          {typeof total === 'number' ? `/${total}` : ''}
        </span>
      </div>
      <ul className={cn('flex min-w-0 gap-1.5 sm:gap-2', column ? 'flex-col' : 'flex-wrap')} data-testid="scout-clue-list">
        <AnimatePresence initial={false}>
          {clues.map((c, i) => {
            const fresh = i >= firstNew;
            return (
              <motion.li
                key={`${c.kind}:${c.label}:${c.value}`}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-1.5 transition-colors duration-300',
                  column ? 'w-full' : 'max-w-full',
                  fresh ? 'border-accent/45 bg-accent/12 shadow-glow' : 'border-border bg-surface',
                )}
                data-testid="scout-clue"
                data-fresh={fresh ? 'true' : 'false'}
              >
                <span className={cn('shrink-0 [&>svg]:size-3.5', fresh ? 'text-accent' : 'text-muted')} aria-hidden>
                  {ICON[c.kind]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    {c.label}
                  </span>
                  <span className={cn('block text-sm font-semibold leading-tight text-fg', column ? 'break-words' : 'truncate')}>
                    {c.value}
                  </span>
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {clues.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border px-3 py-2 text-xs text-muted">
            No clues yet — a miss buys the first one.
          </li>
        )}
      </ul>
      {remaining > 0 && clues.length > 0 && (
        <p className="font-mono text-[11px] text-muted">
          {remaining} more clue{remaining === 1 ? '' : 's'} left to earn
        </p>
      )}
    </section>
  );
}
