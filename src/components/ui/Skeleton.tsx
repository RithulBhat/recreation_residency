import type { ComponentPropsWithRef } from 'react';
import { cn } from './cn';

export interface SkeletonProps extends ComponentPropsWithRef<'div'> {
  /** Circle shape */
  circle?: boolean;
}

export function Skeleton({ className, circle, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden bg-surface-strong',
        circle ? 'rounded-full' : 'rounded-xl',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-fg/10 before:to-transparent',
        className,
      )}
      {...rest}
    />
  );
}
