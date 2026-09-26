import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export function EmptyState({ icon, title, description, action, className, size = 'md' }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'gap-2 py-8' : 'gap-3 py-14',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'grid place-items-center rounded-3xl glass text-muted',
            size === 'sm' ? 'size-12 [&>svg]:size-6' : 'size-16 [&>svg]:size-8',
          )}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <h3 className={cn('font-display font-semibold text-fg', size === 'sm' ? 'text-base' : 'text-lg')}>{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
