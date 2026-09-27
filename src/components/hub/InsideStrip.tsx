import { Disc3, Film, Receipt, ScanFace, Sigma, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  SCOUT_CLIP_COUNT,
  SCOUT_PLAY_COUNT,
  SCOUT_PLAYER_COUNT,
  SCOUT_TEAM_COUNT,
  SONGOONER_PACK_COUNT,
  SONGOONER_TRACK_FLOOR,
  HILO_ITEM_COUNT,
  PRICE_ITEM_COUNT,
} from './counts';

interface Fact {
  value: string;
  label: string;
  hint: string;
  icon: ReactNode;
}

/**
 * Real numbers only — every one of these is asserted against the shipped data files in
 * `counts.test.ts`, so the strip cannot quietly become marketing.
 */
const FACTS: readonly Fact[] = [
  {
    value: SONGOONER_PACK_COUNT.toLocaleString(),
    label: 'song packs',
    hint: `${SONGOONER_TRACK_FLOOR.toLocaleString()}+ tracks`,
    icon: <Disc3 />,
  },
  {
    value: SCOUT_PLAYER_COUNT.toLocaleString(),
    label: 'NFL players',
    hint: `all ${SCOUT_TEAM_COUNT} teams`,
    icon: <ScanFace />,
  },
  {
    value: SCOUT_PLAY_COUNT.toLocaleString(),
    label: 'real plays',
    hint: 'names redacted',
    icon: <Sigma />,
  },
  {
    value: SCOUT_CLIP_COUNT.toLocaleString(),
    label: 'video clips',
    hint: 'official channels',
    icon: <Film />,
  },
  {
    value: HILO_ITEM_COUNT.toLocaleString(),
    label: 'sourced figures',
    hint: 'World Bank, ESPN, Deezer',
    icon: <TrendingUp />,
  },
  {
    value: PRICE_ITEM_COUNT.toLocaleString(),
    label: 'priced things',
    // Said plainly here too, so the one approximate number on the strip is never mistaken for
    // the sourced ones beside it.
    hint: 'hand-written estimates',
    icon: <Receipt />,
  },
];

/**
 * The quiet strip: what the house actually holds. Deliberately typographic rather than a row of
 * stat cards — the game cards above it are the loud part of the page.
 */
export function InsideStrip() {
  return (
    <section aria-labelledby="hub-inside" data-testid="hub-inside">
      <h2 id="hub-inside" className="sr-only">
        What the residency holds
      </h2>
      <div className="glass grid grid-cols-2 overflow-hidden rounded-3xl sm:grid-cols-4">
        {FACTS.map((f, i) => (
          <div
            key={f.label}
            className={[
              'flex min-w-0 flex-col gap-1 p-4 sm:p-5',
              // Hairlines between cells only — never around the outside of the strip.
              i % 2 === 1 ? 'border-l border-border' : '',
              i >= 2 ? 'border-t border-border sm:border-t-0' : '',
              i >= 1 ? 'sm:border-l sm:border-border' : 'sm:border-l-0',
            ].join(' ')}
          >
            <span className="text-muted [&>svg]:size-4" aria-hidden>
              {f.icon}
            </span>
            <span className="font-mono text-2xl font-semibold leading-none tabular text-fg sm:text-3xl">
              {f.value}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {f.label}
            </span>
            <span className="text-xs text-muted/80">{f.hint}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted/70 sm:text-left">
        Counts come straight from the data the games ship with — {SONGOONER_PACK_COUNT} verified
        Deezer packs and a baked ESPN roster snapshot.
      </p>
    </section>
  );
}
