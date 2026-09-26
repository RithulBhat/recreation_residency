# Rithul's Recreation Residency — project guide

One static SPA hosting two games behind a hub page ("Rithul's Recreation Residency"):
**Songooner** (guess the song) and **Highlight Scout** (guess the NFL player/team).
Shared: design system (`src/components/ui`), themes, hooks, sfx, confetti, fuzzy matching,
seeded RNG, scoring maths, stats/achievements, challenge links, daily runs.

## Songooner

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
src/data/packs.json Curated packs (220, ~37k tracks), verified Deezer ids       [catalog]
src/lib/customPacks.ts Runtime packs (any artist / Deezer URL), persisted
src/lib/startGame.ts Shared start pipeline: loadPool → startLoadedGame (all screens use it)
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
- Deezer preview URLs expire after ~15 MINUTES (`hdnea=exp=`). Always gate playback on `isPreviewFresh(track)` and
  call `refreshPreview`/`refreshPreviews` right before playing; cached lists keep metadata only.
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
Hub: `/` Residency landing (both games) · `/gallery` design-system showcase (DEV only).
Songooner: `/songooner` home · `/songooner/packs` · `/songooner/setup` · `/songooner/play` ·
`/songooner/results` · `/songooner/daily` · `/songooner/stats` · `/songooner/duel` · `/songooner/c/:code`.
Highlight Scout: `/scout` home · `/scout/setup` · `/scout/play` · `/scout/results` · `/scout/daily` · `/scout/stats`.
Every in-app link must use these prefixes — never a bare `/setup`.

---

# Highlight Scout — NFL guessing game

Guess the NFL player or team from progressively-revealed clues. Contracts: `src/scout/types.ts`
(READ ONLY unless told otherwise). Engine + logic: `src/scout/`. Screens: `src/screens/scout/`.

## Data (baked at build time — this is the key constraint)
`site.api.espn.com` serves rich NFL JSON but sends **no CORS headers**, so the browser can never
call it. `scripts/sync-nfl.mjs` (plain Node `fetch`, no CORS problem) harvests everything into
`src/data/nfl/*.json`, which ship as lazy chunks. Re-run with `npm run nfl:sync`.
Images ARE fetched at runtime: `a.espncdn.com` sends `Access-Control-Allow-Origin: *`, and player
headshots are **600×436 RGBA PNGs with a transparent background** — that is what makes real
silhouettes possible (`filter: brightness(0)` or a canvas alpha pass).

Sources used by the sync script:
- `site.api.espn.com/apis/site/v2/sports/football/nfl/teams` — 32 teams, colors, logos
- `…/teams/{id}` — venue via `franchise.venue.fullName`
- `…/teams/{id}/roster` — every player (id, name, jersey, position, height/weight, age, experience)
- `sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/{id}` — draft, college, birthplace
- `sports.core.api.espn.com/v2/…/seasons/{yr}/types/2/leaders` — 16 statistical categories → the fame score
- `…/nfl/scoreboard?year=&seasontype=2&week=` → `…/nfl/summary?event=` — drives/plays; scoring plays
  carry text like `(Shotgun) C.Williams pass short right to D.Moore for 5 yards, TOUCHDOWN.`
  Abbreviated names resolve to roster players by initial + last name within the two competing teams
  (~85% first pass; league-wide fallback lifts it further). Plays whose target player does not
  resolve confidently are dropped.

There is **no public source of NFL highlight video**, and no dataset marks where a given player is
in a frame — so a "video clip with a silhouette over the player" is not buildable. The silhouette,
face-zoom and redacted-play modes cover that intent with real data.

## Modes
`silhouette` (blacked-out headshot, revealed per try) · `faceZoom` (extreme crop zooming out) ·
`highlight` (real play text, names redacted) · `teamTrivia` (clue ladder → name the franchise) ·
`statLine` (season stat line) · `careerPath` (draft → college → teams) · `logoZoom`.
Each round builds a `ScoutStage[]` ladder: `visual` 0→1 plus `clues` unlocked per rung.

## Difficulty
Tiers come from `NflPlayer.fame` (0–100): `star` ≥ 80, `starter` 55–79, `rotation` 30–54,
`deepCut` < 30. `any` = everything. Fame blends statistical-leader appearances, draft capital,
position weighting (QB/RB/WR read as more recognizable) and experience.
