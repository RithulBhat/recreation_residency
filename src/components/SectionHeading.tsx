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

export function SectionHeading({ eyebrow, title, description, action, align = 'left', size = 'md', as, className }: SectionHeadingProps) {
  const Tag: ElementType = as ?? 'h2';
  return (
    <div className={cn('flex items-end justify-between gap-4', align === 'center' && 'flex-col items-center text-center', className)}>
      <div className={cn('min-w-0', align === 'center' && 'flex flex-col items-center')}>
        {eyebrow && <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">{eyebrow}</div>}
        <Tag
          className={cn(
            'font-display font-bold tracking-tight text-fg',
            size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl',
          )}
        >
          {title}
        </Tag>
        {description && <p className={cn('mt-1.5 max-w-prose text-muted', size === 'lg' ? 'text-base' : 'text-sm')}>{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
