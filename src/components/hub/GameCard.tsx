import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

/**
 * Each game owns one of the theme's two lead colours, so the cards read as different worlds in all
 * four themes without inventing a palette: Songooner keeps the house gradient, Highlight Scout takes
 * accent-2 — the same colour that rim-lights its silhouette.
 */
export type GameTone = 'accent' | 'accent-2';

const TAGLINE: Record<GameTone, string> = {
  accent: 'text-accent',
  'accent-2': 'text-accent-2',
};

const PLAY: Record<GameTone, string> = {
  accent: 'bg-gradient-accent text-accent-fg shadow-glow',
  'accent-2': 'bg-accent-2 text-bg shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--sg-accent-2)_75%,transparent)]',
};

export interface GameCardProps {
  /** Ordinal shown in the card's corner slate — "01", "02". */
  index: number;
  /** Short mono kicker next to it: the world this card belongs to. */
  kicker: string;
  name: string;
  tagline: string;
  blurb: string;
  /** Three or four short facts, rendered as chips. */
  facts: readonly string[];
  /**
   * Where this game's content comes from, in a few words. Every tile carries one, so no game on
   * the hub can read as more factual than it is.
   */
  provenance?: string;
  /**
   * Set when any of the game's content is estimated rather than sourced from a live dataset.
   * Rendered as a plain "approximate" note rather than buried, because a player deciding whether
   * to trust a number deserves to know before they play, not after they lose a round to it.
   */
  approximate?: string;
  /** The game's home — where the whole card leads. */
  to: string;
  /** Straight into a game, from the card's own button. */
  playTo: string;
  /** Accessible name for that button, e.g. "Play Songooner now". */
  playLabel: string;
  /** "New" and friends. */
  badge?: string;
  /** Which of the theme's lead colours this game answers to. */
  tone?: GameTone;
  /** The world: `SongoonerArt` / `ScoutArt`, absolutely filling the art block. */
  art: ReactNode;
}

/**
 * One game, one card, two ways in.
 *
 * The whole card is a single link: the `<h2>`'s anchor stretches over the card through a `::before`,
 * which keeps the accessible name short ("Songooner"), leaves exactly one navigation target per
 * game, and still gives a thumb the entire card to hit. The "Play now" control sits above that
 * overlay and is a button, because it does not open a page — it starts a run.
 */
export function GameCard({
  index,
  kicker,
  name,
  tagline,
  blurb,
  facts,
  provenance,
  approximate,
  to,
  playTo,
  playLabel,
  badge,
  tone = 'accent',
  art,
}: GameCardProps) {
  const navigate = useNavigate();
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');

  return (
    <article
      data-testid={`hub-card-${slug}`}
      className="group glass relative flex h-full min-w-0 flex-col overflow-hidden rounded-4xl transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-border-strong hover:shadow-glow-lg focus-within:border-border-strong"
    >
      {/* Art */}
      {/* The art is a band, not a billboard: from `lg` up it gives back the height that was pushing
          "Play now" under the fold of a 900 px laptop. */}
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden border-b border-border sm:aspect-[16/9] lg:aspect-[16/8] 2xl:aspect-[16/9]">
        {art}
        <div className="hub-sweep pointer-events-none absolute inset-0" aria-hidden />
        <div className="hub-card-sheen pointer-events-none absolute inset-x-0 top-0 h-px opacity-60" aria-hidden />
        <span
          className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-lg bg-bg/70 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-fg/80 backdrop-blur"
          aria-hidden
        >
          {String(index).padStart(2, '0')}
          <span className="text-fg/30">/</span>
          {kicker}
        </span>
        {badge && (
          <span className="pointer-events-none absolute right-3 top-3">
            <Badge tone="gradient" dot>
              {badge}
            </Badge>
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-5 sm:p-7 lg:gap-2 lg:p-5 2xl:p-7">
        <h2 className="min-w-0 font-display text-[clamp(1.5rem,7vw,2rem)] font-black leading-none tracking-tight text-fg sm:text-4xl lg:text-3xl 2xl:text-4xl">
          <Link
            to={to}
            aria-describedby={`${slug}-tagline`}
            className="rounded-xl before:absolute before:inset-0 before:z-0 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-2"
          >
            {name}
          </Link>
        </h2>

        <p id={`${slug}-tagline`} className={`text-sm font-semibold sm:text-base ${TAGLINE[tone]}`}>
          {tagline}
        </p>
        <p className="text-sm text-muted">{blurb}</p>

        <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`${name} highlights`}>
          {facts.map((f) => (
            <li
              key={f}
              className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px] font-medium text-fg/75"
            >
              {f}
            </li>
          ))}
        </ul>

        {(provenance || approximate) && (
          <p className="mt-1 text-[11px] leading-snug text-muted">
            {provenance}
            {approximate && (
              <>
                {provenance ? ' · ' : ''}
                <span className="text-warn">{approximate}</span>
              </>
            )}
          </p>
        )}

        {/* Actions sit after the stretched link in the DOM, so they take their own clicks. */}
        <div className="relative z-10 mt-auto flex flex-wrap items-center justify-between gap-3 pt-4 lg:pt-3">
          {/* Decoration: the card's stretched link already goes here, so this passes clicks through. */}
          <span className="pointer-events-none inline-flex items-center gap-1.5 text-sm font-bold text-fg" aria-hidden>
            Open {name}
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
          <button
            type="button"
            onClick={() => navigate(playTo)}
            aria-label={playLabel}
            className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-bold transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent-2 ${PLAY[tone]}`}
          >
            <Zap className="size-4 fill-current" aria-hidden />
            Play now
          </button>
        </div>
      </div>
    </article>
  );
}
