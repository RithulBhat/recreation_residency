import { useState } from 'react';
import { Check, Share2, Trophy } from 'lucide-react';
import type { DailyResult } from '@/stats/types';
import { GRID_LEGEND, dailyShareText, formatScore, shareOrCopy } from '@/stats/share';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { toast } from '@/components/ui/Toast';

export interface DailyResultCardProps {
  result: DailyResult;
  /** Consecutive dailies including this one. */
  streak: number;
}

function parseGrid(grid: string): Array<{ emoji: string; clip: string }> {
  return grid
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [emoji = '', ...rest] = line.split(' ');
      return { emoji, clip: rest.join(' ') };
    });
}

/** Today's finished daily: score, correct count, the emoji grid and a share button. */
export function DailyResultCard({ result, streak }: DailyResultCardProps) {
  const [copied, setCopied] = useState(false);
  const cells = parseGrid(result.grid);
  const perfect = result.rounds > 0 && result.correct === result.rounds;

  const share = async () => {
    const url = typeof location !== 'undefined' ? `${location.origin}${location.pathname}#/daily` : undefined;
    const outcome = await shareOrCopy(dailyShareText(result, result.date, url));
    if (outcome === 'copied') {
      setCopied(true);
      toast.success('Copied to clipboard', 'Paste it anywhere to show off.');
      window.setTimeout(() => setCopied(false), 2000);
    } else if (outcome === 'failed') {
      toast.error('Could not share', 'Your browser blocked the clipboard.');
    }
  };

  return (
    <Card padding="lg" glow className="overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent opacity-20 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">{perfect ? 'Perfect run' : 'Done for today'}</div>
            <div className="mt-1 font-display text-4xl font-black tabular text-fg sm:text-5xl" data-testid="daily-score">
              <NumberTicker value={result.score} format={formatScore} />
              <span className="ml-1 text-lg font-semibold text-muted">pts</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              <span className="font-semibold text-fg">
                {result.correct}/{result.rounds}
              </span>{' '}
              songs named
              {streak > 1 && (
                <>
                  {' · '}
                  <span className="font-semibold text-warn" data-testid="daily-streak">
                    🔥 {streak}-day streak
                  </span>
                </>
              )}
            </p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-accent-fg shadow-glow" aria-hidden>
            <Trophy className="size-6" />
          </span>
        </div>

        {cells.length > 0 && (
          <ol className="flex flex-wrap gap-1.5" aria-label="Round by round">
            {cells.map((c, i) => (
              <li key={i} className="flex w-11 flex-col items-center gap-0.5 rounded-xl bg-surface py-1.5">
                <span className="text-lg leading-none" aria-hidden>
                  {c.emoji}
                </span>
                <span className="font-mono text-[10px] tabular text-muted">{c.clip}</span>
                <span className="sr-only">
                  Round {i + 1}: {GRID_LEGEND.find((g) => g.emoji === c.emoji)?.label ?? 'played'} at {c.clip}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="glow" leadingIcon={copied ? <Check /> : <Share2 />} onClick={() => void share()}>
            {copied ? 'Copied' : 'Share result'}
          </Button>
          <span className="text-xs text-muted">
            {GRID_LEGEND.map((g) => `${g.emoji} ${g.label}`).join('  ')}
          </span>
        </div>
      </div>
    </Card>
  );
}
