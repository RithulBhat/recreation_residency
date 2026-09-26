import { Link, useLocation } from 'react-router';
import { Heart } from 'lucide-react';
import { GAME_LABEL, R, activeGame } from '@/routes';
import { LogoGlyph } from './Logo';
import { cn } from './ui/cn';

/** Text links stay 16 px tall visually; `touch-hit-44` gives them a 44 px hit area on touch. */
const LINK = 'touch-hit-44 inline-flex items-center hover:text-fg';

/** The footer links wherever you already are: a game's own screens, or both games from the hub. */
function footerLinks(pathname: string): readonly { to: string; label: string }[] {
  const game = activeGame(pathname);
  if (game === 'scout') {
    return [
      { to: R.scout.setup, label: 'Play' },
      { to: R.scout.daily, label: 'Daily' },
      { to: R.scout.stats, label: 'Stats' },
    ];
  }
  if (game === 'songooner') {
    return [
      { to: R.songooner.packs, label: 'Packs' },
      { to: R.songooner.daily, label: 'Daily' },
      { to: R.songooner.stats, label: 'Stats' },
    ];
  }
  return [
    { to: R.songooner.home, label: GAME_LABEL.songooner },
    { to: R.scout.home, label: GAME_LABEL.scout },
  ];
}

export function Footer({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const links = footerLinks(pathname);
  return (
    <footer className={cn('mt-16 border-t border-border pt-6 pb-6 text-xs text-muted', className)}>
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2">
          <LogoGlyph size={18} />
          <span>
            Made with <Heart className="inline size-3 fill-current text-accent-3" aria-label="love" /> — audio previews via Deezer.
          </span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Footer">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={LINK}>
              {l.label}
            </Link>
          ))}
          {/* The design-system showcase is a dev tool; it is not routed in production builds. */}
          {import.meta.env.DEV && (
            <Link to={R.gallery} className={LINK}>Gallery</Link>
          )}
        </nav>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted/70 sm:text-left">
        Not affiliated with Deezer. 30-second previews are streamed on demand and never stored.
      </p>
    </footer>
  );
}
