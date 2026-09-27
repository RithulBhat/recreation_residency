import { Heart, Layers, Map, Target, Timer, Users, Zap } from 'lucide-react';
import { ProgressBar, cn } from '@/components/ui';
import { scoutBlitzDuration, scoutFormatInfo, scoutLives } from '@/scout/formats';
import { scoutMode, scoutPack } from '@/scout/packs';
import {
  accuracy,
  currentFormat,
  formatProgress,
  livesLeft,
  progress,
  roundRungs,
  runPlayers,
  survivalTier,
  triesLeft,
  wonRounds,
} from '@/scout/selectors';
import type { ScoutState } from '@/scout/types';
import { SURVIVAL_TIER_COPY } from './formatCopy';
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

/**
 * Desktop sidebar: what this session is, and how it is going.
 *
 * Every row is FORMAT-AWARE, because the same three numbers mean different things per format: blitz
 * has no round total and exactly one try, survival's ladder shortens as it escalates, and the gauntlet
 * measures itself in franchises. A panel that showed "tries left 1/5" on a blitz run was lying twice.
 */
export function SessionPanel({ state, className }: SessionPanelProps) {
  const { settings } = state;
  const round = state.rounds[state.currentRound];
  const mode = scoutMode(round?.mode ?? settings.mode);
  const format = currentFormat(state);
  const info = scoutFormatInfo(format);
  const fp = formatProgress(state, Date.now());
  const p = progress(state);
  const packs = settings.packIds.map((id) => scoutPack(id)).filter((x) => x !== undefined);
  const rungs = round ? roundRungs(round) : settings.tries;
  const left = triesLeft(state);
  const done = state.rounds.filter((r) => r.status !== 'playing').length;
  const blitz = format === 'blitz';
  const gauntlet = format === 'gauntlet';
  const survival = format === 'survival';
  const seats = runPlayers(state);
  const tier = survivalTier(state);

  const bar = gauntlet
    ? fp.franchisesTotal > 0
      ? fp.franchisesCleared / fp.franchisesTotal
      : 0
    : survival
      ? (livesLeft(state) ?? 0) / Math.max(1, scoutLives(settings))
      : p.total > 0
        ? done / p.total
        : 0;

  return (
    <section className={cn('glass flex flex-col gap-4 rounded-4xl p-4 sm:p-5', className)} aria-label="This session">
      {mode && (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              {mode.emoji}
            </span>
            <h2 className="font-display text-base font-bold text-fg">{mode.name}</h2>
            {info && format !== 'standard' && (
              <span className="ml-auto shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                {info.name}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-snug text-muted">{mode.how}</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted">{gauntlet ? 'Board' : survival ? 'Lives' : 'Progress'}</span>
          <span className="font-mono text-fg tabular" data-testid="scout-panel-progress">
            {survival ? `${livesLeft(state) ?? 0}/${scoutLives(settings)} · ${fp.label}` : fp.label}
            {!blitz && !gauntlet && !survival ? ` · ${wonRounds(state)} right` : ''}
          </span>
        </div>
        {!blitz && <ProgressBar value={bar} size="sm" label={undefined} aria-label="Session progress" />}
      </div>

      <dl className="flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex items-center gap-1.5 text-muted">
            <Target className="size-3.5" aria-hidden /> On offer now
          </dt>
          <dd className="font-mono font-semibold text-fg tabular">
            {points(rungValue(round?.mode ?? settings.mode, Math.min(round?.tryIndex ?? 0, rungs - 1)))} pts
          </dd>
        </div>
        {blitz ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-muted">
              <Zap className="size-3.5" aria-hidden /> On the clock
            </dt>
            <dd className="font-mono font-semibold text-fg tabular">{scoutBlitzDuration(settings)}s · one look</dd>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-muted">
              <Layers className="size-3.5" aria-hidden /> Tries left
            </dt>
            <dd className="font-mono font-semibold text-fg tabular" data-testid="scout-panel-tries">
              {left}/{rungs}
            </dd>
          </div>
        )}
        {survival && tier && (
          <div className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-muted">
              <Heart className="size-3.5" aria-hidden /> Hunting
            </dt>
            <dd className="font-mono font-semibold text-fg tabular">{SURVIVAL_TIER_COPY[tier].short}</dd>
          </div>
        )}
        {gauntlet && (
          <div className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-muted">
              <Map className="size-3.5" aria-hidden /> Clubs left
            </dt>
            <dd className="font-mono font-semibold text-fg tabular">
              {Math.max(0, fp.franchisesTotal - fp.franchisesCleared)}
            </dd>
          </div>
        )}
        {seats.length > 1 && (
          <div className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-muted">
              <Users className="size-3.5" aria-hidden /> Seats
            </dt>
            <dd className="font-mono font-semibold text-fg tabular">{seats.length}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex items-center gap-1.5 text-muted">
            <Timer className="size-3.5" aria-hidden /> Accuracy
          </dt>
          <dd className="font-mono font-semibold text-fg tabular">{Math.round(accuracy(state) * 100)}%</dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
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
