import { useEffect, useId, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { LoaderCircle, Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from './ui/cn';

export type VinylState = 'idle' | 'loading' | 'playing' | 'done';

export interface VinylProps {
  state: VinylState;
  /** 0..1 progress through the clip (drawn as a ring) */
  progress?: number;
  /** px number or any CSS size (e.g. 'min(72vw, 320px)'). Default 260. */
  size?: number | string;
  onClick?: () => void;
  disabled?: boolean;
  /** e.g. "0.1s" — shown in a pill under the record */
  clipLabel?: string;
  /** Album cover shown in the center label (blurred via `blur`) */
  coverUrl?: string;
  /** 0..1, how blurred the cover is. Default 1 (fully hidden). */
  blur?: number;
  className?: string;
  'aria-label'?: string;
  /** Hide the center icon chip */
  hideIcon?: boolean;
  /** A breathing halo that says "press me" — shown while idle, callers turn it off after the first play. */
  nudge?: boolean;
  /** Decoration layered over the record (tonearm, stamps). Positioned against the record's box. */
  overlay?: ReactNode;
}

const icons: Record<VinylState, React.ReactNode> = {
  idle: <Play className="size-[52%] translate-x-[6%] fill-current" />,
  loading: <LoaderCircle className="size-[52%] animate-spin" />,
  playing: <Pause className="size-[48%] fill-current" />,
  done: <RotateCcw className="size-[48%]" />,
};

const labels: Record<VinylState, string> = {
  idle: 'Play clip',
  loading: 'Loading clip',
  playing: 'Playing clip',
  done: 'Replay clip',
};

export function Vinyl({
  state,
  progress = 0,
  size = 260,
  onClick,
  disabled,
  clipLabel,
  coverUrl,
  blur = 1,
  className,
  'aria-label': ariaLabel,
  hideIcon,
  nudge = false,
  overlay,
}: VinylProps) {
  const reduce = useReducedMotion();
  const playing = state === 'playing';
  const p = Math.max(0, Math.min(1, progress));
  const R = 47;
  const C = 2 * Math.PI * R;
  const b = Math.max(0, Math.min(1, blur));
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => setCoverFailed(false), [coverUrl]);
  // Per-instance gradient id: several records can be on one page (hero, gallery, results).
  const ringId = `sg-vinyl-ring-${useId().replace(/\W/g, '')}`;
  const nudging = nudge && state === 'idle' && !disabled;

  return (
    <div
      className={cn('relative inline-block select-none', className)}
      style={{ width: size, height: size, containerType: 'inline-size' }}
      data-nudge={nudging ? '' : undefined}
    >
      {/* Halo */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-[10%] rounded-full bg-gradient-accent blur-2xl transition-opacity duration-700',
          playing ? 'opacity-60 animate-pulse-soft' : state === 'done' ? 'opacity-30' : 'opacity-15',
        )}
      />

      {/* "Press me" ring — breathes outward from the rim until the first tap. */}
      {nudging && !reduce && (
        <span aria-hidden className="record-nudge pointer-events-none absolute inset-[7%] rounded-full border-2 border-accent-2/70" />
      )}

      {/* Progress ring */}
      <svg
        viewBox="0 0 100 100"
        className={cn('absolute inset-0 -rotate-90', state === 'loading' && !reduce && 'animate-spin')}
        style={{ animationDuration: state === 'loading' ? '1.1s' : undefined }}
        aria-hidden
      >
        <defs>
          <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--sg-accent)" />
            <stop offset="0.55" stopColor="var(--sg-accent-2)" />
            <stop offset="1" stopColor="var(--sg-accent-3)" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-fg/12" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={`url(#${ringId})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={state === 'loading' ? `${C * 0.22} ${C}` : C}
          strokeDashoffset={state === 'loading' ? 0 : C * (1 - (state === 'done' ? 1 : p))}
          style={{ transition: playing ? 'stroke-dashoffset 80ms linear' : 'stroke-dashoffset 300ms ease-out' }}
        />
      </svg>

      {/* The record */}
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled || state === 'loading'}
        aria-label={ariaLabel ?? `${labels[state]}${clipLabel ? ` (${clipLabel})` : ''}`}
        aria-pressed={playing}
        whileHover={reduce || disabled ? undefined : { scale: 1.03 }}
        whileTap={reduce || disabled ? undefined : { scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className="absolute inset-[7%] rounded-full outline-none focus-visible:ring-4 focus-visible:ring-accent-2/60 disabled:cursor-default"
      >
        <div className="vinyl-disc vinyl-spin absolute inset-0" data-playing={playing}>
          {/* center label */}
          <div className="absolute inset-[31%] overflow-hidden rounded-full shadow-[0_0_0_2px_rgb(0_0_0/0.45)]">
            {coverUrl && !coverFailed ? (
              <img
                src={coverUrl}
                alt=""
                draggable={false}
                onError={() => setCoverFailed(true)}
                className="size-full object-cover transition-[filter,transform] duration-500"
                style={{ filter: `blur(${b * 14}px) saturate(${1 + b * 0.5})`, transform: `scale(${1 + b * 0.25})` }}
              />
            ) : (
              <div className="size-full bg-gradient-accent" />
            )}
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/0.28),transparent_55%)]" />
          </div>
          <div className="absolute inset-[47.5%] rounded-full bg-[var(--sg-vinyl)] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.15)]" />
        </div>
        <div className="vinyl-gloss" />
        {/* The hub is the button: an accent-gradient disc with a glow, legible over any cover in any theme. */}
        {!hideIcon && (
          <span
            className={cn(
              'absolute left-1/2 top-1/2 grid aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-accent text-accent-fg shadow-glow transition-[transform,filter,box-shadow] duration-200',
              playing ? 'brightness-95' : 'shadow-glow-lg',
            )}
            aria-hidden
          >
            {icons[state]}
          </span>
        )}
      </motion.button>

      {overlay}

      {clipLabel && (
        <span
          className="glass-strong absolute bottom-[-2%] left-1/2 -translate-x-1/2 rounded-full px-[4cqi] py-[1.6cqi] font-mono text-[clamp(0.7rem,5.5cqi,1.05rem)] font-semibold tabular leading-none text-fg"
          aria-hidden
        >
          {clipLabel}
        </span>
      )}
    </div>
  );
}
