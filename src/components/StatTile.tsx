import type { ReactNode } from 'react';
import { cn } from './ui/cn';
import { NumberTicker } from './ui/NumberTicker';

export interface StatTileProps {
  label: ReactNode;
  value: number | string;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warn';
  format?: (v: number) => string;
  suffix?: string;
  prefix?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Skip the count-up animation */
  animate?: boolean;
  decimals?: number;
}

const toneText = {
  neutral: 'text-fg',
  accent: 'text-gradient',
  success: 'text-success',
  danger: 'text-danger',
  warn: 'text-warn',
} as const;

export function StatTile({ label, value, icon, hint, tone = 'neutral', format, suffix, prefix, size = 'md', className, animate = true, decimals = 0 }: StatTileProps) {
  const valueClass = cn(
    'font-mono font-semibold leading-none tabular',
    size === 'sm' ? 'text-2xl' : size === 'lg' ? 'text-4xl sm:text-5xl' : 'text-3xl',
    toneText[tone],
  );
  return (
    <div className={cn('glass flex flex-col gap-2 rounded-3xl', size === 'sm' ? 'p-3.5' : 'p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <span>{label}</span>
        {icon && <span className="text-muted [&>svg]:size-4">{icon}</span>}
      </div>
      <div className={valueClass}>
        {typeof value === 'number' ? (
          <NumberTicker value={value} format={format} prefix={prefix} suffix={suffix} animateOnMount={animate} decimals={decimals} />
        ) : (
          <span>
            {prefix}
            {value}
            {suffix}
          </span>
        )}
      </div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
