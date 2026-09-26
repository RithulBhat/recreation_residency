import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { readOpenState, writeOpenState } from './sectionState';

export interface SetupSectionProps {
  /** Stable id — used for the remembered open state and e2e hooks. */
  id: string;
  icon: ReactNode;
  title: string;
  /** Short live summary shown in the header (visible when collapsed). */
  summary?: ReactNode;
  /** Initial state on first visit. Default true. */
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/** A collapsible glass card. Open/closed state is remembered per section. */
export function SetupSection({ id, icon, title, summary, defaultOpen = true, children, className }: SetupSectionProps) {
  const reduce = useReducedMotion();
  const panelId = useId();
  // `manual` is the remembered choice; until the player toggles, the section follows `defaultOpen`
  // (which can change after mount, e.g. when `?mode=party` opens the players section).
  const [manual, setManual] = useState<boolean | undefined>(() => readOpenState()[id]);
  const open = manual ?? defaultOpen;
  const [animating, setAnimating] = useState(false);

  const toggle = () => {
    const next = !open;
    setManual(next);
    writeOpenState(id, next);
  };

  return (
    <Card padding="none" className={cn('overflow-visible', className)} data-section={id}>
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-3xl px-4 py-3.5 text-left transition-colors hover:bg-surface sm:px-5"
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-accent text-accent-fg shadow-glow [&>svg]:size-4"
            aria-hidden
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold leading-tight text-fg">{title}</span>
            {summary && (
              <span className={cn('mt-0.5 block truncate font-mono text-[11px] tabular text-muted transition-opacity', open && 'opacity-70')}>
                {summary}
              </span>
            )}
          </span>
          <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            id={panelId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onAnimationStart={() => setAnimating(true)}
            onAnimationComplete={() => setAnimating(false)}
            className={cn(animating && 'overflow-hidden')}
          >
            <div className="flex flex-col gap-5 px-4 pb-5 pt-1 sm:px-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
