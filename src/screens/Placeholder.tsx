import type { ReactNode } from 'react';
import { useLocation, useParams } from 'react-router';
import { CalendarDays, ChartColumn, ChevronLeft, Home, Library, Link2, Play, ScanFace, SearchX, Settings2, Swords, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Kbd } from '@/components/ui/Kbd';
import { R, activeGame } from '@/routes';

interface RouteMeta {
  title: string;
  blurb: string;
  icon: ReactNode;
}

/** Every Highlight Scout screen lands on the same friendly holding card until its screen ships. */
const SCOUT_SOON: RouteMeta = {
  title: 'Highlight Scout is warming up',
  blurb:
    'Silhouettes, extreme face zooms, redacted play-by-play and team trivia — the NFL guessing game is being wired to real rosters right now. It lands here shortly.',
  icon: <ScanFace />,
};

const ROUTES: Record<string, RouteMeta> = {
  [R.songooner.packs]: { title: 'Pack browser', blurb: 'Browse 150+ curated packs, search, filter by category and mix them into one pool.', icon: <Library /> },
  [R.songooner.setup]: { title: 'Game setup', blurb: 'Choose a mode, packs, difficulty, clip length, tries, timer and modifiers. Then hit play.', icon: <Settings2 /> },
  [R.songooner.play]: { title: 'Play', blurb: 'The record, the visualizer, the guess box. Where the magic happens.', icon: <Play /> },
  [R.songooner.results]: { title: 'Results', blurb: 'Score breakdown, streaks, every track you heard and a share card.', icon: <Trophy /> },
  [R.songooner.daily]: { title: 'Daily challenge', blurb: 'One seeded run per day with the pack of the day. Compare with friends.', icon: <CalendarDays /> },
  [R.songooner.stats]: { title: 'Stats', blurb: 'Lifetime accuracy, best streaks, favourite packs and your fastest guesses.', icon: <ChartColumn /> },
  [R.songooner.duel]: { title: 'Online duel', blurb: 'Create a room, share the code, and buzz in against a friend anywhere.', icon: <Swords /> },
  '/songooner/c': { title: 'Challenge', blurb: 'A friend sent you a challenge. Same songs, same rules — beat their score.', icon: <Link2 /> },
};

export interface PlaceholderProps {
  name?: string;
  blurb?: string;
  icon?: ReactNode;
}

/**
 * Two jobs: a "coming online" card for a route that is known but not built yet, and the 404. Only
 * a known route gets the optimistic badge — an unknown address is a dead end and says so.
 */
export default function Placeholder({ name, blurb, icon }: PlaceholderProps) {
  const { pathname } = useLocation();
  const params = useParams();
  const game = activeGame(pathname);
  const meta = game === 'scout' ? SCOUT_SOON : ROUTES[pathname.startsWith('/songooner/c/') ? '/songooner/c' : pathname];
  const known = meta !== undefined;
  const title = name ?? meta?.title ?? 'Lost track';
  const text = blurb ?? meta?.blurb ?? "There's nothing at this address — it may have moved, or the link got cut off. The games are this way.";
  const glyph = icon ?? meta?.icon ?? <SearchX />;

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center py-10 text-center">
      <Card padding="lg" className="w-full overflow-hidden" glow={known}>
        <div
          className={`pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-20 blur-3xl ${known ? 'bg-accent-vivid' : 'bg-danger'}`}
          aria-hidden
        />
        <div className="relative flex flex-col items-center">
          {known ? (
            <Badge tone="accent" dot className="mb-5">
              Coming online
            </Badge>
          ) : (
            <Badge tone="danger" className="mb-5">
              404 · Not found
            </Badge>
          )}
          <div
            className={`grid size-16 place-items-center rounded-3xl [&>svg]:size-7 ${known ? 'bg-gradient-accent text-accent-fg shadow-glow' : 'bg-danger/15 text-danger'}`}
            aria-hidden
          >
            {glyph}
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold text-fg sm:text-4xl">{title}</h1>
          {import.meta.env.DEV && (
            <p className="mt-2 font-mono text-xs text-muted">
              <Kbd size="sm">#{pathname}</Kbd>
              {params.code && (
                <>
                  {' '}
                  · code <span className="text-fg">{params.code}</span>
                </>
              )}
            </p>
          )}
          <p className="mt-4 max-w-sm text-sm text-muted">{text}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button to={R.residency} variant="secondary" leadingIcon={game === 'scout' ? <ChevronLeft /> : <Home />}>
              Residency
            </Button>
            <Button to={R.songooner.setup} leadingIcon={<Play className="fill-current" />}>
              {game === 'scout' ? 'Play Songooner' : 'Play'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
