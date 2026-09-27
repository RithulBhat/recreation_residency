# Overnight build — Price Guess + Higher or Lower

Branch `feat/price-guess-higher-lower`, 15 commits on top of `a9eb408`.
**2,595 unit tests green, `tsc --noEmit` clean, `npm run build` succeeds.** Nothing pushed; `main`
is untouched.

Read `DECISIONS.md` for the judgement calls taken without you, and `unverified.md` for every value
that needs fact-checking.

---

## Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Plan, shared utilities, content schema, seeded pairing | **Done** |
| 2 | Price Guess engine, tests, solo UI, settings, presets | **Done** |
| 3 | Higher or Lower engine, tests, solo UI, settings, presets | **Done** |
| 4 | Daily challenge + shareable results, both games | **Done** |
| 5 | Duo | **Partial** — online 1v1 works as a 2-player party room. Pass-and-play on one device is **not** built. |
| 6 | Party rooms + twists | **Partial** — rooms, lobby, join, live rounds, scoring, leaderboard, host migration, kick, reconnect all work. The optional twists (bid war, bluff round, team mode, sabotage, majority vote, hot seat) are **not** built. |
| 7 | Content, validation script, polish, navigation and hub cards | **Done** |
| 8 | This report | **Done** |

---

## How to run it

```bash
cd /Users/rithulbhat/Documents/residency-newgames
npm install
npx vite --port 5487 --strictPort      # 5173 may be another session's server
```

Then open `http://localhost:5487/`. All four games are on the hub.

| Route | What it is |
|---|---|
| `/#/price` | Price Guess home |
| `/#/price/setup` · `/play` · `/results` | Solo run |
| `/#/price/daily` | Today's run, one attempt |
| `/#/price/party` | Party room |
| `/#/hilo` and the same five | Higher or Lower |

**To open a party room with two browser windows:** go to `/#/price/party`, type a name, press
*Host a new room*, and a six-character code appears. In a second window (a private window works)
open the same URL, type a different name, enter the code, press *Join a room*. The host screen
shows the roster; press *Start the game*. Both windows show the same item. Each enters a guess and
presses *Lock it in*; the host presses *Reveal now*, and the leaderboard moves on both screens.
Verified exactly this way with Playwright driving two pages.

Other commands:

**Do not run two Playwright suites at once in the same checkout.** They share
`test-results/.artifacts/`, and the second run deletes trace files the first is still writing. It
surfaces as four or five unrelated tests failing with `ENOENT ... recording*.trace`, which reads
exactly like a real regression — it cost an hour of chasing Scout failures that did not exist.
Run one at a time, or give each run its own `--output` directory.

```bash
npm test                              # 2,595 unit tests
npm run typecheck
npm run build
npx playwright test                   # e2e
node scripts/validate-content.mjs --report   # content gate + fact-check list
node scripts/sync-hilo.mjs            # re-bake Higher or Lower content
node scripts/shoot-price.mjs          # render both games and screenshot them
```

---

## Settings and presets

### Price Guess

| Setting | Default | Range |
|---|---|---|
| Rounds | 10 | 1–50 |
| Timer | Off | 0–300s |
| Packs | all | Supermarket Sweep, Tech & Gadgets, Absurdly Expensive |
| Difficulty | medium | easy · medium · hard · chaos |
| Input | exact | exact · slider · choice · ladder |
| Scoring | closeness | closeness · priceIsRight · elimination |
| Ladder tries / tolerance | 6 / 5% | 1–10 / 0.1–50% |
| Hints | all three | category · bracket · firstDigit (15% of base each) |
| Currency | usd | usd · gbp · eur |
| Speed bonus | **off** | auto-disabled with no timer |
| Streak multiplier | on | +5%/streak, capped +50% |
| Guess visibility | afterLock | off · afterLock · live |

Presets: **Quick 5**, **Daily**, **Price Is Right**, **Chaos Cart**, **Luxury Only**,
**Team Showdown**.

### Higher or Lower

