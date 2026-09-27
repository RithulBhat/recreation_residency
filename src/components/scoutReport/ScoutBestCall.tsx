import { Ghost, Medal } from 'lucide-react';
import { scoutMode } from '@/scout/packs';
import { SCOUT_TIER_EMOJI, SCOUT_TIER_LABELS, type ScoutReport } from '@/scout/report';
import type { ScoutSubjectRecord } from '@/scout/scoutStats';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { relativeTime } from '@/components/stats/format';
import { rungLabel } from './format';

export interface ScoutBestCallProps {
  report: ScoutReport;
  /** Lifetime rung-0 solves (`totals.firstRungSolves`) — the context that one best call needs. */
  firstLooks?: number;
  className?: string;
}

/**
 * The single best call ever made: the shortest rung anybody was ever named at, and who it was.
 * `rung` is 0-based, so rung 0 — "first look" — means no clue had been spent at all.
 */
export function ScoutBestCall({ report, firstLooks = 0, className }: ScoutBestCallProps) {
  const call = report.bestCall;
  const mode = call ? scoutMode(call.mode) : undefined;

  return (
    <div
      className={cn('glass noise relative flex flex-col overflow-hidden rounded-4xl p-5 sm:p-6', className)}
      data-testid="scout-best-call"
    >
      <div
        className="pointer-events-none absolute -right-20 -top-24 size-56 rounded-full bg-warn opacity-20 blur-3xl"
        aria-hidden
      />
      <div className="eyebrow-readable relative flex items-center gap-2">
        <Medal className="size-3.5" aria-hidden />
        Best call
      </div>

      {call ? (
        <div className="relative mt-3 flex flex-1 flex-col gap-3">
          <div className="flex items-start gap-4">
            <div className="shrink-0 text-center">
              <div className="font-mono text-4xl font-black leading-none tabular text-gradient sm:text-5xl">
                {call.rung + 1}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">rung</div>
            </div>
            <div className="min-w-0">
              <p className="font-display text-2xl font-black leading-tight tracking-tight text-fg sm:text-3xl">
                {call.name}
              </p>
              <p className="mt-1 text-sm text-muted">
                Named on the <span className="font-semibold text-fg">{rungLabel(call.rung)}</span>
                {mode ? (
                  <>
                    {' '}
                    in <span className="font-semibold text-fg">{mode.name}</span>
                  </>
                ) : null}
                .
              </p>
            </div>
          </div>

          {firstLooks > 0 && (
            <p className="text-sm text-muted">
              <span className="font-mono font-semibold tabular text-fg">{firstLooks}</span>{' '}
              {firstLooks === 1 ? 'call' : 'calls'} made before a single clue was spent, lifetime.
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2">
            <Badge tone="warn" size="sm">
              {SCOUT_TIER_EMOJI[call.tier]} {SCOUT_TIER_LABELS[call.tier]}
            </Badge>
            {call.teamAbbr && (
              <Badge tone="neutral" size="sm">
                {call.teamAbbr}
              </Badge>
            )}
            {mode && (
              <Badge tone="neutral" size="sm">
                {mode.emoji} {mode.name}
              </Badge>
            )}
            {call.at > 0 && <span className="font-mono text-[11px] tabular text-muted">{relativeTime(call.at)}</span>}
          </div>
        </div>
      ) : (
        <div className="relative mt-3 flex flex-1 flex-col justify-center">
          <p className="font-display text-xl font-bold text-fg">Nothing named yet.</p>
          <p className="mt-1.5 text-sm text-muted">
            The first subject you call before spending a clue lands here — with the rung, the puzzle type and the tier
            you did it against.
          </p>
        </div>
      )}
    </div>
  );
}

export interface ScoutNemesisPanelProps {
  nemeses: readonly ScoutSubjectRecord[];
  className?: string;
}

/** Subjects seen twice or more and never once named — `scoutWeakestSubjects`, verbatim. */
export function ScoutNemesisPanel({ nemeses, className }: ScoutNemesisPanelProps) {
  return (
    <div className={cn('glass flex flex-col rounded-4xl p-5 sm:p-6', className)} data-testid="scout-nemeses">
      <div className="eyebrow-readable flex items-center gap-2">
        <Ghost className="size-3.5" aria-hidden />
        Unfinished business
      </div>

      {nemeses.length === 0 ? (
        <>
          <p className="mt-3 font-display text-lg font-bold text-fg">Nobody has your number.</p>
          <p className="mt-1.5 text-sm text-muted">
            Anyone you have faced twice and never named shows up here, most-seen first.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">
            Faced more than once, never named. {nemeses.length} {nemeses.length === 1 ? 'man' : 'men'} outstanding.
          </p>
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {nemeses.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-fg">{s.name}</span>
                  <span className="font-mono text-[11px] tabular text-muted">
                    {s.teamAbbr ? `${s.teamAbbr} · ` : ''}
                    {s.group ? `${s.group} · ` : ''}
                    {SCOUT_TIER_LABELS[s.tier]}
                  </span>
                </span>
                <Badge tone="danger" size="sm">
                  0 / {s.timesSeen}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
