# Overnight build — Price Guess + Higher or Lower

Branch `feat/price-guess-higher-lower`, based on `4c39ba8`.
Baseline verified green before any work: **2,119 unit tests / 98 files passing, `tsc --noEmit` clean.**

## Phase 0 findings

### This is not a solo tree
A second Claude session (`rithulbhat-1c`) is actively working the same repository on `main`
with ~37 uncommitted files (Highlight Scout answer-leak fixes). The build prompt opens with
"commit or stash everything so the tree is clean, then create a branch" — following that
literally would have destroyed another session's in-flight work, and `git checkout -b` would
have dragged its dirty files onto this branch. See DECISIONS.md #1.

### Stack (unchanged from CLAUDE.md, confirmed by reading)
Vite 8 · React 19 · TS 7 strict · Tailwind v4 (`@theme` tokens, no config file) · zustand v5 ·
react-router v7 HashRouter · motion · Vitest (jsdom) · Playwright. Path alias `@/` → `src/`.
Static SPA on GitHub Pages. **No backend, no database, no auth.** CI (`.github/workflows/deploy.yml`)
runs `npm ci && npm test && npm run build` and deploys **only on push to `main`** — a feature
branch cannot deploy, so milestone commits here are safe.

### What already exists that we reuse rather than rebuild
| Need | Existing module | Reuse |
|---|---|---|
| Seeded RNG | `src/game/rng.ts` — `createRng(seed)`, xmur3 + mulberry32 | direct |
| Daily seeds | `src/game/challenge.ts` — `dailySeed(dateISO)`, `todayISO()` | direct |
| Settings-in-link | `src/game/challenge.ts` — compact-key JSON → base64url | pattern |
| Design system | `src/components/ui/**` (27 primitives) + semantic tokens | direct |
| Room codes | `src/net/protocol.ts` — `ROOM_CODE_ALPHABET` (no 0/O/1/I), `PEER_ID_PREFIX` | direct |
| Untrusted-input hardening | `parseMessage` rebuild-don't-trust pattern | pattern |
| Confetti / sfx / hotkeys | `src/hooks/**`, `src/audio/**` | direct |

### The multiplayer layer does NOT generalise
`src/net/` is **strictly 1v1**: host/guest roles, and it explicitly sends `leave` to reject a
second guest. Its model is a *synchronised race* — both peers run identical local engines off a
shared seed and only exchange progress; there is no authoritative room state.

Party (3–12) needs genuine star topology: host owns room state, N clients connect, and late
joins / disconnects / host migration are real cases. So party is a **new** `src/arcade/party/`
module. `src/net/` is left untouched — it is Songooner's and the other session's territory.

### Data sources — all verified live before being designed around
| Source | Status | Use |
|---|---|---|
| World Bank API | **OK.** `access-control-allow-origin: *`, `lastupdated: 2026-07-13` | countries: population, GDP, surface area → `verified: true` |
| Deezer REST (from Node) | **OK.** `rank` 0–1M popularity, `release_date` | songs pack → `verified: true` |
| `src/data/nfl/players.json` | **OK.** 2,507 players: jersey, height, weight, age, exp, draft, fame | football pack → `verified: true` |
| restcountries.com | **DEAD — v3.1 *and* v5 both return a deprecation error payload, not data** | rejected |
| Any price API | no free, licence-clean, verified source | prices hand-authored, `verified: false` |

Checking CORS and liveness first was the other session's hard-won lesson; it immediately
eliminated restcountries, which was the obvious first choice for country data.

## Directory plan (all new paths — disjoint from both other games)
```
src/arcade/            shared: content-item schema, pack registry, settings codec, share cards
src/arcade/party/      star-topology PeerJS room: protocol, reducer, host/client hooks
src/price/             Price Guess pure engine: rounds, scoring curves, settings, presets
src/hilo/              Higher or Lower pure engine: pairing, streaks, lives, power-ups
src/data/price/        content packs (JSON) — hand-authored, mostly verified:false
src/data/hilo/         content packs (JSON) — baked by scripts/sync-hilo.mjs
src/screens/price/     Home · Setup · Play · Results · Daily · Stats · Party
src/screens/hilo/      Home · Setup · Play · Results · Daily · Stats · Party
src/components/price/  Price-specific UI
src/components/hilo/   HoL-specific UI
src/components/party/  Shared room UI (lobby, join, host screen, leaderboard)
scripts/sync-hilo.mjs  World Bank + Deezer + NFL → baked packs
scripts/validate-content.mjs  schema / duplicate-id / range validation
docs/overnight/        PLAN.md · DECISIONS.md · REPORT.md · screenshots/
```

## Files I will NOT touch (owned by the other session, or shared)
`src/routes.ts` · `src/App.tsx` · `src/components/AppShell.tsx` · `src/screens/Residency.tsx` ·
`src/components/hub/**` · `src/screens/Placeholder.tsx` · `src/net/**` · `src/scout/**` ·
`src/components/scout*/**` · `src/screens/scout/**` · `src/screens/Play.tsx` · `src/screens/Setup.tsx` ·
`src/lib/deezer.ts` · `src/data/nfl/**` · `src/types/**` · `src/components/ui/**` · `src/index.css` ·
`package.json` · `CLAUDE.md`

Routing is deliberately excluded even though it is "free": `src/routes.ts` exports `GameKey` plus
four exhaustive `Record<GameKey, …>` maps, and adding a key red-lines the other session's files.
Games are therefore built against local route constants and handed over as one wiring diff.

## Wiring handoff (delivered at the end, landed by the other session in one commit)
1. `GameKey` union + `R.price` / `R.hilo` route tables — `src/routes.ts`
2. `GAME_LABEL`, `GAME_HOME`, `GAME_TAGLINE` entries — `src/routes.ts`
3. `GAME_NAV` entries — `src/components/AppShell.tsx:45` (**4th exhaustive map**)
4. `activeGame()` + `isPlayPath()` arms — silent failures, not type errors
5. `Placeholder.tsx:49` — hardcoded `game === 'scout'`; a third game 404s on every route
6. All routes into **four** arrays in `e2e/visual.spec.ts` (narrow/h1/duplicate-id/scout)
7. Hub tiles — `src/screens/Residency.tsx` + `src/components/hub/**`

**Nav constraint:** `AppShell.tsx:61` is `MOBILE_COLS = { 4: …, 5: … }` with a silent
`?? 'grid-cols-5'` fallback, and `mobileNav = [Home, ...GAME_NAV[game]]`. Each game therefore gets
**at most 4 nav entries** or the mobile tab bar lays out in the wrong grid with no error.
Chosen nav for both games: **Play · Daily · Party · Stats** (= 5 columns with Home).

## Milestones
1. PLAN + DECISIONS + shared arcade utilities (content schema, settings codec, seeded pairing) + tests
2. Price Guess engine + tests → solo UI, all settings and presets
3. Higher or Lower engine + tests → solo UI, all settings and presets
4. Daily challenge + shareable emoji result grid, both games
5. Duo: pass-and-play, then online 1v1
6. Party rooms + twists, both games
7. Content packs, validation script, polish, a11y, wiring handoff diff
8. REPORT.md

Rule from the prompt, adopted: stop at a milestone boundary rather than halfway through one.
Solo working perfectly beats all modes half-working.
