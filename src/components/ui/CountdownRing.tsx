import { useId, type ReactNode } from 'react';
import { cn } from './cn';

export interface CountdownRingProps {
  /** Remaining fraction 0..1 */
  progress: number;
  size?: number;
  stroke?: number;
  /** 'gradient' (default) or CSS color */
  color?: string;
  /** Below this fraction the ring turns danger + pulses. Default 0.25; 0 disables. */
  warnBelow?: number;
  /** Smooth stroke transition (turn off for 60fps rAF updates) */
  smooth?: boolean;
  /** Center content (e.g. seconds) */
  children?: ReactNode;
  label?: string;
  className?: string;
  trackOpacity?: number;
}

export function CountdownRing({
  progress,
  size = 72,
  stroke = 6,
  color = 'gradient',
  warnBelow = 0.25,
  smooth = true,
  children,
  label,
  className,
  trackOpacity = 0.15,
}: CountdownRingProps) {
  const id = useId();
  const p = Math.max(0, Math.min(1, progress));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const warn = warnBelow > 0 && p <= warnBelow && p > 0;
  const strokeColor = warn ? 'var(--sg-danger)' : color === 'gradient' ? `url(#${id}-g)` : color;

  return (
    <div
      className={cn('relative inline-grid place-items-center', warn && 'animate-pulse-soft', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`${id}-g`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--sg-accent)" />
            <stop offset="55%" stopColor="var(--sg-accent-2)" />
            <stop offset="100%" stopColor="var(--sg-accent-3)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} style={{ opacity: trackOpacity }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: smooth ? 'stroke-dashoffset 0.25s linear, stroke 0.3s' : undefined }}
        />
      </svg>
      <div className={cn('relative font-mono font-semibold tabular text-fg', warn && 'text-danger')}>{children}</div>
    </div>
  );
}
