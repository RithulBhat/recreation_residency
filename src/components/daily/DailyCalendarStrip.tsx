import type { DailyResult } from '@/stats/types';
import { formatScore } from '@/stats/share';
import { cn } from '@/components/ui/cn';
import { dayOfMonth, weekdayLetter } from './dailyMath';

export interface DailyCalendarStripProps {
  /** Oldest → newest, last one is today. */
  days: readonly string[];
  daily: Readonly<Record<string, DailyResult>>;
  today: string;
}

type Status = 'perfect' | 'played' | 'missed' | 'today';

function statusOf(date: string, today: string, result: DailyResult | undefined): Status {
  if (result) return result.rounds > 0 && result.correct === result.rounds ? 'perfect' : 'played';
  return date === today ? 'today' : 'missed';
}

const STATUS_LABEL: Record<Status, string> = {
  perfect: 'perfect',
  played: 'played',
  missed: 'missed',
  today: 'not played yet',
};

/** The last 14 days as little tiles: perfect / played / missed / today. */
export function DailyCalendarStrip({ days, daily, today }: DailyCalendarStripProps) {
  return (
    <div>
      <ol className="grid grid-cols-7 gap-1.5 sm:grid-cols-14" aria-label="Last 14 days">
        {days.map((date) => {
          const result = daily[date];
          const status = statusOf(date, today, result);
          const title = `${date} · ${STATUS_LABEL[status]}${result ? ` · ${result.correct}/${result.rounds} · ${formatScore(result.score)} pts` : ''}`;
          return (
            <li
              key={date}
              title={title}
              aria-label={title}
              className={cn(
                'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border text-center transition-colors',
                status === 'perfect' && 'border-transparent bg-gradient-accent text-accent-fg shadow-glow',
                status === 'played' && 'border-transparent bg-success/20 text-fg',
                status === 'missed' && 'border-border bg-surface text-muted',
                status === 'today' && 'border-accent border-dashed bg-accent/10 text-fg animate-pulse-soft',
              )}
            >
              <span className="text-[9px] font-semibold uppercase leading-none opacity-80">{weekdayLetter(date)}</span>
              <span className="font-mono text-sm font-bold leading-none tabular">{dayOfMonth(date)}</span>
              <span className="text-[10px] leading-none" aria-hidden>
                {status === 'perfect' ? '★' : status === 'played' ? '●' : status === 'today' ? '?' : '·'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>★ perfect</span>
        <span>● played</span>
        <span>· missed</span>
        <span>? today</span>
      </p>
    </div>
  );
}
