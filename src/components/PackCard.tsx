import { motion, useReducedMotion } from 'motion/react';
import { Check, Play } from 'lucide-react';
import type { Pack, PackCategory } from '@/types';
import { cn } from './ui/cn';

export const PACK_CATEGORY_LABEL: Record<PackCategory, string> = {
  genre: 'Genre',
  decade: 'Decade',
  region: 'Region',
  artist: 'Artist',
  vibe: 'Vibe',
  soundtrack: 'Soundtrack',
  chart: 'Chart',
  custom: 'Custom',
};

export interface PackCardProps {
  pack: Pack;
  selected?: boolean;
  onToggle?: (id: string) => void;
  /** Shows a quick-play button */
  onPlay?: (id: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  /** Fixed width for horizontal strips */
  style?: React.CSSProperties;
}

export function formatPackSize(n?: number): string {
  if (!n) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k songs`;
  return `~${Math.round(n / 10) * 10} songs`;
}

export function PackCard({ pack, selected = false, onToggle, onPlay, size = 'md', className, style }: PackCardProps) {
  const reduce = useReducedMotion();
  const accent = pack.accent || 'var(--sg-accent)';
  const sm = size === 'sm';

  return (
    <motion.div
      whileHover={reduce ? undefined : { y: -4 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      className={cn(
        'group relative isolate flex flex-col overflow-hidden rounded-3xl border text-left transition-[box-shadow,border-color] duration-200',
        sm ? 'min-h-36 p-3.5' : 'min-h-44 p-4',
        selected
          ? 'border-transparent ring-2 ring-accent shadow-glow'
          : 'border-border hover:border-border-strong hover:shadow-[0_20px_50px_-24px_rgb(0_0_0/0.6)]',
        className,
      )}
      style={{
        ['--pack-accent' as string]: accent,
        background: `linear-gradient(150deg, color-mix(in oklab, ${accent} ${selected ? 48 : 34}%, var(--sg-bg-elevated)) 0%, color-mix(in oklab, ${accent} 10%, var(--sg-bg-elevated)) 70%)`,
        ...style,
      }}
    >
      {/* full-card toggle */}
      {onToggle && (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${selected ? 'Remove' : 'Add'} ${pack.name}`}
          onClick={() => onToggle(pack.id)}
          className="absolute inset-0 z-0 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-2"
        />
      )}

      {/* decorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full opacity-60 blur-2xl transition-opacity group-hover:opacity-90"
        style={{ background: accent }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 noise rounded-3xl" />

      <div className="pointer-events-none relative z-[1] flex items-start justify-between gap-2">
        <span
          className={cn(
            'grid place-items-center rounded-2xl bg-black/25 leading-none shadow-inner backdrop-blur-sm',
            sm ? 'size-10 text-2xl' : 'size-12 text-3xl',
          )}
          aria-hidden
        >
          {pack.emoji}
        </span>
        <div className="flex items-center gap-1.5">
          {pack.featured && !selected && (
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/85">Featured</span>
          )}
          <span
            className={cn(
              'grid size-7 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-200',
              selected ? 'scale-100 border-transparent bg-accent text-accent-fg' : 'scale-90 border-white/25 bg-black/20 text-transparent group-hover:border-white/50',
            )}
            aria-hidden
          >
            <Check className="size-4" strokeWidth={3} />
          </span>
        </div>
      </div>

      <div className="pointer-events-none relative z-[1] mt-auto pt-3">
        <h3 className={cn('font-display font-bold leading-tight text-fg', sm ? 'text-sm' : 'text-base')}>{pack.name}</h3>
        <p className={cn('mt-0.5 line-clamp-2 text-muted', sm ? 'text-[11px]' : 'text-xs')}>{pack.tagline}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {pack.approxSize ? (
            <span className="rounded-full bg-black/25 px-2 py-0.5 font-mono text-[10px] font-semibold tabular text-white/90">{formatPackSize(pack.approxSize)}</span>
          ) : null}
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg/70">
            {PACK_CATEGORY_LABEL[pack.category]}
          </span>
        </div>
      </div>

      {onPlay && (
        <button
          type="button"
          aria-label={`Play ${pack.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onPlay(pack.id);
          }}
          className={cn(
            'absolute bottom-3 right-3 z-[2] grid size-10 place-items-center rounded-full bg-gradient-accent text-accent-fg shadow-glow transition-[opacity,transform] duration-200 active:scale-90',
            'md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:focus-visible:translate-y-0 md:focus-visible:opacity-100',
          )}
        >
          <Play className="size-4 translate-x-px fill-current" />
        </button>
      )}
    </motion.div>
  );
}
