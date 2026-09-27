import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_HOME, GAME_LABEL, GAME_TAGLINE, R, activeGame, isPlayPath, type GameKey } from '@/routes';
import { GAME_NAV, mobileCols } from '@/components/AppShell';

/**
 * Adding a game to the residency touches more than the router, and almost every coupling point
 * fails SILENTLY — a wrong mobile grid, a 404 screen where the game should be, an accessibility
 * guard that skips the new routes instead of checking them. Only the exhaustive `Record<GameKey,…>`
 * maps are caught by the compiler.
 *
 * So this file is the compiler for everything else. A game that is registered but not fully wired
 * fails here rather than shipping broken. Every assertion is derived from `GameKey`, so a new game
 * is picked up automatically and nobody has to remember to read a checklist.
 */

const GAMES = Object.keys(GAME_LABEL) as GameKey[];

/** Every path the app can route to, per game, read off the one source of truth in `routes.ts`. */
const routesFor = (game: GameKey): string[] =>
  Object.values(R[game] as Record<string, string>).filter((p) => typeof p === 'string');

const e2eSource = (): string =>
  readFileSync(resolve(__dirname, '../e2e/visual.spec.ts'), 'utf8');

/** The literal route strings inside a named array in the visual spec. */
function e2eRouteArray(name: string): string[] {
  const src = e2eSource();
  const start = src.indexOf(`const ${name} = [`);
  expect(start, `${name} should exist in e2e/visual.spec.ts`).toBeGreaterThan(-1);
  const end = src.indexOf('];', start);
  return [...src.slice(start, end).matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
}

describe('every registered game is fully wired', () => {
  it('registers at least the two shipped games', () => {
    expect(GAMES).toContain('songooner');
    expect(GAMES).toContain('scout');
  });

  it.each(GAMES)('%s has a label, a home, a tagline and a routes table', (game) => {
    expect(GAME_LABEL[game]?.trim()).toBeTruthy();
    expect(GAME_TAGLINE[game]?.trim()).toBeTruthy();
    expect(GAME_HOME[game]).toMatch(/^\//);
    expect(routesFor(game).length).toBeGreaterThan(0);
  });

  it.each(GAMES)('%s owns every one of its routes via activeGame()', (game) => {
    for (const path of routesFor(game)) {
      // `:code` patterns are Route templates; substitute something concrete to resolve them.
      const concrete = path.replace(/:\w+/g, 'abc123');
      expect(activeGame(concrete), `${concrete} should belong to ${game}`).toBe(game);
    }
  });

  it.each(GAMES)('%s has nav entries that point at its own routes', (game) => {
    const nav = GAME_NAV[game];
    expect(nav.length, `${game} needs at least one nav tab`).toBeGreaterThan(0);
    for (const item of nav) {
      expect(item.label.trim()).toBeTruthy();
      expect(activeGame(item.to), `nav "${item.label}" should stay inside ${game}`).toBe(game);
    }
  });

  it.each(GAMES)('%s lays its mobile tab bar out correctly', (game) => {
    // The bar renders Home plus the game's tabs. A lookup miss used to fall back to a five-column
    // grid with no error, so any nav length other than 4 or 5 was silently mis-laid-out.
    const columns = 1 + GAME_NAV[game].length;
    expect(mobileCols(columns)).toBe(`grid-cols-${Math.min(6, Math.max(2, columns))}`);
  });

  it.each(GAMES)('%s engages the immersive shell on its play screen', (game) => {
    const play = (R[game] as Record<string, string>).play;
    expect(play, `${game} should declare a play route`).toBeTruthy();
    expect(isPlayPath(play), `isPlayPath must know ${play} or the header never hides`).toBe(true);
  });
});

describe('the visual guards actually cover every game', () => {
  // A route missing from these arrays is skipped rather than failed, which is the worse outcome:
  // the 320px overflow, single-h1 and duplicate-id checks silently stop covering that screen.
  const ARRAYS = ['NARROW_ROUTES', 'H1_ROUTES', 'DUPLICATE_ID_ROUTES'] as const;

  it.each(ARRAYS)('%s includes at least one route from every game', (arrayName) => {
    const listed = e2eRouteArray(arrayName);
    for (const game of GAMES) {
      const home = GAME_HOME[game];
      const covered = listed.some((entry) => entry.includes(home.replace(/^\//, '')));
      expect(covered, `${arrayName} should cover ${game} (${home})`).toBe(true);
    }
  });

  it('checks the hub itself, not only the games', () => {
    for (const arrayName of ARRAYS) {
      const listed = e2eRouteArray(arrayName);
      expect(listed.length, `${arrayName} should not be empty`).toBeGreaterThan(0);
    }
  });
});
