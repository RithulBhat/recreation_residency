/** Higher or Lower route strings, kept local until the wiring commit adds the GameKey. */
export const HILO = {
  home: '/hilo',
  setup: '/hilo/setup',
  play: '/hilo/play',
  results: '/hilo/results',
  daily: '/hilo/daily',
  stats: '/hilo/stats',
  party: '/hilo/party',
} as const;

export const HILO_LABEL = 'Higher or Lower';
export const HILO_TAGLINE = 'One number is hidden. Which way does it go?';
