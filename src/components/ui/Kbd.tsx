import type { ComponentPropsWithRef } from 'react';
import { cn } from './cn';

export interface KbdProps extends ComponentPropsWithRef<'kbd'> {
  size?: 'sm' | 'md';
}

export function Kbd({ className, size = 'md', children, ...rest }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-border-strong bg-surface-strong font-mono font-semibold text-fg shadow-[0_1px_0_0_var(--sg-border-strong)]',
        size === 'sm' ? 'h-5 min-w-5 px-1 text-[10px]' : 'h-6 min-w-6 px-1.5 text-xs',
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
}
