/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves the site from /songooner/ — set VITE_BASE to override.
const base = process.env.VITE_BASE ?? '/';

/**
 * The lazy JSON chunks Highlight Scout loads on demand. Vite names a chunk after the module it
 * came from, so `src/data/nfl/players.json` lands at `assets/players-<hash>.js`. Kept out of the
 * service worker's precache (see the `workbox` block) — together they are ~1.7 MB.
 */
const DATA_CHUNKS = ['players', 'highlights', 'statlines', 'teams', 'clips'] as const;

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Songooner',
        short_name: 'Songooner',
        description: 'Name the track from 0.1 seconds. The song guessing game that goes harder.',
        theme_color: '#0b0b12',
        background_color: '#0b0b12',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Never cache Deezer/iTunes responses — preview URLs expire.
        navigateFallbackDenylist: [/^\/api/],
        /**
         * The NFL payloads are ~1.7 MB of JSON (players 805 kB, highlights 804 kB, plus statlines,
         * teams and clips) and they are already correctly code-split: the entry chunk does not
         * import them, so nothing but Highlight Scout ever pulls them. Precaching them anyway made
         * every first-time visitor — including someone who only ever opens Songooner — download all
         * 1.7 MB before the service worker would install.
         *
         * They are excluded from the precache manifest and picked up by the runtime rule below
         * instead, so the first Scout round still fills the cache and offline play keeps working
         * from the second visit on. Safe because the filenames are content-hashed: a rebuilt
         * payload is a new URL, so `CacheFirst` can never serve stale data.
         */
        globIgnores: [DATA_CHUNKS.map((name) => `assets/${name}-*.js`)].flat(),
        runtimeCaching: [
          {
            urlPattern: new RegExp(`/assets/(?:${DATA_CHUNKS.join('|')})-[\\w-]+\\.js$`),
            handler: 'CacheFirst',
            options: {
              cacheName: 'nfl-data',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { include: ['peerjs'] },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { sourcemap: false, target: 'es2022' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
