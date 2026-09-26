import type { ComponentPropsWithRef, CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends ComponentPropsWithRef<'div'> {
  /** Accent hex color → soft gradient wash + tinted border */
  accent?: string;
  /** Glow shadow using the theme accent */
  glow?: boolean;
  /** Hover lift + pointer cursor */
  interactive?: boolean;
  /** Strong variant (more opaque) */
  strong?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Element type; defaults to div */
  as?: ElementType;
  /** Gradient border effect */
  outlined?: boolean;
  children?: ReactNode;
}

const paddings = { none: '', sm: 'p-3 sm:p-4', md: 'p-4 sm:p-6', lg: 'p-6 sm:p-8' } as const;

export function Card({
  accent,
  glow,
  interactive,
  strong,
  padding = 'md',
  as,
  outlined,
  className,
  style,
  children,
  ...rest
}: CardProps) {
  const Tag: ElementType = as ?? 'div';
  const accentStyle: CSSProperties | undefined = accent
    ? {
        ['--card-accent' as string]: accent,
        backgroundImage: `radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, ${accent} 28%, transparent), transparent 55%)`,
        borderColor: `color-mix(in oklab, ${accent} 35%, var(--sg-border))`,
      }
    : undefined;
  return (
    <Tag
      className={cn(
        'relative rounded-3xl',
        strong ? 'glass-strong' : 'glass',
        paddings[padding],
        glow && 'glow',
        outlined && 'border-gradient',
        interactive &&
          'cursor-pointer transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-border-strong hover:shadow-glow active:translate-y-0 active:scale-[0.99]',
        className,
      )}
      style={{ ...accentStyle, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
