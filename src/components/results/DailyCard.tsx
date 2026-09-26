import { useEffect, useState } from 'react';
import { CalendarDays, Share2 } from 'lucide-react';
import type { GameState } from '@/types';
import { Button, toast } from '@/components/ui';
import { GRID_LEGEND, dailyShareText, resultGrid, shareOrCopy } from '@/stats/share';

export interface DailyCardProps {
  state: GameState;
  date: string;
}

export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

function hms(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Daily result: the Wordle-style grid, a share button and the countdown to tomorrow's puzzle. */
export function DailyCard({ state, date }: DailyCardProps) {
  const [left, setLeft] = useState(() => msUntilMidnight());
  useEffect(() => {
    const id = window.setInterval(() => setLeft(msUntilMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const grid = resultGrid(state);
  const correct = state.rounds.filter((r) => r.status === 'won').length;

  const share = async () => {
    const text = dailyShareText({ date, score: state.totalScore, correct, rounds: state.rounds.length, grid }, date, `${location.origin}${location.pathname}#/daily`);
    const outcome = await shareOrCopy(text);
    if (outcome === 'copied') toast.success('Copied to clipboard', 'Paste it anywhere.');
    else if (outcome === 'failed') toast.error("Couldn't share", 'Your browser blocked the clipboard.');
  };

  return (
    <section className="glass rounded-4xl p-5" aria-label="Daily result" data-testid="daily-card">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5 text-accent" aria-hidden />
        <h2 className="font-display text-lg font-bold text-fg">Daily · {date}</h2>
      </div>
      <pre className="mt-3 whitespace-pre-wrap font-mono text-sm leading-relaxed text-fg" aria-label="Result grid">
        {grid}
      </pre>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-label="Legend">
        {GRID_LEGEND.map((l) => (
          <li key={l.emoji}>
            {l.emoji} {l.label}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" leadingIcon={<Share2 />} onClick={share}>
          Share today&apos;s result
        </Button>
        <span className="font-mono text-xs text-muted tabular">
          Next daily in <span className="text-fg">{hms(left)}</span>
        </span>
      </div>
    </section>
  );
}
