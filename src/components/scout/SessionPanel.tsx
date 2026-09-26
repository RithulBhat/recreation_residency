import { Layers, Target, Timer } from 'lucide-react';
import { ProgressBar, cn } from '@/components/ui';
import { scoutMode, scoutPack } from '@/scout/packs';
import { accuracy, progress, triesLeft, wonRounds } from '@/scout/selectors';
import type { ScoutState } from '@/scout/types';
import { points, rungValue } from './format';

export interface SessionPanelProps {
  state: ScoutState;
  className?: string;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  any: 'Everyone',
  star: 'Stars only',
  starter: 'Starters',
  rotation: 'Rotation',
  deepCut: 'Deep cuts',
};

/** Desktop sidebar: what this session is, and how it is going. */
export function SessionPanel({ state, className }: SessionPanelProps) {
  const { settings } = state;
  const round = state.rounds[state.currentRound];
  const mode = scoutMode(round?.mode ?? settings.mode);
  const p = progress(state);
  const packs = settings.packIds.map((id) => scoutPack(id)).filter((x) => x !== undefined);
  const left = triesLeft(state);
  const done = state.rounds.filter((r) => r.status !== 'playing').length;

  return (
    <section className={cn('glass flex flex-col gap-4 rounded-4xl p-4 sm:p-5', className)} aria-label="This session">
      {mode && (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              {mode.emoji}
            </span>
            <h2 className="font-display text-base font-bold text-fg">{mode.name}</h2>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted">{mode.how}</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted">Progress</span>
          <span className="font-mono text-fg tabular">
            {p.round}
            {p.total > 0 ? `/${p.total}` : ''} · {wonRounds(state)} right
          </span>
        </div>
        <ProgressBar value={p.total > 0 ? done / p.total : 0} size="sm" label="Session progress" />
      </div>

      <dl className="flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex items-center gap-1.5 text-muted">
            <Target className="size-3.5" aria-hidden /> On offer now
          </dt>
          <dd className="font-mono font-semibold text-fg tabular">
            {points(rungValue(round?.mode ?? settings.mode, Math.min(round?.tryIndex ?? 0, settings.tries - 1)))} pts
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex items-center gap-1.5 text-muted">
            <Layers className="size-3.5" aria-hidden /> Tries left
          </dt>
          <dd className="font-mono font-semibold text-fg tabular">
            {left}/{settings.tries}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex items-center gap-1.5 text-muted">
            <Timer className="size-3.5" aria-hidden /> Accuracy
          </dt>
          <dd className="font-mono font-semibold text-fg tabular">{Math.round(accuracy(state) * 100)}%</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
          {DIFFICULTY_LABEL[settings.difficulty] ?? settings.difficulty}
        </span>
        {packs.slice(0, 3).map((pack) => (
          <span key={pack.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-fg">
            <span aria-hidden>{pack.emoji}</span>
            <span className="truncate">{pack.name}</span>
          </span>
        ))}
        {packs.length > 3 && <span className="text-[11px] text-muted">+{packs.length - 3}</span>}
      </div>
    </section>
  );
}
