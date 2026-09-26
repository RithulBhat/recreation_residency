import { Link } from 'react-router';
import { R } from '@/routes';
import { cn } from '@/components/ui/cn';

/** Text links stay 16 px tall visually; `touch-hit-44` gives them a 44 px hit area on touch. */
const LINK = 'touch-hit-44 inline-flex items-center hover:text-fg';

/**
 * Highlight Scout's provenance line.
 *
 * The shared `@/components/Footer` credits Deezer and its 30-second audio previews — that is
 * Songooner's data source. Highlight Scout has no audio at all: rosters, headshots and play-by-play
 * come from ESPN's public JSON, baked into `src/data/nfl` at build time by `scripts/sync-nfl.mjs`.
 * Every Scout screen renders this footer so no Scout page can ever claim otherwise.
 */
export function ScoutFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn('mt-16 border-t border-border pb-6 pt-6 text-xs text-muted', className)}
      data-testid="scout-footer"
    >
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="max-w-prose text-center sm:text-left">
          Rosters, headshots and play-by-play from ESPN's public data. Highlight tape from official NFL and club
          YouTube channels.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Footer">
          <Link to={R.scout.setup} className={LINK}>
            Play
          </Link>
          <Link to={R.scout.daily} className={LINK}>
            Daily
          </Link>
          <Link to={R.scout.stats} className={LINK}>
            Stats
          </Link>
          <Link to={R.residency} className={LINK}>
            Residency
          </Link>
        </nav>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted/70 sm:text-left">
        Not affiliated with the NFL or ESPN. Player images and clips belong to their owners.
      </p>
    </footer>
  );
}
