/**
 * Every in-app path, once. The app runs on a `HashRouter` (GitHub Pages), so these are the
 * strings after the `#`.
 *
 * The residency hosts two games and each game owns a path prefix — nothing links to a bare
 * `/setup` any more. Import `R` instead of writing a literal, so adding a game (or renaming a
 * screen) is one edit here rather than a grep across the app.
 */

export const R = {
  /** The hub: both games. */
  residency: '/',
  /** Design-system showcase — routed in DEV builds only. */
  gallery: '/gallery',
  songooner: {
    home: '/songooner',
    packs: '/songooner/packs',
    setup: '/songooner/setup',
    play: '/songooner/play',
    results: '/songooner/results',
    daily: '/songooner/daily',
    stats: '/songooner/stats',
    duel: '/songooner/duel',
    /** `<Route>` pattern; build a real link with `challengePath(code)`. */
    challenge: '/songooner/c/:code',
  },
  price: {
    home: '/price',
    setup: '/price/setup',
    play: '/price/play',
    results: '/price/results',
    daily: '/price/daily',
    party: '/price/party',
  },
  hilo: {
    home: '/hilo',
    setup: '/hilo/setup',
    play: '/hilo/play',
    results: '/hilo/results',
    daily: '/hilo/daily',
    party: '/hilo/party',
  },
  scout: {
    home: '/scout',
    setup: '/scout/setup',
    play: '/scout/play',
    results: '/scout/results',
    daily: '/scout/daily',
    stats: '/scout/stats',
    /** `<Route>` pattern; build a real link with `scoutChallengePath(code)`. */
    challenge: '/scout/c/:code',
  },
} as const;

export type GameKey = 'songooner' | 'scout' | 'price' | 'hilo';

export const RESIDENCY_NAME = "Rithul's Recreation Residency";
/** What fits in the top bar next to the game name. */
export const RESIDENCY_SHORT = 'Residency';

export const GAME_LABEL: Record<GameKey, string> = {
  songooner: 'Songooner',
  scout: 'Highlight Scout',
  price: 'Price Guess',
  hilo: 'Higher or Lower',
};

export const GAME_HOME: Record<GameKey, string> = {
  songooner: R.songooner.home,
  scout: R.scout.home,
  price: R.price.home,
  hilo: R.hilo.home,
};

/** A one-line pitch per game — used by the hub cards and the shell. */
export const GAME_TAGLINE: Record<GameKey, string> = {
  songooner: 'Name the track from 0.1 seconds',
  scout: 'Name the NFL player from a silhouette',
  price: 'Guess what it costs, to the dollar',
  hilo: 'One number is hidden. Which way does it go?',
};

/** `/songooner/c/<code>` — the concrete link for a challenge code. */
export function challengePath(code: string): string {
  return `/songooner/c/${code}`;
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Which game a path belongs to — `null` on the hub, the gallery and 404s. */
export function activeGame(pathname: string): GameKey | null {
  if (isUnder(pathname, R.songooner.home)) return 'songooner';
  if (isUnder(pathname, R.scout.home)) return 'scout';
  if (isUnder(pathname, R.price.home)) return 'price';
  if (isUnder(pathname, R.hilo.home)) return 'hilo';
  return null;
}

/** A game's play screen: the shell goes immersive here. */
export function isPlayPath(pathname: string): boolean {
  return (
    pathname === R.songooner.play ||
    pathname === R.scout.play ||
    pathname === R.price.play ||
    pathname === R.hilo.play
  );
}
