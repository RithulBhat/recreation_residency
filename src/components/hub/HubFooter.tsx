import { Link } from 'react-router';
import { Heart } from 'lucide-react';
import { GAME_LABEL, R, RESIDENCY_NAME } from '@/routes';
import { LogoGlyph } from '@/components/Logo';
import { cn } from '@/components/ui/cn';

/** 16 px text, 44 px hit area on a touch screen. */
const LINK = 'touch-hit-44 inline-flex items-center hover:text-fg';

/**
 * The hub's own footer. The shared `Footer` credits Deezer because every screen it appears on is a
 * Songooner screen; the front door has to credit both sources, so it says its own piece.
 */
/** Derived, so the footer cannot go on claiming a two-game arcade once there are four. */
const GAME_COUNT = Object.keys(GAME_LABEL).length;

export function HubFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t border-border pt-6 pb-6 text-xs text-muted', className)}>
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex max-w-md items-start gap-2.5 text-center sm:text-left">
          <LogoGlyph size={20} className="mt-0.5 hidden sm:block" />
          <p>
            <span className="font-semibold text-fg">{RESIDENCY_NAME}</span> — a {GAME_COUNT}-game arcade built
            by Rithul for the fun of building it. No accounts, no ads, nothing stored on a server.
            Made with <Heart className="inline size-3 fill-current text-accent-3" aria-label="love" />.
          </p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Footer">
          <Link to={R.songooner.home} className={LINK}>
            {GAME_LABEL.songooner}
          </Link>
          <Link to={R.scout.home} className={LINK}>
            {GAME_LABEL.scout}
          </Link>
          <Link to={R.price.home} className={LINK}>
            {GAME_LABEL.price}
          </Link>
          <Link to={R.hilo.home} className={LINK}>
            {GAME_LABEL.hilo}
          </Link>
          {/* The design-system showcase is a dev tool; it is not routed in production builds. */}
          {import.meta.env.DEV && (
            <Link to={R.gallery} className={LINK}>
              Gallery
            </Link>
          )}
        </nav>
      </div>
      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted/70 sm:text-left">
        Audio previews come from Deezer. NFL rosters, headshots, team logos and play-by-play come
        from ESPN; highlight videos are embedded from official NFL and team YouTube channels.
        Country populations, economies and land area come from the World Bank. Price Guess&rsquo;s
        figures are written by hand and are approximate, not sourced. Not
        affiliated with Deezer, ESPN, YouTube, the World Bank or the NFL. Previews stream on demand and are never
        stored.
      </p>
    </footer>
  );
}
