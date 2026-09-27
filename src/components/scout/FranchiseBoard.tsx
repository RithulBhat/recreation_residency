import { Check, X } from 'lucide-react';
import { cn } from '@/components/ui';
import { GAUNTLET_SIZE, franchiseIdOf } from '@/scout/formats';
import { SCOUT_TEAM_META } from '@/scout/packs';
import { franchiseBoard, franchisesCleared, franchisesTotal } from '@/scout/selectors';
import type { Conference, DivisionName, ScoutState } from '@/scout/types';

export type FranchiseState = 'cleared' | 'missed' | 'current' | 'upcoming';

export interface FranchiseBoardProps {
  state: ScoutState;
  /** `board` groups the 32 by division (the aside, the results card); `strip` is one compact row. */
  variant?: 'board' | 'strip';
  className?: string;
}

const CONFERENCES: readonly Conference[] = ['AFC', 'NFC'];
const DIVISIONS: readonly DivisionName[] = ['East', 'North', 'South', 'West'];

/** The 32 in the order a fan reads them, not the order the run plays them. */
const GROUPS = CONFERENCES.flatMap((conf) =>
  DIVISIONS.map((div) => ({
    id: `${conf}-${div}`,
    label: `${conf} ${div}`,
    clubs: SCOUT_TEAM_META.filter((t) => t.conf === conf && t.div === div),
  })),
);

const META_BY_ID = new Map(SCOUT_TEAM_META.map((t) => [t.id, t]));

/** Every franchise's standing on the board, keyed by ESPN team id. */
export function franchiseStates(state: ScoutState): Map<string, FranchiseState> {
  const out = new Map<string, FranchiseState>();
  const live = state.rounds[state.currentRound];
  const liveId = live && live.status === 'playing' ? franchiseIdOf(live.subject) : undefined;
  for (const row of franchiseBoard(state)) {
    out.set(row.teamId, row.cleared ? 'cleared' : row.played ? 'missed' : 'upcoming');
  }
  if (liveId !== undefined) out.set(liveId, 'current');
  return out;
}

const TILE: Record<FranchiseState, string> = {
  cleared: 'border-success/60 text-fg',
  missed: 'border-danger/45 text-muted line-through opacity-70',
  current: 'border-transparent ring-2 ring-accent text-fg shadow-glow',
  upcoming: 'border-border text-fg/80',
};

function tileStyle(accent: string, tone: FranchiseState): { background: string } | undefined {
  if (tone === 'missed') return undefined;
  const pct = tone === 'upcoming' ? 10 : tone === 'cleared' ? 30 : 38;
  return { background: `color-mix(in oklab, ${accent} ${pct}%, var(--sg-surface))` };
}

/**
 * The gauntlet's board: all 32 franchises, which ones are cleared, which one is up right now.
 *
 * In this format the board IS the progress bar — "round 12 of 32" says nothing about which clubs are
 * left — so it is on screen for the whole run (a column in the aside on a laptop, one compact strip
 * on a phone) and again on the results screen.
 */
export function FranchiseBoard({ state, variant = 'board', className }: FranchiseBoardProps) {
  const states = franchiseStates(state);
  const cleared = franchisesCleared(state).length;
  const total = franchisesTotal(state) || GAUNTLET_SIZE;
  // Franchises this run never put on the board at all (a small pool) are not "upcoming".
  const onBoard = new Set(franchiseBoard(state).map((r) => r.teamId));

  if (variant === 'strip') {
    return (
      <section
        className={cn('flex min-w-0 flex-col gap-1.5', className)}
        aria-label={`Gauntlet board — ${cleared} of ${total} franchises cleared`}
        data-testid="scout-franchise-board"
        data-variant="strip"
      >
        <ul className="flex min-w-0 flex-wrap gap-1">
          {franchiseBoard(state).map((row) => {
            const meta = META_BY_ID.get(row.teamId);
            const tone = states.get(row.teamId) ?? 'upcoming';
            return (
              <li
                key={row.teamId}
                data-testid="scout-franchise"
                data-club={meta?.abbr ?? row.teamId}
                data-state={tone}
                title={meta ? `${meta.city} ${meta.name}` : row.teamId}
                className={cn(
                  'grid h-6 min-w-8 place-items-center rounded-md border px-1 font-mono text-[9px] font-bold uppercase tracking-wider',
                  TILE[tone],
                )}
                style={tileStyle(meta?.accent ?? '#a855f7', tone)}
              >
                {meta?.abbr ?? '??'}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section
      className={cn('flex min-w-0 flex-col gap-2.5', className)}
      aria-label={`Gauntlet board — ${cleared} of ${total} franchises cleared`}
      data-testid="scout-franchise-board"
      data-variant="board"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-bold text-fg">The board</h2>
        <span className="font-mono text-xs font-bold text-fg tabular" data-testid="scout-board-count">
          {cleared}
          <span className="text-muted">/{total}</span>
        </span>
      </header>
      <div className="flex min-w-0 flex-col gap-1.5">
        {GROUPS.map((group) => (
          <div key={group.id} className="min-w-0">
            <p className="mb-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{group.label}</p>
            <ul className="grid min-w-0 grid-cols-4 gap-1.5" aria-label={group.label}>
              {group.clubs.map((t) => {
                const tone = states.get(t.id) ?? 'upcoming';
                const off = !onBoard.has(t.id) && tone === 'upcoming';
                return (
                  <li
                    key={t.id}
                    data-testid="scout-franchise"
                    data-club={t.abbr}
                    data-state={off ? 'off' : tone}
                    className={cn(
                      'relative flex min-w-0 items-center justify-center gap-1 rounded-lg border px-1 py-1',
                      TILE[tone],
                      off && 'border-dashed border-border opacity-35',
                    )}
                    style={off ? undefined : tileStyle(t.accent, tone)}
                  >
                    <span aria-hidden className="text-[11px] leading-none">
                      {t.emoji}
                    </span>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{t.abbr}</span>
                    {tone === 'cleared' && <Check className="size-3 shrink-0 text-success" aria-hidden />}
                    {tone === 'missed' && <X className="size-3 shrink-0 text-danger" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