| Setting | Default | Range |
|---|---|---|
| Format | classic | classic · lives · timed · rounds · suddenDeath |
| Lives | 1 | 1–5 (pinned to 1 for classic/suddenDeath) |
| Duration | 60s | 15–300s (timed) |
| Rounds | 15 | 3–100 (rounds) |
| Timer | 0 | 0–60s (forced 0 in timed) |
| Difficulty | medium | easy ≥2× · medium ≥1.25× · hard ≤10% · insane ≤3% |
| Packs | all | 3 country packs, 2 NFL packs, 1 music pack |
| Exact values | on | off rounds the known side |
| "Too close" button | off | disabled entirely on insane |
| Power-ups | all three | skip · peek · doubleDown |
| Streak curve | gentle | off · gentle (cap 1.6×) · steep (cap 3×) |

Presets: **Classic**, **Speedrun 60s**, **Football Nerd**, **Hard Mode**, **Party Race**,
**Sudden Death**.

---

## Content

| Pack | Items | Unit | Sourced? |
|---|---|---|---|
| Supermarket Sweep | 22 | usd | **No** — author estimate |
| Tech & Gadgets | 22 | usd | **No** — author estimate |
| Absurdly Expensive | 22 | usd | **No** — author estimate |
| How Many Live There | 194 | people | Yes — World Bank `SP.POP.TOTL` |
| Size of the Economy | 199 | usd | Yes — World Bank `NY.GDP.MKTP.CD` |
| How Big Is It | 177 | sqkm | Yes — World Bank `AG.SRF.TOTL.K2` |
| NFL Weigh-In | 400 | pounds | Yes — ESPN rosters |
| Draft Position | 400 | rank | Yes — ESPN athlete records |
| Chart Heat | 691 | rank | Yes — Deezer chart popularity |

**2,127 values: 2,061 sourced, 66 estimated.** All 66 estimates are Price Guess prices and all 66
are listed in `unverified.md` for fact-checking. There is no free, licence-clean price dataset, so
writing plausible numbers and marking them verified would have been inventing facts — the one
thing the brief forbids. Instead provenance is a schema requirement: `validatePack` rejects any
item lacking `source` or a real `asOf`, packs with any unverified value are `approximate`, and the
hub card, the setup screen, every round and the results screen all say so.

No images are hotlinked. Every item carries an emoji, and country packs use flag emoji built from
ISO codes.

**`restcountries.com` is dead** — both `v3.1` and the `v5` endpoint its own deprecation notice
points at return an error payload rather than data. Checked by curl before any code was written.

---

## Four answer leaks found and closed

All four are the same shape: the round resolved correctly, so every ordinary test passed while a
player could win without knowing anything. They were found by playing thousands of generated
rounds with strategies that use no domain knowledge and asserting **two-sided** near-chance — a
strategy winning 0% is as exploitable as one winning 92%, because the player just inverts it.

| Leak | Measured | Cause | Fix |
|---|---|---|---|
| Multiple-choice magnitude | answer was cheapest **0.0%**, dearest **0.0%** | four spreads with exactly one dropped, so one distractor always sat on each side | the answer's rank is chosen uniformly first |
| Multiple-choice roundness | "pick the roundest" won **34%** | real prices are rounder than random products of a price | every distractor gets the answer's own ending and an identical trailing-zero count |
| Higher-or-Lower chain | "if A is below the median, guess higher" won **78%** | the game chains, so the anchor is inherited; from a cheap anchor most of the pool is dearer | coin-flip the direction, cap the wide bands, and relax the band for an empty direction only |
| Silent difficulty | `insane` degraded on **100%** of rounds | the content cannot express a 3% band when neighbours are 9% apart | `feasibleDifficulties` measures it and setup disables what a pack cannot honour |

The chain leak is the one worth remembering: the marginal rate of "higher" sat at a reassuring
50.6% the whole time. The bias was conditional on the anchor and cancelled exactly in the mean.
Splitting every measurement **per difficulty** is what exposed it; the aggregate hid it completely.

Three regression harnesses now guard this: `src/price/choices.test.ts`,
`src/arcade/pairing.strategies.test.ts` and `src/arcade/statelessness.test.ts`.

---

## Bugs only rendering or two real browsers could find

