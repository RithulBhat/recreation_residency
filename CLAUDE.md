# Songooner — project guide

Songooner is a song-guessing game ("name the track from 0.1 seconds"), a much better
Songspot / Heardle. Static single-page app, no backend. Audio + metadata come from
Deezer's public API (JSONP, no key) and Deezer's preview CDN (30s MP3, CORS enabled →
we can decode with Web Audio and apply effects).

## Stack
- Vite 8 + React 19 + TypeScript 7 (strict). Path alias `@/` → `src/`.
- Tailwind CSS v4 (`@import 'tailwindcss'` + `@theme` tokens in `src/index.css`). No tailwind.config.
- `motion` (Framer Motion v12+ API: `import { motion, AnimatePresence } from 'motion/react'`).
- `zustand` v5 stores (`create`, `persist` middleware for saved data).
- `react-router` v7 (HashRouter — required for GitHub Pages). Import from `'react-router'`.
- `lucide-react` icons, `canvas-confetti`, `peerjs` (online duel), `vite-plugin-pwa`.
- Tests: Vitest (jsdom) — `npm test`. E2E: Playwright (`npm run e2e`, tests in `e2e/`).
- Typecheck: `npm run typecheck`. Build: `npm run build`. Dev: `npm run dev` (port 5173).

## Directory map (ownership matters — agents work in parallel)
```
src/types/        Shared contracts. READ ONLY unless explicitly told to extend. 
src/lib/deezer.ts JSONP Deezer client (cache, rate limit, pagination)        [catalog]
src/lib/catalog.ts Resolve packs → Track[] pools, difficulty tiers, dedupe   [catalog]
src/data/packs.ts Curated packs (150+), verified Deezer ids                   [catalog]
src/audio/        Web Audio engine, effects, sfx synth, visualizer analyser  [audio]
src/game/         Pure engine: reducer, matching, scoring, rng, presets, codes [engine]
src/store/        zustand stores: game, settings/prefs, stats, catalog cache  [engine + stats]
src/voice/        SpeechRecognition guessing + SpeechSynthesis host           [voice]
src/net/          PeerJS online duel                                          [net]
src/components/ui Design-system primitives (Button, Slider, Modal, ...)      [design]
src/components/   Feature components (Vinyl, Visualizer, GuessInput, ...)
src/screens/      Route screens (Home, Packs, Setup, Play, Results, Daily, Stats, Duel)
src/hooks/        Reusable hooks
scripts/          Node scripts (verify packs, snapshot)
e2e/              Playwright
```

## Conventions
- Every module has a small public surface; default to named exports. No default exports except screens/App.
- Keep files compiling at all times (write complete files). Only run typecheck/tests for your scope;
  ignore errors in directories you don't own while others are in progress.
- No `any`. Prefer `unknown` + narrowing. Strict null checks are on.
- Pure logic (matching, scoring, reducer, rng) must be framework-free and unit-tested.
- Never store expiring preview URLs in localStorage for longer than 6h; check `previewFetchedAt`.
- Never call Deezer with plain `fetch` (no CORS) — always via `src/lib/deezer.ts` JSONP.
- Respect Deezer rate limit: 50 requests / 5 s. Client queues + caches.
- Accessibility: every control keyboard-reachable, `aria-label` on icon buttons, focus rings visible,
  `prefers-reduced-motion` respected (motion components check `useReducedMotion`).
- Mobile first. Nothing may cause horizontal scroll. Touch targets ≥ 44px.

## Design language ("Midnight Neon", default theme)
- Background `#0b0b12` → deep gradients; surfaces are glass (`bg-white/5 border-white/10 backdrop-blur`).
- Accent gradient: violet `#a855f7` → cyan `#22d3ee` → pink `#f472b6`. Success `#34d399`, danger `#fb7185`, warn `#fbbf24`.
- Fonts: display `Unbounded` (`font-display`), body `Space Grotesk` (`font-sans`), numbers/timers `JetBrains Mono` (`font-mono`).
- Big, bold, playful. Rounded-2xl/3xl cards, generous spacing, glow shadows on primary actions.
- Themes are CSS variables on `<html data-theme="...">`: `midnight` (default), `vinyl` (warm amber/cream),
  `y2k` (chrome/blue/pink), `daylight` (light). Components use tokens (`bg-surface`, `text-fg`, `text-muted`, `bg-accent`), never raw colors.
- Signature elements: spinning vinyl record play button, live waveform visualizer (real AnalyserNode),
  album-art blur reveal, confetti on wins, synthesized sfx.

## Core contracts (src/types) — summary
- `Pack` (curated collection with Deezer `sources`) → resolved to `Track[]` by `catalog.ts`.
- `GameSettings` covers every option: mode, packs, difficulty, clip mode (fixed 0.1–10s or escalating
  stages), tries, rounds, start position, guess target, hints, timer, modifiers (speed/reverse/lofi/bitcrush/pitch),
  blitz duration, lives, players, duel style, voice host, seed/daily.
- `GameState` + `GameAction` → pure `reduce(state, action)` in `src/game/engine.ts`.
- `AudioEngine` (Web Audio) + `Sfx` in `src/audio`.
- `VoiceRecognizer` + `VoiceHost` in `src/voice`.

## Scoring (implemented in src/game/scoring.ts)
base 1000 × clipFactor × tryFactor, + timeBonus (≤25%), + streakBonus (5%/streak, ≤50%), − 15%/hint.
clipFactor: 0.1s→1.0, 0.25→0.85, 0.5→0.7, 1→0.55, 2→0.42, 4→0.3, 7→0.22, 10→0.15 (log-interpolated).
tryFactor: [1, 0.8, 0.65, 0.5, 0.4, 0.3]. Partial (artist-only when target=both) = 30% and consumes a try.
Blitz: correct +1 song +points; wrong −3s. Survival: wrong round −1 life; clip shrinks 15% per correct (min 0.1s).

## Modes
classic (escalating stages), fixed (one clip length), blitz (timed), survival (lives),
duel (2 players same device: buzzer keys A / L, or turns) + online duel over PeerJS (room code),
party (2–8 pass-and-play), daily (seeded `daily-YYYY-MM-DD`, pack of the day), challenge links (`#/c/<code>`).

## Routes (HashRouter)
`/` home · `/packs` browser · `/setup` lobby/settings · `/play` game · `/results` · `/daily` · `/stats` · `/duel` online lobby · `/c/:code` challenge
