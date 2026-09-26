import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export interface SettingRowProps {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  /** Always put the control under the label (for wide controls). */
  stack?: boolean;
  className?: string;
}

/** Label + hint on the left, control on the right (stacks on narrow screens). */
export function SettingRow({ label, hint, children, stack = false, className }: SettingRowProps) {
  return (
    <div className={cn('flex flex-col gap-2', !stack && 'sm:flex-row sm:items-center sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      <div className={cn('min-w-0', !stack && 'sm:shrink-0')}>{children}</div>
    </div>
  );
}
