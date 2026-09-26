import { Link } from 'react-router';
import { Heart } from 'lucide-react';
import { LogoGlyph } from './Logo';
import { cn } from './ui/cn';

/** Text links stay 16 px tall visually; `touch-hit-44` gives them a 44 px hit area on touch. */
const LINK = 'touch-hit-44 inline-flex items-center hover:text-fg';

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn('mt-16 border-t border-border pt-6 pb-6 text-xs text-muted', className)}>
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2">
          <LogoGlyph size={18} />
          <span>
            Made with <Heart className="inline size-3 fill-current text-accent-3" aria-label="love" /> — audio previews via Deezer.
          </span>
        </div>
        <nav className="flex items-center gap-4" aria-label="Footer">
          <Link to="/packs" className={LINK}>Packs</Link>
          <Link to="/daily" className={LINK}>Daily</Link>
          <Link to="/stats" className={LINK}>Stats</Link>
          {/* The design-system showcase is a dev tool; it is not routed in production builds. */}
          {import.meta.env.DEV && (
            <Link to="/gallery" className={LINK}>Gallery</Link>
          )}
        </nav>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted/70 sm:text-left">
        Not affiliated with Deezer. 30-second previews are streamed on demand and never stored.
      </p>
    </footer>
  );
}
