import { useState } from 'react';
import { headshotUrl } from '@/data/nfl';

/**
 * Eight of the dataset's highest-`fame` athletes, by ESPN id, all verified present in
 * `src/data/nfl/players.json` with an NFL headshot. Ids only: the card shows a silhouette, so
 * naming anyone would give the game away — and a bare id cannot go stale the way a name can.
 */
const SILHOUETTE_IDS = [
  '3918298',
  '3139477',
  '4362628',
  '3117251',
  '3916387',
  '3915511',
  '4040715',
  '4241389',
] as const;

/** Rotates once a day, so the front door is not the same face every visit. */
export function silhouetteId(now: Date = new Date()): string {
  const day = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  const i = ((day % SILHOUETTE_IDS.length) + SILHOUETTE_IDS.length) % SILHOUETTE_IDS.length;
  return SILHOUETTE_IDS[i] ?? SILHOUETTE_IDS[0];
}

/** Broadcast reticle: four corner brackets around the monitor. */
function Brackets() {
  const corner = 'absolute size-4 border-accent-2/70 sm:size-5';
  return (
    <>
      <span className={`${corner} left-2 top-2 border-l-2 border-t-2`} />
      <span className={`${corner} right-2 top-2 border-r-2 border-t-2`} />
      <span className={`${corner} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${corner} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  );
}

/** Chalk play diagram — two blockers, a defender and the receiver's route. */
function RouteChalk({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" fill="none" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 70 V44 L38 20" strokeDasharray="5 5" />
        <path d="M38 20 l-6 2 m6 -2 l-2 6" />
        <circle cx="14" cy="70" r="5" />
        <path d="M58 66 l10 10 M68 66 l-10 10" />
        <path d="M88 64 l10 10 M98 64 l-10 10" />
        <path d="M104 24 a10 10 0 1 0 0.01 0" strokeDasharray="4 6" />
      </g>
    </svg>
  );
}

/** Stand-in shape for the (rare) case where ESPN's CDN does not answer. */
function BustFallback() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
      <g fill="currentColor">
        <circle cx="50" cy="38" r="21" />
        <path d="M50 62c-19 0-32 12-35 30h70c-3-18-16-30-35-30Z" />
      </g>
    </svg>
  );
}

/**
 * Highlight Scout's world: a chalkboard marked out like a field, a broadcast monitor dead centre,
 * and inside it a REAL blacked-out ESPN headshot under the treatment from the game's visual spec —
 * head crop, `brightness(0)`, rim lit in accent-2 so the hairline and jaw carry the shape. No mock:
 * this is the same picture the silhouette round draws.
 */
export function ScoutArt() {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const id = silhouetteId();

  return (
    <div className="hub-stage-scout @container pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Field: hash marks above and below the numbers. */}
      <div className="hub-hashes absolute inset-x-0 top-[22%] h-1.5 opacity-60" />
      <div className="hub-hashes absolute inset-x-0 bottom-[24%] h-1.5 opacity-60" />

      {/* Chalk play, drifting behind the monitor. */}
      <RouteChalk className="absolute left-[2%] bottom-[12%] w-[30%] text-fg/25" />

      {/* Yard numbers, the way a broadcast camera catches them. */}
      <span className="absolute left-[3%] top-1/2 -translate-y-1/2 select-none font-display text-[11cqw] font-black leading-none text-fg/[0.09]">
        40
      </span>
      <span className="absolute right-[3%] top-1/2 -translate-y-1/2 select-none font-display text-[11cqw] font-black leading-none text-fg/[0.09]">
        50
      </span>

      {/* The monitor. */}
      {/* Sits a touch above centre so the lower third has room under it. */}
      <div className="absolute inset-0 grid place-items-center pb-[6%]">
        <div className="hub-monitor relative aspect-square h-[74%] max-w-[86%] overflow-hidden rounded-2xl border border-border-strong shadow-card sm:h-[78%]">
          {failed ? (
            <div className="absolute inset-0 text-fg/85">
              <BustFallback />
            </div>
          ) : (
            <img
              src={headshotUrl(id)}
              alt=""
              draggable={false}
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className="hub-silhouette transition-opacity duration-500"
              style={{ opacity: loaded ? undefined : 0 }}
            />
          )}
          {/* Scan line + vignette, so the monitor reads as a monitor. */}
          <div className="absolute inset-x-0 top-[38%] h-px bg-accent-2/20" />
          <div className="absolute inset-0 rounded-2xl shadow-[inset_0_0_40px_-8px_rgb(0_0_0/0.55)]" />
          <Brackets />
        </div>
      </div>

      {/* Lower third. */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <span className="glass-strong inline-flex items-center gap-2 rounded-lg px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fg">
          <span className="size-1.5 rounded-full bg-danger" />
          Scouting report
        </span>
        {/* The answer, redacted — the same bar the play-by-play mode blacks names out with. */}
        <span className="flex items-center gap-1.5 pb-1" aria-hidden>
          <span className="h-2.5 w-8 rounded-sm bg-fg/35" />
          <span className="h-2.5 w-12 rounded-sm bg-fg/35" />
        </span>
      </div>
    </div>
  );
}
