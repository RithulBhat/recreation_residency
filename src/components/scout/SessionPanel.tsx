import { useEffect, useRef, useState } from 'react';
import { Check, Heart, Layers, Map, Minus, Target, Timer, Users, X, Zap } from 'lucide-react';
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
import type { ScoutRound, ScoutState, ScoutVerdict } from '@/scout/types';
import { SURVIVAL_TIER_COPY } from './formatCopy';
import { points, roundVerdict, rungValue, triesUsed } from './format';

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

const LEDGER_MARK: Record<ScoutVerdict, { icon: typeof Check; tone: string }> = {
  correct: { icon: Check, tone: 'border-success/50 bg-success/15 text-success' },
  close: { icon: Minus, tone: 'border-warn/50 bg-warn/15 text-warn' },
  wrong: { icon: X, tone: 'border-danger/50 bg-danger/15 text-danger' },
  timeout: { icon: X, tone: 'border-danger/50 bg-danger/15 text-danger' },
  skipped: { icon: Minus, tone: 'border-border bg-surface text-muted' },
};

/**
 * One graded round of this run.
 *
 * A round that is still live never names its subject — that is the whole game — so the live row
 * says what it is worth instead, and only a finished round hands its answer over.
 */
function LedgerRow({
  round,
  live,
  rowRef,
}: {
  round: ScoutRound;
  live: boolean;
  rowRef?: React.RefObject<HTMLLIElement | null>;
}) {
  const verdict = roundVerdict(round);
  const mark = LEDGER_MARK[verdict];
  const Icon = mark.icon;
  const used = triesUsed(round);
  return (
    <li
      ref={rowRef}
      className={cn(
        'flex max-h-[6.5rem] min-h-[2.75rem] min-w-0 flex-1 items-center gap-2.5 rounded-2xl border px-2.5 py-1.5',
        live ? 'border-accent/45 bg-accent/10' : 'border-border bg-surface',
      )}
      data-testid="scout-ledger-row"
      data-verdict={live ? 'live' : verdict}
    >
      <span className="w-4 shrink-0 font-mono text-[11px] text-muted tabular">{round.index + 1}</span>
      {live ? (
        <span className="grid size-5 shrink-0 place-items-center rounded-full border border-accent/50 bg-accent/15">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        </span>
      ) : (
        <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', mark.tone)}>
          <Icon className="size-3" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
        {live ? 'On the board now' : round.subject.name}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted tabular">
        {live ? `try ${Math.min(round.tryIndex + 1, roundRungs(round))}` : verdict === 'correct' ? `+${points(round.score)}` : `${used} ${used === 1 ? 'try' : 'tries'}`}
      </span>
    </li>
  );
}

/**
 * Does the ledger have more rows than the column can show?
 *
 * A list that is cut off mid-row with no sign of it reads as a bug rather than as a scroll, so the
 * panel fades its bottom edge — but only when there is actually something under it.
 */
function useOverflowing(): [React.RefObject<HTMLUListElement | null>, boolean] {
  const ref = useRef<HTMLUListElement | null>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => setOver(el.scrollHeight - el.clientHeight > 4);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  });
  return [ref, over];
}

/**
 * Desktop sidebar: what this session is, how it is going, and every round of it so far.
 *
 * Every row is FORMAT-AWARE, because the same three numbers mean different things per format: blitz
 * has no round total and exactly one try, survival's ladder shortens as it escalates, and the gauntlet
 * measures itself in franchises. A panel that showed "tries left 1/5" on a blitz run was lying twice.
 *
 * The LEDGER at the bottom is what makes this a panel rather than a caption: one row per round, the
 * ones still to come drawn as dashed slots (the clue rail's idiom), so the card has something to
 * spend a tall column on and the run reads as a run — "2 right, 1 skipped, 7 to go" — instead of
 * `1 / 10` and 400 px of empty glass.
 */
export function SessionPanel({ state, className }: SessionPanelProps) {
  const [ledgerRef, ledgerOverflows] = useOverflowing();
  const liveRef = useRef<HTMLLIElement | null>(null);
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

  // The rounds this run has reached, plus a dashed slot for every one still owed. An endless format
  // (blitz, survival) cannot promise a count, so it shows a single "next up" slot instead.
  const played = state.rounds;
  const toCome = p.total > 0 ? Math.max(0, p.total - played.length) : state.status === 'finished' ? 0 : 1;

  // The run walks down the list; the round you are actually on stays in the column.
  useEffect(() => {
    liveRef.current?.scrollIntoView({ block: 'nearest' });
  }, [state.currentRound, state.id]);

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
        <div className="shrink-0">
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

      <div className="flex shrink-0 flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted">{gauntlet ? 'Board' : survival ? 'Lives' : 'Progress'}</span>
          <span className="font-mono text-fg tabular" data-testid="scout-panel-progress">
            {survival ? `${livesLeft(state) ?? 0}/${scoutLives(settings)} · ${fp.label}` : fp.label}
            {!blitz && !gauntlet && !survival ? ` · ${wonRounds(state)} right` : ''}
          </span>
        </div>
        {!blitz && <ProgressBar value={bar} size="sm" label={undefined} aria-label="Session progress" />}
      </div>

      <dl className="flex shrink-0 flex-col gap-2 text-xs">
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

      <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="scout-run-ledger">
        <div className="flex shrink-0 items-baseline gap-2">
          <h3 className="eyebrow-readable">This run</h3>
          <span className="font-mono text-[11px] text-muted tabular">
            {done > 0 ? `${wonRounds(state)}/${done} named` : 'nothing graded yet'}
          </span>
        </div>
        <ul
          ref={ledgerRef}
          className={cn(
            'flex min-h-0 flex-1 list-none flex-col justify-between gap-1.5 overflow-y-auto',
            ledgerOverflows && '[mask-image:linear-gradient(to_bottom,#000_calc(100%-1.75rem),transparent)]',
          )}
        >
          {played.map((r) => (
            <LedgerRow
              key={r.index}
              round={r}
              live={r.status === 'playing'}
              rowRef={r.index === state.currentRound ? liveRef : undefined}
            />
          ))}
          {Array.from({ length: toCome }, (_unused, i) => (
            <li
              key={`to-come-${i}`}
              className="flex max-h-[6.5rem] min-h-[2.75rem] min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-dashed border-border-strong/60 bg-fg/[0.03] px-2.5 py-1.5 text-muted"
              aria-hidden
              data-testid="scout-ledger-slot"
            >
              <span className="w-4 shrink-0 font-mono text-[11px] tabular">
                {p.total > 0 ? played.length + i + 1 : '·'}
              </span>
              <span className="size-5 shrink-0 rounded-full border border-dashed border-border-strong/60" />
              <span className="truncate font-mono text-[11px] uppercase tracking-[0.14em]">To come</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border pt-3">
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
