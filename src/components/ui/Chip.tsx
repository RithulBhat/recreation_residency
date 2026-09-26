import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';

export interface ChipProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  selected?: boolean;
  /** Optional count shown on the right */
  count?: number;
  icon?: ReactNode;
  /** Hex/CSS color for a colored dot + tint when selected */
  color?: string;
  size?: 'sm' | 'md';
  /** Show a check icon when selected */
  check?: boolean;
  children: ReactNode;
}

export function Chip({
  selected = false,
  count,
  icon,
  color,
  size = 'md',
  check = false,
  className,
  children,
  type = 'button',
  style,
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'group touch-hit-44 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        selected
          ? 'border-transparent bg-accent-solid text-accent-fg shadow-glow'
          : 'glass text-fg hover:bg-surface-strong hover:border-border-strong',
        className,
      )}
      style={selected && color ? { background: color, ...style } : style}
      {...rest}
    >
      {check && selected && <Check className="size-3.5" aria-hidden />}
      {color && !selected && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
      {icon && <span className="inline-flex [&>svg]:size-3.5">{icon}</span>}
      <span>{children}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'ml-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none tabular',
            selected ? 'bg-black/20 text-accent-fg' : 'bg-surface-strong text-muted',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
