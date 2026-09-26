import { useId, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from './cn';

export interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  description?: ReactNode;
  format?: (v: number) => string;
  disabled?: boolean;
  size?: 'md' | 'lg';
  className?: string;
  /** Accessible name when there's no visible label */
  'aria-label'?: string;
}

export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  label,
  description,
  format = (v) => String(v),
  disabled,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: StepperProps) {
  const id = useId();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const dec = () => onChange(clamp(round(value - step, step)));
  const inc = () => onChange(clamp(round(value + step, step)));
  const btn = cn(
    'grid shrink-0 place-items-center rounded-full text-fg transition-[background-color,transform] active:scale-90 disabled:opacity-35 disabled:pointer-events-none hover:bg-surface-strong',
    size === 'lg' ? 'size-12 [&>svg]:size-5' : 'size-10 [&>svg]:size-4',
  );

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <span id={`${id}-l`} className="block text-sm font-semibold text-fg">
              {label}
            </span>
          )}
          {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
        </div>
      )}
      <div
        role="group"
        aria-labelledby={label ? `${id}-l` : undefined}
        aria-label={ariaLabel}
        className={cn('glass inline-flex items-center rounded-full p-1', size === 'lg' ? 'gap-1' : 'gap-0.5')}
      >
        <button type="button" className={btn} onClick={dec} disabled={disabled || value <= min} aria-label="Decrease">
          <Minus />
        </button>
        <output
          aria-live="polite"
          className={cn(
            'min-w-[3ch] text-center font-mono font-semibold tabular text-fg',
            size === 'lg' ? 'px-2 text-lg' : 'px-1.5 text-sm',
          )}
        >
          {format(value)}
        </output>
        <button type="button" className={btn} onClick={inc} disabled={disabled || value >= max} aria-label="Increase">
          <Plus />
        </button>
      </div>
    </div>
  );
}

function round(v: number, step: number): number {
  const decimals = (step.toString().split('.')[1] ?? '').length;
  return Number(v.toFixed(decimals));
}