1. **"You said $120,000 — 2999900% out."** True, passing, useless, and the most likely line in the
   game because chaos mode mixes $2 sweets with $2M houses. `describeMiss` now switches register
   with the size of the miss.
2. **A GDP written out in full** is fifteen characters that overflowed the card at 375px and
   clipped at both edges. Past a million, compact *is* the readable form.
3. **Comparing WILLOW's chart heat to Djibouti's population.** The naive reading of "mixed stats"
   put every pack in one pool, and the result is not a question anyone can answer. A run now
   resolves to a single unit, chosen from the seed.
4. **Every party guest sat on a spinner forever.** `parseRoomState` required a non-empty seed, but
   a lobby has none until the host starts, so every welcome message was silently dropped. The host
   saw the guest join; the guest saw nothing. The protocol's own 55 tests were green.
5. **A whole party room shared one avatar**, because every client sends the same default emoji.
   The host now assigns a distinct one from the peer id.

---

## Not built

- **Pass-and-play on one device** for either game. Online 1v1 works as a two-player room.
- **Party twists**: bid war, bluff round, team mode, sabotage, majority vote, hot seat.
- **Stats pages** for either game. Results are per-run; nothing is aggregated across runs.
- **Challenge links** (`#/price/c/<code>`). The settings codec exists in `src/game/challenge.ts`
  and the pattern is proven; neither new game has a challenge route.
- **Inflation adjustment** for historical prices — the setting exists and validates, but no item
  carries a year, so it has nothing to act on.
- **Slider and multiple-choice input** for Price Guess: the engine supports all four input types
  and `buildChoices` is fully tested, but the Play screen only renders the keypad.
- **Elimination scoring in party mode.** Implemented and tested in the engine; the party screen
  always uses closeness.

## Known bugs and gaps, worst first

1. **The party room depends on PeerJS's public broker.** No fallback, no reconnect-to-room after a
   host refresh, and a host who closes the tab ends the room for everyone. Host migration works
   for a *dropped* client but the code is tied to the original host's peer id.
2. **Only one round of party play was verified end to end.** Advancing through all eight rounds,
   a mid-game disconnect and a real host migration were tested in the reducer but never over a
   socket.
3. **`npm run build` warns that a chunk exceeds 500 kB.** Pre-existing, but the new content adds
   to it. The hilo packs are ~1 MB of JSON and should be lazy chunks.
4. **Price Guess's difficulty setting barely does anything.** It widens the accuracy band and
   picks choice spreads, but does not filter the item pool, so "easy" and "hard" draw the same
   items. `chaos` is currently indistinguishable from the rest.
5. **The daily "played today" flag is `localStorage`** and trivially cleared. Deliberate — the
   alternative is a backend — but it means the daily is honour-system.
6. **No sound.** The brief asks for sfx with a mute toggle; both games are silent. The site's
   synth is in `src/audio` and was not wired up.
7. **World Bank regions are long** ("Middle East, North Africa, Afghanistan & Pakistan") and get
   ellipsised on a card.

## Suggested next steps

1. Wire `src/audio`'s synth into both games — the single biggest gap between this and the two
   existing games.
2. Make Price Guess's difficulty filter the pool by price magnitude, and make `chaos` genuinely
   interleave orders of magnitude.
3. Build pass-and-play, which needs no network and covers most real "play with a friend" use.
4. Add stats pages; `src/scout/scoutStats.ts` is a working model to copy.
5. Run the strategy harness against the ladder and slider inputs before shipping them — neither
   has been measured, and the ladder in particular gives feedback that may be readable.
6. Split the hilo JSON into lazy chunks per pack.

## Ideas worth stealing for later

- **Price ladder as a daily.** The Costcodle-style input is implemented and is the best fit for a
  one-attempt daily; it is currently only reachable by choosing it in setup.
- **A crossover pack**: play Price Guess items inside Higher or Lower. The schema is shared, so
  this is a pack registration rather than a feature.
- **"Which is fake"** for Higher or Lower: show three figures for one country and ask which was
  invented. Reuses the distractor generator that already resists four kinds of tell.
- **Reverse Price Guess**: given a price, pick which of four things costs it.
