import { GAUNTLET_SIZE } from '@/scout/formats';
import { SCOUT_TEAM_META } from '@/scout/packs';
import { useScoutSettingsStore } from '@/store/scoutStore';
import type { Conference, DivisionName } from '@/scout/types';
import { poolKind } from './summary';

const CONFERENCES: readonly Conference[] = ['AFC', 'NFC'];
const DIVISIONS: readonly DivisionName[] = ['East', 'North', 'South', 'West'];

/** The 32 franchises in the order a fan reads them: conference, then division. */
const BOARD = CONFERENCES.flatMap((conf) =>
  DIVISIONS.map((div) => ({
    id: `${conf}-${div}`,
    label: `${conf} ${div}`,
    clubs: SCOUT_TEAM_META.filter((t) => t.conf === conf && t.div === div),
  })),
);

/**
 * The gauntlet's pool, which is not a pack selection at all: one subject from each of the 32
 * franchises, in an order fixed by the run's seed. It takes the pack picker's place in the lobby so
 * the format never shows a control it ignores (`normalizeScoutSettings` overwrites `packIds` for the
 * gauntlet — it needs league-wide coverage to fill the board), and it is the actual board you are
 * about to clear, laid out by division and in club colours.
 */
export function ScoutGauntletBoard() {
  const settings = useScoutSettingsStore((s) => s.settings);
  const kind = poolKind(settings);

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="scout-gauntlet-board">
      <p className="text-sm text-muted">
        No packs to pick — the board is the whole league.{' '}
        {kind === 'team'
          ? 'Every round names a different franchise.'
          : kind === 'mixed'
            ? 'Every round deals a player or a franchise from a club you have not played yet.'
            : 'Every round deals a player from a club you have not played yet.'}
      </p>

      <div className="flex min-w-0 flex-col gap-2.5" role="group" aria-label={`All ${GAUNTLET_SIZE} franchises`}>
        {BOARD.map((group) => (
          <div key={group.id} className="min-w-0">
            <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              {group.label}
            </p>
            <ul className="grid min-w-0 grid-cols-4 gap-1.5" aria-label={group.label}>
              {group.clubs.map((t) => (
                <li
                  key={t.id}
                  data-club={t.abbr}
                  className="flex min-w-0 items-center gap-1.5 rounded-xl border border-border px-2 py-1.5"
                  style={{ background: `color-mix(in oklab, ${t.accent} 26%, var(--sg-surface))` }}
                >
                  <span aria-hidden className="text-base leading-none">
                    {t.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-fg">
                      {t.abbr}
                    </span>
                    <span className="block truncate text-[10px] leading-tight text-fg/70">{t.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="font-mono text-xs tabular text-muted" data-testid="scout-pool-line">
        <span className="font-bold text-fg">{GAUNTLET_SIZE} franchises</span> on the board · one subject each ·
        seeded order
      </p>
    </div>
  );
}
