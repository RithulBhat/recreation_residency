import type { ReactNode } from 'react';
import type { GameTone } from '@/components/hub/GameCard';
import { GAME_LABEL, GAME_TAGLINE, R } from '@/routes';
import {
  GameCard,
  HubFooter,
  HubHero,
  InsideStrip,
  SCOUT_PLAYER_COUNT,
  ScoutArt,
  SONGOONER_PACK_COUNT,
  SongoonerArt,
} from '@/components/hub';
import '@/components/hub/hub.css';

interface HubGame {
  kicker: string;
  name: string;
  tagline: string;
  blurb: string;
  facts: readonly string[];
  to: string;
  playTo: string;
  playLabel: string;
  badge?: string;
  tone: GameTone;
  art: ReactNode;
}

/**
 * The two worlds. `?autostart=1` is the lobby's "skip the setup" flag, so the card's Play button
 * really does drop you into a round rather than onto another screen.
 */
const GAMES: readonly HubGame[] = [
  {
    kicker: 'Music',
    name: GAME_LABEL.songooner,
    tagline: GAME_TAGLINE.songooner,
    blurb:
      'A tenth of a second of a song. Name it, or trade points for a longer clip. Classic, blitz, survival, duels, party mode and a daily run.',
    facts: ['0.1s → 10s clips', `${SONGOONER_PACK_COUNT} packs`, 'Duels, party & voice'],
    to: R.songooner.home,
    playTo: `${R.songooner.setup}?autostart=1`,
    playLabel: 'Play Songooner now',
    tone: 'accent',
    art: <SongoonerArt />,
  },
  {
    kicker: 'NFL',
    name: GAME_LABEL.scout,
    tagline: GAME_TAGLINE.scout,
    blurb:
      'A blacked-out headshot, revealed one try at a time. Or an extreme face zoom, a redacted play-by-play, a season stat line, a career path, a logo crop.',
    facts: [`${SCOUT_PLAYER_COUNT.toLocaleString()} players`, '7 clue modes', 'Real play-by-play'],
    to: R.scout.home,
    playTo: `${R.scout.setup}?autostart=1`,
    playLabel: 'Play Highlight Scout now',
    badge: 'New',
    tone: 'accent-2',
    art: <ScoutArt />,
  },
];

/**
 * The front door.
 *
 * A marquee, one card per game — each card its own world, built from the game's own art — a quiet
 * strip of what the house actually holds, and a footer that credits both data sources. Nothing here
 * blocks first paint: the counts are constants (pinned to the real JSON by `counts.test.ts`), the
 * Scout silhouette is a runtime image from ESPN's CORS-enabled CDN, and "welcome back" is read from
 * `localStorage` after mount.
 */
export default function Residency() {
  return (
    <div className="flex flex-col gap-8 pb-2 sm:gap-14">
      <HubHero />

      <section aria-labelledby="hub-games">
        <div className="mb-4 flex items-center gap-3 sm:mb-5">
          <h2
            id="hub-games"
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-muted"
          >
            Select a game
          </h2>
          <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" aria-hidden />
        </div>

        <ul
          className="grid gap-4 lg:grid-cols-2 lg:gap-6"
          data-testid="residency-games"
          aria-labelledby="hub-games"
        >
          {GAMES.map((g, i) => (
            <li key={g.to} className="min-w-0">
              <GameCard
                index={i + 1}
                kicker={g.kicker}
                name={g.name}
                tagline={g.tagline}
                blurb={g.blurb}
                facts={g.facts}
                to={g.to}
                playTo={g.playTo}
                playLabel={g.playLabel}
                badge={g.badge}
                tone={g.tone}
                art={g.art}
              />
            </li>
          ))}
        </ul>
      </section>

      <InsideStrip />

      <HubFooter className="mt-0" />
    </div>
  );
}
