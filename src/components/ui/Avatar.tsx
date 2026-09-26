import type { ComponentPropsWithRef } from 'react';
import { cn } from './cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  emoji: string;
  /** hex color used for the ring/background tint */
  color: string;
  size?: AvatarSize;
  /** Accessible name, e.g. player name */
  name?: string;
  /** Highlight ring (active player) */
  active?: boolean;
}

const sizes: Record<AvatarSize, string> = {
  xs: 'size-7 text-sm',
  sm: 'size-9 text-lg',
  md: 'size-11 text-xl',
  lg: 'size-14 text-2xl',
  xl: 'size-20 text-4xl',
};

export function Avatar({ emoji, color, size = 'md', name, active, className, style, ...rest }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name ?? emoji}
      className={cn(
        'relative inline-grid shrink-0 place-items-center rounded-full select-none leading-none transition-shadow',
        sizes[size],
        active && 'ring-2 ring-offset-2 ring-offset-bg',
        className,
      )}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${color} 55%, transparent), color-mix(in oklab, ${color} 20%, transparent))`,
        boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${color} 70%, transparent)`,
        ['--tw-ring-color' as string]: color,
        ...style,
      }}
      {...rest}
    >
      <span aria-hidden>{emoji}</span>
    </span>
  );
}
