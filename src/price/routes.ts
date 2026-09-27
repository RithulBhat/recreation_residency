/**
 * Price Guess route strings, kept LOCAL on purpose.
 *
 * The site's real route table (`src/routes.ts`) exports a `GameKey` union plus four exhaustive
 * `Record<GameKey, …>` maps consumed by `AppShell` and the hub. Adding a key there red-lines
 * files another session owns, so the game is built against these constants and the wiring is
 * handed over as one reviewed commit that adds the key and all four map entries together.
 */

export const PRICE = {
  home: '/price',
  setup: '/price/setup',
  play: '/price/play',
  results: '/price/results',
  daily: '/price/daily',
  stats: '/price/stats',
  party: '/price/party',
} as const;

export const PRICE_LABEL = 'Price Guess';
export const PRICE_TAGLINE = 'Guess what it costs, to the dollar';
