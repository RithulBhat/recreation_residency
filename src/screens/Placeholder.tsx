import type { ReactNode } from 'react';
import { useLocation, useParams } from 'react-router';
import { CalendarDays, ChartColumn, Disc3, Home, Library, Link2, Play, Settings2, Swords, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Kbd } from '@/components/ui/Kbd';

interface RouteMeta {
  title: string;
  blurb: string;
  icon: ReactNode;
}

const ROUTES: Record<string, RouteMeta> = {
  '/packs': { title: 'Pack browser', blurb: 'Browse 150+ curated packs, search, filter by category and mix them into one pool.', icon: <Library /> },
  '/setup': { title: 'Game setup', blurb: 'Choose a mode, packs, difficulty, clip length, tries, timer and modifiers. Then hit play.', icon: <Settings2 /> },
  '/play': { title: 'Play', blurb: 'The record, the visualizer, the guess box. Where the magic happens.', icon: <Play /> },
  '/results': { title: 'Results', blurb: 'Score breakdown, streaks, every track you heard and a share card.', icon: <Trophy /> },
  '/daily': { title: 'Daily challenge', blurb: 'One seeded run per day with the pack of the day. Compare with friends.', icon: <CalendarDays /> },
  '/stats': { title: 'Stats', blurb: 'Lifetime accuracy, best streaks, favourite packs and your fastest guesses.', icon: <ChartColumn /> },
  '/duel': { title: 'Online duel', blurb: 'Create a room, share the code, and buzz in against a friend anywhere.', icon: <Swords /> },
  '/c': { title: 'Challenge', blurb: 'A friend sent you a challenge. Same songs, same rules — beat their score.', icon: <Link2 /> },
};

export interface PlaceholderProps {
  name?: string;
  blurb?: string;
  icon?: ReactNode;
}

export default function Placeholder({ name, blurb, icon }: PlaceholderProps) {
  const { pathname } = useLocation();
  const params = useParams();
  const key = pathname.startsWith('/c/') ? '/c' : pathname;
  const meta = ROUTES[key];
  const title = name ?? meta?.title ?? 'Not found';
  const text = blurb ?? meta?.blurb ?? 'This route does not exist (yet). Try one of the links below.';
  const glyph = icon ?? meta?.icon ?? <Disc3 />;

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center py-10 text-center">
      <Card padding="lg" className="w-full overflow-hidden" glow>
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent opacity-20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col items-center">
          <Badge tone="accent" dot className="mb-5">
            Coming online
          </Badge>
          <div className="grid size-16 place-items-center rounded-3xl bg-gradient-accent text-accent-fg shadow-glow [&>svg]:size-7" aria-hidden>
            {glyph}
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold text-fg sm:text-3xl">{title}</h1>
          <p className="mt-2 font-mono text-xs text-muted">
            <Kbd size="sm">#{pathname}</Kbd>
            {params.code && (
              <>
                {' '}
                · code <span className="text-fg">{params.code}</span>
              </>
            )}
          </p>
          <p className="mt-4 max-w-sm text-sm text-muted">{text}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button to="/" variant="secondary" leadingIcon={<Home />}>
              Home
            </Button>
            <Button to="/setup" leadingIcon={<Play className="fill-current" />}>
              Play
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
