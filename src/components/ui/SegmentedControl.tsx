import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from './cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Accessible name when label is an icon only */
  'aria-label'?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  'aria-label'?: string;
  className?: string;
  disabled?: boolean;
}

const sizes = {
  sm: 'h-9 text-xs px-3 gap-1.5',
  md: 'h-10 text-sm px-4 gap-2',
  lg: 'h-12 text-base px-5 gap-2',
} as const;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth,
  'aria-label': ariaLabel,
  className,
  disabled,
}: SegmentedControlProps<T>) {
  const id = useId();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = options.filter((o) => !o.disabled);
    const idx = enabled.findIndex((o) => o.value === value);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % enabled.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + enabled.length) % enabled.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = enabled.length - 1;
    if (next === null) return;
    e.preventDefault();
    const opt = enabled[next]!;
    onChange(opt.value);
    ref.current?.querySelector<HTMLElement>(`[data-value="${opt.value}"]`)?.focus();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'glass inline-flex items-stretch rounded-full p-1',
        fullWidth && 'flex w-full',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o['aria-label']}
            data-value={o.value}
            tabIndex={selected ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold transition-colors duration-150 disabled:opacity-40',
              sizes[size],
              fullWidth && 'flex-1',
              selected ? 'text-accent-fg' : 'text-muted hover:text-fg',
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${id}-indicator`}
                className="absolute inset-0 rounded-full bg-gradient-accent shadow-glow"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
                aria-hidden
              />
            )}
            <span className="relative inline-flex items-center gap-[inherit] [&>svg]:size-[1.15em]">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
