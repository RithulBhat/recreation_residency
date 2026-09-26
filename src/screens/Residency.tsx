import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Disc3, ScanFace } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeading } from '@/components/SectionHeading';
import { Footer } from '@/components/Footer';
import { GAME_LABEL, GAME_TAGLINE, R, RESIDENCY_NAME } from '@/routes';

interface ResidencyGame {
  to: string;
  name: string;
  tagline: string;
  blurb: string;
  icon: ReactNode;
  badge?: string;
}

const GAMES: readonly ResidencyGame[] = [
  {
    to: R.songooner.home,
    name: GAME_LABEL.songooner,
    tagline: GAME_TAGLINE.songooner,
    blurb: 'Thousands of songs, 220 packs, any clip from 0.1 to 10 seconds. Classic, blitz, survival, duels and a daily run.',
    icon: <Disc3 />,
  },
  {
    to: R.scout.home,
    name: GAME_LABEL.scout,
    tagline: GAME_TAGLINE.scout,
    blurb: 'Silhouettes, face zooms, redacted play-by-play and team trivia — real NFL rosters, revealed one clue at a time.',
    icon: <ScanFace />,
    badge: 'New',
  },
];

/**
 * The hub. Deliberately structural: one h1, one line of copy, one card per game. The visual pass
 * lands on top of this skeleton, so everything here is a design-system primitive on semantic tokens.
 */
export default function Residency() {
  return (
    <div className="flex flex-col gap-8 pb-4 sm:gap-12">
      {/* Left-aligned like every other screen title. `align="center"` is not used: SectionHeading's
          centred variant still resolves to `align-items: flex-end` in the generated CSS. */}
      <SectionHeading
        as="h1"
        size="lg"
        eyebrow="Two games, one house"
        title={<span id="residency-title">{RESIDENCY_NAME}</span>}
        description="Guess songs from a heartbeat of audio, or name the NFL player behind the silhouette. Free, no sign-up, nothing to install."
      />

      <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5" aria-labelledby="residency-title" data-testid="residency-games">
        {GAMES.map((g) => (
          <li key={g.to} className="min-w-0">
            <Link
              to={g.to}
              className="group block h-full rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-2"
            >
              <Card interactive padding="lg" className="flex h-full min-w-0 flex-col items-start gap-3">
                <div className="flex w-full min-w-0 items-start justify-between gap-3">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent [&>svg]:size-7" aria-hidden>
                    {g.icon}
                  </span>
                  {g.badge && (
                    <Badge tone="accent" dot>
                      {g.badge}
                    </Badge>
                  )}
                </div>
                <h2 className="min-w-0 font-display text-2xl font-black tracking-tight text-fg sm:text-3xl">{g.name}</h2>
                <p className="text-sm font-semibold text-accent">{g.tagline}</p>
                <p className="text-sm text-muted">{g.blurb}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-bold text-fg">
                  Play {g.name}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <Footer className="mt-0" />
    </div>
  );
}
