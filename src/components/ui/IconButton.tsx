import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from './cn';

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-label'> {
  /** Required: icon buttons have no visible text. */
  'aria-label': string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Pressed/selected state (sets aria-pressed) */
  active?: boolean;
  /** Round shape (default) or rounded square */
  shape?: 'round' | 'square';
}

const sizes: Record<IconButtonSize, string> = {
  sm: 'size-9 [&>svg]:size-4',
  md: 'size-11 [&>svg]:size-5',
  lg: 'size-13 [&>svg]:size-6',
};

const variants: Record<IconButtonVariant, string> = {
  ghost: 'text-muted hover:text-fg hover:bg-surface',
  secondary: 'glass text-fg hover:bg-surface-strong',
  primary: 'bg-gradient-accent text-accent-fg hover:brightness-110 shadow-glow',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
};

export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  active,
  shape = 'round',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center transition-[background-color,color,transform,filter] duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        shape === 'round' ? 'rounded-full' : 'rounded-xl',
        sizes[size],
        variants[variant],
        active && variant === 'ghost' && 'bg-accent/15 text-accent',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
