import { useState, type ReactNode } from 'react';
import { ChevronDown, Crown } from 'lucide-react';
import { getPack } from '@/lib/catalog';
import { formatClip, formatScore } from '@/stats/share';
import type { GameRecord } from '@/stats/types';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { MODE_EMOJI, MODE_LABEL, absoluteTime, clipLabel, formatDuration, pct, relativeTime } from './format';

export interface RecentGamesProps {
  /** Newest-first, as stored. */
  records: readonly GameRecord[];
  /** How many rows to show. Default 8. */
  count?: number;
  className?: string;
}

interface PackBits {
  id: string;
  emoji: string;
  name: string;
}

function packBits(ids: readonly string[]): PackBits[] {
  return ids.map((id) => {
    const pack = getPack(id);
    return { id, emoji: pack?.emoji ?? '🎵', name: pack?.name ?? id };
  });
}

function clipSummary(record: GameRecord): string {
  if (record.clipMode === 'escalating') {
    return record.stages.length > 0
      ? `Escalating ${formatClip(record.stages[0])} → ${formatClip(record.stages[record.stages.length - 1])}`
      : 'Escalating';
  }
  return `Fixed ${formatClip(record.clipLength)}`;
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="truncate font-mono text-sm tabular text-fg">{value}</dd>
    </div>
  );
}

/** Last N games, each row expanding into everything the stored record carries. */
export function RecentGames({ records, count = 8, className }: RecentGamesProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = records.slice(0, count);

  if (rows.length === 0) return null;

  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {rows.map((record) => {
        const open = openId === record.id;
        const packs = packBits(record.packIds);
        const acc = record.rounds > 0 ? record.correct / record.rounds : 0;
        return (
          <li key={record.id} className="glass overflow-hidden rounded-3xl">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : record.id)}
              aria-expanded={open}
              aria-controls={`game-detail-${record.id}`}
              className="flex w-full min-h-[3.5rem] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-strong sm:px-4"
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-strong text-xl leading-none"
                aria-hidden
              >
                {MODE_EMOJI[record.mode]}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-fg">{MODE_LABEL[record.mode]}</span>
                  {record.daily && (
                    <Badge tone="accent" size="sm">
                      Daily
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
                  <span className="truncate">
                    {packs.length === 0
                      ? 'No pack'
                      : packs.length <= 2
                        ? packs.map((p) => `${p.emoji} ${p.name}`).join(' · ')
                        : `${packs[0].emoji} ${packs[0].name} +${packs.length - 1}`}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0 whitespace-nowrap" title={absoluteTime(record.finishedAt)}>
                    {relativeTime(record.finishedAt)}
                  </span>
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="block font-mono text-base font-semibold tabular text-fg">
                  {formatScore(record.score)}
                </span>
                <span
                  className={cn(
                    'block font-mono text-xs tabular',
                    acc >= 0.8 ? 'text-success' : acc >= 0.4 ? 'text-muted' : 'text-danger',
                  )}
                >
                  {record.correct}/{record.rounds}
                </span>
              </span>

              <ChevronDown
                className={cn('size-4 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
                aria-hidden
              />
            </button>

            <div id={`game-detail-${record.id}`} hidden={!open} className="border-t border-border px-3 py-3 sm:px-4">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Detail label="Accuracy" value={pct(acc)} />
                <Detail label="Best streak" value={record.bestStreak} />
                <Detail label="Difficulty" value={record.difficulty} />
                <Detail label="Clips" value={clipSummary(record)} />
                <Detail label="Avg tries" value={record.avgTries > 0 ? record.avgTries.toFixed(2) : '—'} />
                <Detail
                  label="Avg clip heard"
                  value={record.avgClipLengthHeard > 0 ? clipLabel(record.avgClipLengthHeard) : '—'}
                />
                <Detail label="Artist only" value={record.partial} />
                <Detail label="Length" value={formatDuration(record.durationMs)} />
              </dl>

              {record.players && record.players.length >= 2 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {record.players.map((p) => (
                    <li
                      key={`${record.id}-${p.name}`}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                        p.name === record.winnerName ? 'bg-accent/15 text-accent' : 'bg-surface-strong text-fg',
                      )}
                    >
                      {p.name === record.winnerName && <Crown className="size-3" aria-hidden />}
                      {p.name}
                      <span className="font-mono tabular text-muted">{formatScore(p.score)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 text-xs text-muted">
                Per-game tracklists aren&apos;t stored — every song you&apos;ve heard lives in{' '}
                <a href="#songs-you-have-met" className="font-semibold text-accent underline-offset-2 hover:underline">
                  Songs you&apos;ve met
                </a>
                .
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
