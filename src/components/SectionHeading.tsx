import type { ElementType, ReactNode } from 'react';
import { cn } from './ui/cn';

export interface SectionHeadingProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  align?: 'left' | 'center';
  size?: 'sm' | 'md' | 'lg';
  as?: ElementType;
  className?: string;
}

/**
 * Eyebrow / title / description / action.
 *
 * As a screen title (`as="h1"`) it is deliberately compact on phones: the description stays in the
 * accessibility tree but leaves the viewport (`sr-only` below `sm`) and the `lg` size steps down to
 * `text-2xl`, so the first control lands inside the first fold instead of under 350 px of preamble.
 */
export function SectionHeading({ eyebrow, title, description, action, align = 'left', size = 'md', as, className }: SectionHeadingProps) {
  const Tag: ElementType = as ?? 'h2';
  const pageTitle = Tag === 'h1';
  return (
    <div className={cn('flex items-end justify-between gap-4', align === 'center' && 'flex-col items-center text-center', className)}>
      <div className={cn('min-w-0', align === 'center' && 'flex flex-col items-center')}>
        {eyebrow && <div className={cn('text-[11px] font-bold uppercase tracking-[0.18em] text-accent', pageTitle ? 'mb-1' : 'mb-1.5')}>{eyebrow}</div>}
        <Tag
          className={cn(
            'font-display font-bold tracking-tight text-fg',
            size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl sm:text-3xl md:text-4xl' : 'text-xl sm:text-2xl',
          )}
        >
          {title}
        </Tag>
        {description && (
          <p className={cn('mt-1.5 max-w-prose text-muted', size === 'lg' ? 'text-base' : 'text-sm', pageTitle && 'max-sm:sr-only')}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
