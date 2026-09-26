import type { ComponentPropsWithRef } from 'react';
import { cn } from './cn';

export interface ProgressBarProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** 0..1 */
  value: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** 'gradient' (default) or a CSS color */
  color?: string;
  label?: string;
  showValue?: boolean;
  /** Indeterminate shimmer */
  indeterminate?: boolean;
  /** Segments (e.g. tries) – renders discrete blocks instead of a bar */
  segments?: number;
}

const heights = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' } as const;

export function ProgressBar({
  value,
  size = 'md',
  color = 'gradient',
  label,
  showValue,
  indeterminate,
  segments,
  className,
  ...rest
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value));
  const fill = color === 'gradient' ? { backgroundImage: 'var(--gradient-accent)' } : { background: color };

  return (
    <div className={cn('w-full', className)} {...rest}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          {label && <span className="font-medium text-muted">{label}</span>}
          {showValue && <span className="font-mono tabular text-fg">{Math.round(pct * 100)}%</span>}
        </div>
      )}
      {segments ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={segments}
          aria-valuenow={Math.round(pct * segments)}
          aria-label={label}
          className={cn('flex gap-1', heights[size])}
        >
          {Array.from({ length: segments }, (_, i) => (
            <span
              key={i}
              className={cn('flex-1 rounded-full bg-surface-strong transition-colors duration-300')}
              style={i < Math.round(pct * segments) ? fill : undefined}
            />
          ))}
        </div>
      ) : (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : Math.round(pct * 100)}
          aria-label={label}
          className={cn('relative w-full overflow-hidden rounded-full bg-surface-strong', heights[size])}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300 ease-out',
              indeterminate && 'w-1/3 animate-shimmer',
            )}
            style={{ width: indeterminate ? undefined : `${pct * 100}%`, ...fill }}
          />
        </div>
      )}
    </div>
  );
}
