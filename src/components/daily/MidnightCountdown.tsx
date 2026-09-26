import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { formatCountdown, msUntilMidnight } from './dailyMath';

export interface MidnightCountdownProps {
  label?: string;
  className?: string;
}

/** `Next pack in 05:12:33` — ticks every second until local midnight. */
export function MidnightCountdown({ label = 'Next pack in', className }: MidnightCountdownProps) {
  const [remaining, setRemaining] = useState(() => msUntilMidnight());

  useEffect(() => {
    const id = window.setInterval(() => setRemaining(msUntilMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <Clock className="size-4" aria-hidden />
      {label}{' '}
      <time className="font-mono font-semibold tabular text-fg" aria-live="off" data-testid="midnight-countdown">
        {formatCountdown(remaining)}
      </time>
    </p>
  );
}
