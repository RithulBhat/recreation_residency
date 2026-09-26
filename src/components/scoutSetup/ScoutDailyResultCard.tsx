import { useState } from 'react';
import { Check, Share2, Trophy } from 'lucide-react';
import { formatScore, shareOrCopy } from '@/stats/share';
import type { ScoutGameRecord } from '@/store/scoutResultStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { toast } from '@/components/ui/Toast';
import { R } from '@/routes';
import { SCOUT_GRID_LEGEND, scoutDailyShareText } from './scoutAggregate';

export interface ScoutDailyResultCardProps {
  record: ScoutGameRecord;
  /** Consecutive dailies including this one. */
  streak: number;
}

/** The glyph for a stored round — the same key `roundGlyph` writes into the shareable grid. */
function glyphFor(round: ScoutGameRecord['rounds'][number]): string {
  if (round.verdict === 'correct') return '🟩';
  if (round.verdict === 'close') return '🟨';
  if (round.verdict === 'skipped' || round.verdict === 'timeout') return '⬜';
  return '🟥';
}

/** Today's finished Scout daily: score, tally, the round-by-round grid and a share button. */
export function ScoutDailyResultCard({ record, streak }: ScoutDailyResultCardProps) {
  const [copied, setCopied] = useState(false);
  const perfect = record.played > 0 && record.correct === record.played;

  const share = async () => {
    const url =
      typeof location !== 'undefined' ? `${location.origin}${location.pathname}#${R.scout.daily}` : undefined;
    const outcome = await shareOrCopy(scoutDailyShareText(record, url));
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
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
              {perfect ? 'Perfect scout' : 'Done for today'}
            </div>
            <div className="mt-1 font-display text-4xl font-black tabular text-fg sm:text-5xl" data-testid="scout-daily-score">
              <NumberTicker value={record.score} format={formatScore} />
              <span className="ml-1 text-lg font-semibold text-muted">pts</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              <span className="font-semibold text-fg">
                {record.correct}/{record.played}
              </span>{' '}
              named
              {streak >= 1 && (
                <>
                  {' · '}
                  <span data-testid="scout-daily-streak">
                    <span className="font-semibold text-warn">🔥 {streak}-day streak</span>
                    {streak === 1 && <span> · come back tomorrow to keep it</span>}
                  </span>
                </>
              )}
            </p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-accent-fg shadow-glow" aria-hidden>
            <Trophy className="size-6" />
          </span>
        </div>

        {record.rounds.length > 0 && (
          <ol className="flex flex-wrap gap-1.5" aria-label="Round by round">
            {record.rounds.map((r) => {
              const glyph = glyphFor(r);
              return (
                <li key={r.index} className="flex w-11 flex-col items-center gap-0.5 rounded-xl bg-surface py-1.5">
                  <span className="text-lg leading-none" aria-hidden>
                    {glyph}
                  </span>
                  <span className="font-mono text-[10px] tabular text-muted">
                    {r.verdict === 'correct' ? `${r.triesUsed}/${record.tries}` : '—'}
                  </span>
                  <span className="sr-only">
                    Round {r.index + 1}: {SCOUT_GRID_LEGEND.find((g) => g.emoji === glyph)?.label ?? 'played'}
                    {r.verdict === 'correct' ? ` on try ${r.triesUsed}` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="glow" leadingIcon={copied ? <Check /> : <Share2 />} onClick={() => void share()}>
            {copied ? 'Copied' : 'Share result'}
          </Button>
          <span className="text-xs text-muted">{SCOUT_GRID_LEGEND.map((g) => `${g.emoji} ${g.label}`).join('  ')}</span>
        </div>
      </div>
    </Card>
  );
}
