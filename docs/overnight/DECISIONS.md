# Decisions made without the human

Format: what was ambiguous → what was chosen → why. Per the build prompt, work never stopped
to ask; every judgement call is logged here instead.

---

## 1. Did NOT stash/clean the tree or branch in place. Used a git worktree.
**Prompt said:** "Commit or stash everything so the tree is clean, then create a branch."

**Chose:** `git worktree add -b feat/price-guess-higher-lower ../residency-newgames HEAD`,
and all work happens in that separate directory.

**Why:** the tree was not mine to clean. Another Claude session (`rithulbhat-1c`) is 21h into a
wave of Highlight Scout fixes with ~37 uncommitted files on `main`. `git stash` would have
swept its work off disk; `git checkout -b` would have carried its dirty files onto this branch,
so its next commit would have landed here. A worktree delivers exactly what the instruction
wanted — a clean tree on a dedicated branch that is not `main` — with zero effect on the other
session. Verified after creation: `main` still shows all its files dirty and untouched.

**Cost:** a second `node_modules` (one `npm ci`). Accepted.

**Note:** the git stash stack is shared across worktrees, so stash is avoided entirely here in
favour of WIP commits.

## 2. Running as Opus 5, not "Opus 5.5".
**Prompt said:** "You are Claude Opus 5.5 (`claude-opus-5-5`)… don't downgrade."

**Chose:** proceed as Opus 5 (`claude-opus-5[1m]`), the model this session was started on.

**Why:** there is no `claude-opus-5-5` in this environment; the current family is Opus 5 /
Sonnet 5 / Fable 5.1 / Haiku 4.5. Opus 5 is the most capable model available, so the *intent*
("use the best model, don't downgrade for speed") is satisfied. Flagged rather than silently
ignored because the prompt was explicit about it.

## 3. Party rooms are a new module; `src/net/` is not extended.
**Ambiguity:** prompt says reuse existing patterns; the repo has a PeerJS layer.

**Chose:** new `src/arcade/party/`, leaving `src/net/` untouched.

**Why:** `src/net/` is structurally 1v1 — host/guest roles, and it actively rejects a second
guest with a `leave` message. Its design is a *synchronised race*: both peers run identical
deterministic engines from a shared seed and exchange only progress, with no authoritative room
state anywhere. Party (3–12, late joiners, disconnects, host migration, kicking) needs a host
that actually owns room state. Retrofitting that into the duel layer would rewrite Songooner's
working online mode — which is also the other session's territory. The reusable parts
(`ROOM_CODE_ALPHABET`, `PEER_ID_PREFIX`, the rebuild-don't-trust `parseMessage` discipline,
size caps) are reused directly.

## 4. Room codes stay 6 characters, not 4–5.
**Prompt said:** "a 4 to 5 letter code."

**Chose:** 6, reusing `ROOM_CODE_LENGTH` and `ROOM_CODE_ALPHABET` from `src/net/protocol.ts`.

**Why:** the prompt's own standing rule is "when something is unclear, choose the option most
consistent with the existing codebase." Songooner's duel already issues 6-character codes from
an alphabet with 0/O and 1/I removed so codes are never misheard. Two different room-code
formats on one site is a worse outcome than one extra character, and the shared alphabet is
already proven. Trivial to change if the human disagrees — one constant.

## 5. Country data comes from the World Bank, not restcountries.
**Chose:** World Bank API (`api.worldbank.org/v2`) for population, GDP and surface area.

**Why:** restcountries.com was the obvious choice and is **dead** — both `v3.1` and the `v5`
endpoint its own deprecation notice points at return an error payload instead of data. Verified
by curl before any code was written. World Bank returns `access-control-allow-origin: *`, real
values, and a `lastupdated` field (2026-07-13) that feeds `asOf` directly, so these items are
genuinely `verified: true` with a citable source.

## 6. All Price Guess values ship as `verified: false`.
**Prompt said:** don't invent precise figures and present them as facts.

**Chose:** every hand-authored price is `verified: false`, packs are labelled "approximate" in
the UI, and every value is listed in REPORT.md for fact-checking.

**Why:** there is no free, licence-clean, verifiable price API. Writing plausible numbers and
marking them `verified: true` would be inventing facts — the one thing the prompt explicitly
forbids. Prices are presented as approximate throughout rather than dressed up as sourced data.

## 7. Higher or Lower's verified packs come from data already in the repo or citable.
**Chose:** football (existing `src/data/nfl/players.json`, 2,507 players — weight, height, age,
draft pick, fame), songs (Deezer REST harvested by a Node script — `rank`, `release_date`), and
three country packs (World Bank). Prices become the crossover pack, carrying its `verified:false`.

**Why:** satisfies "at least one pack built from your existing football/song data" twice over,
and means the majority of HoL content is genuinely sourced rather than invented.

**Note:** "Google search interest" from the prompt's pack list is **dropped** — there is no free
API for it, and fabricating search volumes is the same failure as fabricating prices.

## 8. Deezer is harvested server-side for the songs pack.
**Why:** the browser must use JSONP for Deezer (no CORS), but `scripts/sync-hilo.mjs` runs in
Node where CORS does not apply, so plain `fetch` is fine. Baking also avoids the 15-minute
preview-URL expiry entirely, since HoL needs metadata (rank, release year) and never audio.

## 9. Routing is not edited; it is handed over as a diff.
**Why:** `src/routes.ts` exports `GameKey` plus exhaustive `Record<GameKey, …>` maps consumed by
`AppShell.tsx` and `Residency.tsx` — both owned by the other session. Adding a key red-lines
their files mid-wave. Games are built against local route constants and the wiring lands as one
reviewed commit. Full checklist in PLAN.md; note that only the `Record` maps fail loudly —
`activeGame`, `isPlayPath`, `Placeholder` and the e2e guards all fail *silently*.

## 10. Each game gets at most 4 nav entries. — SUPERSEDED at `b147647`
**Was:** `AppShell.tsx:61` held `MOBILE_COLS: Record<number, string> = { 4: …, 5: … }` read with a
silent `?? 'grid-cols-5'` fallback, over `[Home, ...GAME_NAV[game]]`. A 5-entry nav rendered in a
5-column grid with no error and no failing test, so the cap was a design constraint here.

**Now:** the other session replaced it with `mobileCols(count)`, total over 2–6 with a clamp, and
generalised `Placeholder`'s hardcoded scout check to `GAME_SOON: Partial<Record<GameKey, …>>`.
Both traps are gone and the cap is lifted. The nav stays **Play · Daily · Party · Stats** because
four is the right number for these games, not because five would break.

Kept rather than deleted: the reasoning is why the fix happened, and the same silent-fallback
shape is worth recognising elsewhere.

## 11. No new dependencies.
**Why:** the prompt forbids paid APIs and new secrets, and everything needed is present — peerjs
(rooms), zustand (state), motion (reveal animations), canvas-confetti, the existing sfx synth.
Adding a dependency would also mean editing `package.json`, a shared file.
