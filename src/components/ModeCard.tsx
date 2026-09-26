import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { cn } from './ui/cn';

export interface ModeCardProps {
  icon: ReactNode;
  name: string;
  blurb: string;
  /** e.g. "Escalating clips · 6 tries" */
  howItPlays?: string;
  to: string;
  /** Hex accent for the card tint */
  accent?: string;
  badge?: string;
  disabled?: boolean;
  className?: string;
  size?: 'md' | 'lg';
}

export function ModeCard({ icon, name, blurb, howItPlays, to, accent, badge, disabled, className, size = 'md' }: ModeCardProps) {
  const reduce = useReducedMotion();
  const a = accent ?? 'var(--sg-accent)';
  return (
    <motion.div
      whileHover={reduce || disabled ? undefined : { y: -4 }}
      whileTap={reduce || disabled ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      className={cn('h-full', className)}
    >
      <Link
        to={to}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        className={cn(
          'group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border p-3.5 transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-glow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2',
          size === 'lg' ? 'min-h-44 sm:p-6' : 'min-h-36 sm:min-h-40 sm:p-5',
          disabled && 'pointer-events-none opacity-60',
        )}
        style={{
          background: `linear-gradient(160deg, color-mix(in oklab, ${a} 26%, var(--sg-bg-elevated)) 0%, color-mix(in oklab, ${a} 6%, var(--sg-bg-elevated)) 65%)`,
        }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full opacity-50 blur-3xl transition-opacity group-hover:opacity-80" style={{ background: a }} />
        <div className="relative flex items-start justify-between gap-3">
          <span
            className="grid size-9 place-items-center rounded-xl text-white shadow-lg [&>svg]:size-4 sm:size-11 sm:rounded-2xl sm:[&>svg]:size-5"
            style={{ background: `linear-gradient(135deg, ${a}, color-mix(in oklab, ${a} 60%, var(--sg-accent-2)))` }}
            aria-hidden
          >
            {icon}
          </span>
          {badge && (
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90">{badge}</span>
          )}
        </div>
        <div className="relative mt-auto pt-4">
          <h3 className={cn('font-display font-bold leading-tight text-fg', size === 'lg' ? 'text-lg' : 'text-sm sm:text-base')}>{name}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-muted sm:text-sm">{blurb}</p>
          {howItPlays && (
            <p className="mt-2 flex items-center gap-1 font-mono text-[10px] font-medium tabular text-fg/70 sm:text-[11px]">
              {howItPlays}
              <ArrowRight className="ml-auto size-4 text-fg/50 transition-transform group-hover:translate-x-1" aria-hidden />
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
