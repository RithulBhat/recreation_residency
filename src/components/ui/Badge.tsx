import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warn' | 'gradient';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends ComponentPropsWithRef<'span'> {
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: ReactNode;
  /** Little pulsing dot */
  dot?: boolean;
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-strong text-fg border border-border',
  accent: 'bg-accent/15 text-accent border border-accent/30',
  success: 'bg-success/15 text-success border border-success/30',
  danger: 'bg-danger/15 text-danger border border-danger/30',
  warn: 'bg-warn/15 text-warn border border-warn/30',
  gradient: 'bg-gradient-accent text-accent-fg',
};

export function Badge({ tone = 'neutral', size = 'md', icon, dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold leading-none whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-[10px] uppercase tracking-wider' : 'h-6 px-2.5 text-xs',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {icon && <span className="[&>svg]:size-3">{icon}</span>}
      {children}
    </span>
  );
}
