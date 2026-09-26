#!/usr/bin/env node
/**
 * sync-nfl.mjs — bake the Highlight Scout dataset from ESPN's public JSON APIs.
 *
 * ESPN's `site.api` / `sports.core.api` endpoints send NO CORS headers, so the browser can
 * never call them. This script runs in Node (no CORS), harvests everything, and writes
 * `src/data/nfl/*.json`, which Vite ships as lazy chunks.
 *
 *   npm run nfl:sync                 # normal run (uses the on-disk raw cache)
 *   NFL_FRESH=1 npm run nfl:sync     # ignore the cache
 *   NFL_CACHE_DIR=/path npm run nfl:sync
 *   NFL_MAX_GAMES=80 npm run nfl:sync  # quick smoke run
 *   NFL_FAME_ONLY=1 npm run nfl:sync   # rescore fame over the committed players.json and stop
 *   NFL_FACTS_ONLY=1 npm run nfl:sync  # re-merge facts.json into the committed teams.json and stop
 *
 * NFL_FAME_ONLY exists because fame is the one field that gets retuned: it reads the committed
 * players.json (rosters, drafts, colleges are all already in there) plus the committed
 * fame-signals.json, refetches only the ~200 tiny leaderboard/award documents the score needs,
 * rewrites players.json and touches nothing else. The full run computes the identical score —
 * `scoreFame` is the single source of truth either way.
 *
 * Outputs (all typed against src/scout/types.ts):
 *   teams.json       32 × NflTeam        (ESPN facts + the curated half from facts.json)
 *   players.json     every rostered player × NflPlayer, each with a 0-100 `fame` score
 *   highlights.json  ~1.2-2k × HighlightPlay, real play text with names replaced by [?]
 *   statlines.json   season stat lines for the most famous players × StatLine
 *   meta.json        { syncedAt, season, counts } — powers loadDataset()
 *
 * Two files in src/data/nfl are INPUT, hand-verified and never overwritten by this script:
 *   facts.json        curated team trivia, merged into teams.json
 *   fame-signals.json Pro Bowls, first-team All-Pros, major awards, Heisman, draft slot and an
 *                     editorial 0-3 `nationalProfile`, keyed by ESPN athlete id — the recognition
 *                     evidence ESPN's API does not carry at all. Read by `readAccolades()`; a
 *                     missing id means UNKNOWN, never zero (see its own `_meta.absentMeans`).
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'src', 'data', 'nfl');
const CACHE_DIR = process.env.NFL_CACHE_DIR || join(tmpdir(), 'songooner-nfl-raw');
const FRESH = process.env.NFL_FRESH === '1';
const MAX_GAMES = Number(process.env.NFL_MAX_GAMES || 0) || Infinity;
/** Rescore fame over the committed players.json instead of rebuilding the whole dataset. */
const FAME_ONLY = process.env.NFL_FAME_ONLY === '1';
/** Re-merge facts.json into the committed teams.json and stop — no network, no other file. */
const FACTS_ONLY = process.env.NFL_FACTS_ONLY === '1';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';

const CONCURRENCY = 6;
const RETRIES = 2;
/** Cache entries older than this are refetched. Play-by-play history never changes. */
const TTL_MS = 6 * 60 * 60 * 1000;

/** Target size of highlights.json, and the caps that keep it varied. */
const HL_TARGET = 1700;
const HL_MAX_PER_PLAYER = 3;
const HL_MAX_PER_TEAM = 70;
const HL_MAX_KIND_SHARE = 0.34;

/** How many players get a statline. */
const STATLINE_TOP = 300;

/** How deep to read each statistical-leader category (the API default is 25, the cap is 250). */
const LEADER_DEPTH = 250;

// ---------------------------------------------------------------------------------------------
// Tiny console helpers
// ---------------------------------------------------------------------------------------------

const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const log = (...a) => console.log(`[${secs().padStart(7)}]`, ...a);
const warn = (...a) => console.warn(`[${secs().padStart(7)}] !`, ...a);

function table(rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (cells) => '  ' + cells.map((s, i) => String(s).padEnd(w[i])).join('  ');
  console.log(line(cols));
  console.log('  ' + w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of rows) console.log(line(cols.map((c) => r[c] ?? '')));
}

// ---------------------------------------------------------------------------------------------
// Cached, retrying, concurrency-limited fetch
// ---------------------------------------------------------------------------------------------

let hits = 0;
let misses = 0;
let failures = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cachePath(url) {
  const h = createHash('sha1').update(url).digest('hex');
  return join(CACHE_DIR, h.slice(0, 2), `${h}.json.gz`);
}

/**
 * Cache entries are wrapped as `{ v }` so that a cached `null` (a 404 we already know about) is a
 * hit rather than an indistinguishable miss. Returns `undefined` when there is nothing usable.
 */
async function readCache(file) {
  if (FRESH) return undefined;
  try {
    const s = await stat(file);
    if (Date.now() - s.mtimeMs > TTL_MS) return undefined;
    const box = JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
    return box && typeof box === 'object' && 'v' in box ? box.v : undefined;
  } catch {
    return undefined;
  }
}

async function writeCache(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, gzipSync(Buffer.from(JSON.stringify({ v: data })), { level: 6 }));
}

/** GET JSON with an on-disk cache, two retries and exponential backoff. */
async function getJson(url, { optional = false } = {}) {
  const file = await cachePath(url);
  const cached = await readCache(file);
  if (cached !== undefined) {
    hits++;
    return cached;
  }
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'songooner-nfl-sync/1.0' },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 404) {
        if (optional) {
          await writeCache(file, null);
          misses++;
          return null;
        }
        throw new Error('404');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await writeCache(file, json);
      misses++;
      return json;
    } catch (err) {
      if (attempt === RETRIES) {
        failures++;
        if (optional) return null;
        throw new Error(`GET ${url} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      await sleep(400 * 2 ** attempt + Math.random() * 250);
    }
  }
  return null;
}

/** Run `fn` over `items` with a bounded worker pool, printing progress. */
async function pool(label, items, fn, limit = CONCURRENCY) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;
  const step = Math.max(1, Math.floor(total / 20));
  const tick = () => {
    done++;
    if (done === total || done % step === 0) {
      const pct = Math.round((done / total) * 100);
      log(`${label}: ${String(done).padStart(String(total).length)}/${total} (${pct}%)`);
    }
  };
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      try {
        out[i] = await fn(items[i], i);
      } catch (err) {
        warn(`${label} [${i}] ${err instanceof Error ? err.message : String(err)}`);
        out[i] = null;
      }
      tick();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, total) }, worker));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Small parsers
// ---------------------------------------------------------------------------------------------

const hex = (c, fallback) => {
  const s = String(c ?? '').replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toLowerCase()}` : fallback;
};

/** "6' 2\"" → 74 */
function parseHeight(display, numeric) {
  if (typeof numeric === 'number' && numeric > 40 && numeric < 90) return Math.round(numeric);
  const m = /^(\d+)'\s*(\d+)?/.exec(String(display ?? ''));
  if (!m) return undefined;
  return Number(m[1]) * 12 + Number(m[2] ?? 0);
}

/** "225 lbs" → 225 */
function parseWeight(display, numeric) {
  if (typeof numeric === 'number' && numeric > 100 && numeric < 450) return Math.round(numeric);
  const m = /(\d+)/.exec(String(display ?? ''));
  return m ? Number(m[1]) : undefined;
}

const POSITION_GROUPS = {
  // Quarterback
  QB: 'QB',
  // Running backs
  RB: 'RB', FB: 'RB', HB: 'RB', TB: 'RB',
  // Receivers / tight ends
  WR: 'WR', SE: 'WR', FL: 'WR',
  TE: 'TE',
  // Offensive line
  OL: 'OL', OT: 'OL', T: 'OL', LT: 'OL', RT: 'OL',
  OG: 'OL', G: 'OL', LG: 'OL', RG: 'OL', C: 'OL',
  // Defensive line
  DL: 'DL', DE: 'DL', DT: 'DL', NT: 'DL', EDGE: 'DL', LDE: 'DL', RDE: 'DL', LDT: 'DL', RDT: 'DL',
  // Linebackers
  LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB', LOLB: 'LB', ROLB: 'LB', WLB: 'LB', SLB: 'LB',
  // Secondary
  DB: 'DB', CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', NB: 'DB', SAF: 'DB', LCB: 'DB', RCB: 'DB',
  // Special teams
  ST: 'ST', PK: 'ST', K: 'ST', P: 'ST', LS: 'ST', KR: 'ST', PR: 'ST', H: 'ST',
};
const PARENT_FALLBACK = { OFF: 'WR', DEF: 'LB', ST: 'ST', SPEC: 'ST' };
const unknownPositions = new Map();

function positionGroup(abbr, parentAbbr) {
  const key = String(abbr ?? '').toUpperCase();
  const direct = POSITION_GROUPS[key];
  if (direct) return direct;
  const parent = PARENT_FALLBACK[String(parentAbbr ?? '').toUpperCase()] ?? 'WR';
  unknownPositions.set(key || '(blank)', (unknownPositions.get(key || '(blank)') ?? 0) + 1);
  return parent;
}

/** ESPN `$ref` URLs end in `/<id>?lang=…`; pull the id out. */
function refId(ref) {
  const m = /\/(\d+)(?:\?|$)/.exec(String(ref ?? ''));
  return m ? m[1] : null;
}

/** "Harrison Jr." -> "Harrison"; ESPN puts generational suffixes in `lastName`. */
const baseSurname = (last) => String(last ?? '').replace(/\s+(?:Jr\.?|Sr\.?|I{2,3}|IV|VI{0,3}|V)$/i, '').trim();

/** Strip accents/punctuation for name matching. */
const normName = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

// ---------------------------------------------------------------------------------------------
// 1. Teams
// ---------------------------------------------------------------------------------------------

async function fetchTeams() {
  const root = await getJson(`${SITE}/teams?limit=40`);
  const league = root.sports[0].leagues[0];
  const season = Number(league.season?.year ?? league.year ?? new Date().getFullYear());
  const base = league.teams.map((w) => w.team).filter((t) => t && t.isActive !== false);
  log(`teams: ${base.length} active, ESPN current season = ${season}`);

  const details = await pool('team detail', base, (t) => getJson(`${SITE}/teams/${t.id}`));

  // Resolve every group id in the chain (division -> conference) exactly once.
  const groupIds = new Set();
  for (const d of details) {
    const g = d?.team?.groups;
    if (g?.id) groupIds.add(String(g.id));
    if (g?.parent?.id) groupIds.add(String(g.parent.id));
  }
  const ids = [...groupIds];
  const groups = await pool('groups', ids, (id) => getJson(`${CORE}/groups/${id}`));
  const groupName = new Map(ids.map((id, i) => [id, groups[i]?.name ?? '']));

  const teams = base.map((t, i) => {
    const d = details[i]?.team ?? {};
    const g = d.groups ?? {};
    const divisionLabel = groupName.get(String(g.id)) ?? '';
    const conferenceLabel = groupName.get(String(g.parent?.id)) ?? '';
    const conference = /^AFC|American/i.test(conferenceLabel) || /^AFC/i.test(divisionLabel) ? 'AFC' : 'NFC';
    const divMatch = /(North|South|East|West)/i.exec(divisionLabel);
    const division = divMatch
      ? divMatch[1][0].toUpperCase() + divMatch[1].slice(1).toLowerCase()
      : 'East';
    if (!divMatch) warn(`no division parsed for ${t.abbreviation} (group "${divisionLabel}")`);
    const logo =
      (t.logos ?? []).find((l) => (l.rel ?? []).includes('default'))?.href ??
      `https://a.espncdn.com/i/teamlogos/nfl/500/${String(t.abbreviation).toLowerCase()}.png`;
    return {
      id: String(t.id),
      abbr: String(t.abbreviation),
      name: String(t.name),
      location: String(t.location),
      displayName: String(t.displayName),
      color: hex(t.color, '#222222'),
      altColor: hex(t.alternateColor, '#ffffff'),
      logo,
      conference,
      division,
      venue: String(d.franchise?.venue?.fullName ?? ''),
    };
  });
  teams.sort((a, b) => a.abbr.localeCompare(b.abbr));
  return { teams, season };
}

async function mergeFacts(teams) {
  const raw = JSON.parse(await readFile(join(OUT_DIR, 'facts.json'), 'utf8'));
  const missing = [];
  const merged = teams.map((t) => {
    const f = raw[t.abbr];
    if (!f) {
      missing.push(t.abbr);
      return { ...t, founded: 0, superBowls: [], aliases: [], rivals: [], legends: [], facts: [] };
    }
    const aliases = new Set([
      ...(f.aliases ?? []),
      t.name.toLowerCase(),
      t.location.toLowerCase(),
      t.displayName.toLowerCase(),
      t.abbr.toLowerCase(),
    ]);
    return {
      ...t,
      founded: Number(f.founded ?? 0),
      superBowls: [...(f.superBowls ?? [])].map(Number).sort((a, b) => a - b),
      aliases: [...aliases].sort(),
      rivals: [...(f.rivals ?? [])],
      legends: [...(f.legends ?? [])],
      facts: [...(f.facts ?? [])],
    };
  });
  if (missing.length) warn(`facts.json missing entries for: ${missing.join(', ')}`);
  for (const line of factLeaks(merged)) warn(`fact leaks an accepted guess — ${line}`);
  return merged;
}

/**
 * Aliases that are ordinary English words and never the franchise's nickname, so their appearance
 * in prose gives nothing away. Mirrors ENGLISH_WORD_ALIASES in src/data/nfl/facts.test.ts.
 */
const ENGLISH_WORD_ALIASES = new Set(['car', 'den', 'min', 'no', 'ten', 'was']);

/** Lowercase, punctuation → spaces, space-padded so `includes` only matches whole words. */
const normFact = (text) => ` ${String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * A fact must never contain something the guess matcher would ACCEPT as that team's name — the
 * clue ladder would hand the player the answer. Reported here and asserted hard by facts.test.ts.
 */
function factLeaks(teams) {
  const out = [];
  for (const t of teams) {
    const needles = new Set();
    for (const raw of [t.name, t.location, t.displayName, t.abbr, ...t.aliases]) {
      if (ENGLISH_WORD_ALIASES.has(String(raw).trim().toLowerCase())) continue;
      const key = normFact(raw);
      if (key.trim()) needles.add(key);
    }
    for (const fact of t.facts) {
      const haystack = normFact(fact);
      for (const needle of needles) {
        if (haystack.includes(needle)) out.push(`${t.abbr} "${needle.trim()}": ${fact}`);
      }
    }
  }
  return out;
}

/**
 * NFL_FACTS_ONLY=1 — re-merge the curated facts.json over the committed teams.json.
 *
 * Every ESPN field (id, colors, logo, conference, division, venue) is already on disk, so editing
 * a trivia line needs no network at all: this reuses `mergeFacts`, the same function the full run
 * calls, and rewrites teams.json alone. players.json / highlights.json / statlines.json / meta.json
 * are left exactly as committed.
 */
async function factsOnly() {
  const committed = JSON.parse(await readFile(join(OUT_DIR, 'teams.json'), 'utf8'));
  // Keep only the ESPN half, in the order fetchTeams() emits it, so mergeFacts is the one and only
  // writer of the curated fields and the file's key order cannot drift.
  const base = committed.map((t) => ({
    id: t.id,
    abbr: t.abbr,
    name: t.name,
    location: t.location,
    displayName: t.displayName,
    color: t.color,
    altColor: t.altColor,
    logo: t.logo,
    conference: t.conference,
    division: t.division,
    venue: t.venue,
  }));
  log(`NFL_FACTS_ONLY: re-merging facts.json over ${base.length} committed teams`);
  const teams = await mergeFacts(base);
  if (teams.length !== 32) throw new Error(`teams.json has ${teams.length} teams, expected 32`);

  const divisions = new Map();
  for (const t of teams) {
    const k = `${t.conference} ${t.division}`;
    divisions.set(k, (divisions.get(k) ?? 0) + 1);
  }
  if (divisions.size !== 8 || [...divisions.values()].some((n) => n !== 4)) {
    throw new Error('divisions did not resolve to 8 × 4 teams');
  }

  const written = await writeJson('teams.json', teams);
  table([
    { metric: 'teams re-merged', value: teams.length },
    { metric: 'facts', value: teams.reduce((n, t) => n + t.facts.length, 0) },
    { metric: 'fewest facts', value: Math.min(...teams.map((t) => t.facts.length)) },
    { metric: 'super bowls', value: teams.reduce((n, t) => n + t.superBowls.length, 0) },
    { metric: 'teams.json', value: written.kb },
  ]);
  log(`done in ${secs()} — run \`node scripts/verify-nfl.mjs\` next`);
}

// ---------------------------------------------------------------------------------------------
// 2. Players
// ---------------------------------------------------------------------------------------------

const ROSTER_GROUPS = [
  'offense',
  'defense',
  'specialTeam',
  'injuredReserveOrOut',
  'suspended',
  'practiceSquad',
];

async function fetchPlayers(teams) {
  const rosters = await pool('rosters', teams, (t) => getJson(`${SITE}/teams/${t.id}/roster`));
  const players = [];
  const seen = new Set();
  const groupCounts = new Map();

  rosters.forEach((r, i) => {
    const team = teams[i];
    if (!r) return;
    for (const bucket of r.athletes ?? []) {
      const bucketName = String(bucket.position ?? '');
      if (!ROSTER_GROUPS.includes(bucketName)) {
        groupCounts.set(`?${bucketName}`, (groupCounts.get(`?${bucketName}`) ?? 0) + 1);
      }
      groupCounts.set(bucketName, (groupCounts.get(bucketName) ?? 0) + (bucket.items?.length ?? 0));
      for (const a of bucket.items ?? []) {
        const id = String(a.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const pos = String(a.position?.abbreviation ?? '').toUpperCase();
        const first = String(a.firstName ?? '').trim();
        const last = String(a.lastName ?? '').trim();
        const name = String(a.displayName ?? `${first} ${last}`).trim();
        players.push({
          id,
          name,
          first,
          last,
          teamId: team.id,
          pos,
          group: positionGroup(pos, a.position?.parent?.abbreviation),
          jersey: a.jersey ? String(a.jersey) : undefined,
          heightIn: parseHeight(a.displayHeight, a.height),
          weightLb: parseWeight(a.displayWeight, a.weight),
          age: typeof a.age === 'number' ? a.age : undefined,
          exp: typeof a.experience?.years === 'number' ? a.experience.years : undefined,
          college: a.college?.name ? String(a.college.name) : undefined,
          draft: undefined,
          headshot:
            a.headshot?.href ?? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`,
          fame: 0,
        });
      }
    }
  });

  log(`rosters: ${players.length} unique players`);
  log(
    `roster buckets: ${[...groupCounts.entries()].map(([k, v]) => `${k}=${v}`).join(' ')}`,
  );
  if (unknownPositions.size) {
    warn(
      `unmapped ESPN positions (fell back to parent group): ${[...unknownPositions.entries()]
        .map(([k, v]) => `${k}×${v}`)
        .join(', ')}`,
    );
  }
  return players;
}

/** One request per player for draft capital. ~2.2k requests, all cached. */
async function enrichDrafts(players) {
  const details = await pool('athlete drafts', players, (p) =>
    getJson(`${CORE}/athletes/${p.id}`, { optional: true }),
  );
  let drafted = 0;
  details.forEach((d, i) => {
    const draft = d?.draft;
    if (!draft || !draft.year) return;
    const round = Number(draft.round ?? 0);
    const pick = Number(draft.selection ?? draft.pick ?? 0);
    if (!round || !pick) return;
    players[i].draft = { year: Number(draft.year), round, pick };
    drafted++;
    // Roster data can miss these; the athlete record is the better source.
    if (!players[i].college && typeof d?.college?.name === 'string') {
      players[i].college = d.college.name;
    }
    if (players[i].exp === undefined && typeof d?.experience?.years === 'number') {
      players[i].exp = d.experience.years;
    }
  });
  log(`drafts: ${drafted}/${players.length} players have draft capital`);
}

// ---------------------------------------------------------------------------------------------
// 3. Fame
// ---------------------------------------------------------------------------------------------
/**
 * Fame answers exactly one question: **how likely is a general NFL fan to recognise this face?**
 *
 * It is NOT a measure of production. Two versions of this field have already been rejected for
 * confusing the two. A pure stat-volume score put fifteen quarterbacks in the top twenty-five and
 * no defender in the whole `star` tier. Ranking players inside their own position group and mapping
 * that standing onto a per-group ceiling fixed the shape but broke the meaning: because every group
 * was normalised against its own best three résumés, the leader of a thin group landed near its
 * ceiling whether or not anybody outside a fantasy league had heard of him — that is how Dallas
 * Goedert (no Pro Bowls, no All-Pros), Kevin Byard, Trey McBride and James Cook III reached the top
 * forty while Jayden Daniels sat 248th for missing snaps and Travis Hunter — Heisman winner, second
 * overall pick — sat 736th.
 *
 * The score below is built from what actually makes a face recognisable, in descending order of
 * weight.
 *
 *  1. **Honors, because they are voted on by fans and peers.** Pro Bowl and first-team All-Pro
 *     selections are ballots, not box scores: being picked IS recognition, which is why they carry
 *     more weight here than any leaderboard placing. They accumulate over a whole career and never
 *     decay — nobody forgets an eleven-time Pro Bowler — but `HONOR_CURVE` is deliberately concave,
 *     so the eleventh selection adds far less than the first (it is also what stops a twelve-time
 *     Pro Bowl left tackle or a ten-time Pro Bowl fullback from reading as a household name).
 *     Major awards (MVP, Super Bowl MVP, DPOY/OPOY, the two Rookies of the Year, Comeback) are
 *     folded in per win, with a shallow recency decay floored at `MAJOR_AWARD_FLOOR`: an MVP trophy is
 *     remembered for well over a decade, but a 2011 MVP is not quite a 2024 one.
 *
 *  2. **National profile, as a multiplier.** `fame-signals.json` carries a 0-3 `nationalProfile`
 *     rating — the only input that speaks directly about public recognition rather than football.
 *     It is anchored, not guessed: every one of the 32 current starting quarterbacks has a floor of
 *     1, as does every player on the NFLPA's top-50 merchandise-sales list, with 2 for its top ten.
 *     It both scales the résumé (`PROFILE_MULT`) and adds a floor to it (`PROFILE_ADD`), because a
 *     rookie who is already on billboards has a public profile before he has a résumé at all.
 *     The starting-quarterback anchor is also the direct fix for "injury reads as obscurity": a
 *     starting quarterback is famous whether or not he threw a pass this month.
 *
 *  3. **Draft pedigree and rookie narrative.** A first or second overall pick, a Heisman winner or
 *     a Rookie of the Year is famous the day he is drafted, years before any leaderboard notices.
 *     `PEDIGREE_*` front-loads that and then lets it fade to a permanent floor, because a bust from
 *     2014 is not famous for having been picked third.
 *
 *  4. **Statistics, as corroboration only.** The leaderboard walk is still here and still career-
 *     cumulative across `FAME_SEASONS_BACK` seasons with a shallow `SEASON_DECAY`, so a missed
 *     season can only ever dilute a career total, never reset it. But it is now a supporting term
 *     (`STAT_*`) roughly a third the size of the honors term. It earns its place by ranking the
 *     ~1,570 players `fame-signals.json` does not cover, and by separating starters from backups
 *     down where nobody has any honors at all.
 *
 * Position enters in two places, and neither of them normalises a group against itself:
 *   - `GROUP_WEIGHT` nudges the résumé before the league-wide sort (a linebacker is a shade less
 *     recognisable than an edge rusher with the same honors; a guard far less). Quarterbacks need
 *     no thumb on the scale beyond 1.05, because the `nationalProfile` starting-QB anchor already
 *     encodes "quarterback is the most famous position in the sport" from real evidence.
 *   - `GROUP_CEILING` (and `UNGUESSABLE_CEILING`, applied by raw ESPN position so a mislabelled
 *     guard cannot slip through) is a hard cap. `star` begins at 80, so offensive linemen, kickers,
 *     punters and long snappers cannot reach EASY mode by construction rather than by luck.
 *
 * The final mapping is `RANK_ANCHORS`: league-wide rank → 0-100. One global order means a thin
 * position simply produces no stars, and tier sizes are a property of the curve rather than an
 * accident of the data — ~110 players land in `star`, which is what keeps EASY mode both easy and
 * large enough to play twenty rounds.
 *
 * `fame-signals.json` is loaded defensively, exactly as its `_meta.absentMeans` demands: **a
 * missing id means UNKNOWN, never zero**, and such a player still scores from the leaderboard walk,
 * his draft slot and his experience. A present entry with `proBowls: 0` is a verified zero. The one
 * guard on top of the file is `resolveProfileCollisions`: an editorial `notes` line is written
 * about one person, so two rostered players sharing one is a name collision (the 2026 rookie
 * linebacker Justin Jefferson inherits the receiver's merchandise rank), and only the stronger
 * résumé keeps the rating.
 */

/** Seasons of leaderboards + awards to walk, counting back from the current one. */
const FAME_SEASONS_BACK = 17;
/** Each season further back than the last completed one is worth this much less. */
const SEASON_DECAY = 0.85;
/** The in-progress season is real evidence but only a few weeks of it exist. */
const LIVE_SEASON_WEIGHT = 0.8;
/** Postseason boards are short — being on one at all means you played in January. */
const POSTSEASON_WEIGHT = 0.6;
/** A peak season is remembered; its contribution decays far more slowly than the career sum. */
const PEAK_FLOOR = 0.55;

/** Statistical categories, weighted by how much LEADING one makes you a household name. */
const CATEGORY_WEIGHT = {
  passingYards: 0.95,
  passingTouchdowns: 1.0,
  quarterbackRating: 0.8,
  rushingYards: 1.0,
  rushingTouchdowns: 0.95,
  receivingYards: 1.0,
  receivingTouchdowns: 0.95,
  receptions: 0.85,
  totalTouchdowns: 0.9,
  // Kicker-dominated, so it is the weakest offensive signal.
  totalPoints: 0.35,
  // The marquee defensive stat: sack leaders are as famous as rushing leaders.
  sacks: 1.15,
  interceptions: 1.0,
  passesDefended: 0.75,
  // Deliberately the weakest defensive signal. Tackle volume is as much a symptom of a bad defense
  // as of a famous player — a deep safety on a leaky unit leads it without anyone learning his
  // name, and weighting it higher is what used to put three anonymous safeties in the top forty.
  totalTackles: 0.4,
  kickoffYards: 0.08,
  puntYards: 0.08,
};
/** A top-10 finish in a category at least this heavy makes the season count toward `breadth`. */
const MARQUEE_WEIGHT = 0.8;

/** How fast leaderboard credit falls off with rank, and how much mere presence is worth. */
const ELITE_BASE = 0.88;
const PRESENCE_WEIGHT = 0.18;

/**
 * ESPN's nine season awards. Only used as a FALLBACK for players `fame-signals.json` does not
 * cover — everyone it does cover gets the fuller Wikipedia award list instead, with years.
 * Coach of the Year is deliberately absent.
 */
const AWARD_WEIGHT = {
  'NFL MVP': 1.0,
  'Super Bowl MVP': 0.85,
  'NFL Defensive Player of the Year': 0.85,
  'NFL Offensive Player of the Year': 0.6,
  'NFL Defensive Rookie of the Year': 0.45,
  'NFL Offensive Rookie of the Year': 0.4,
  'NFL Comeback Player of the Year': 0.3,
  'Walter Payton NFL Man of the Year': 0.25,
};
/** Awards fade slowly and never to nothing — an MVP trophy is remembered for a decade. */
const AWARD_DECAY = 0.93;
const AWARD_RECENCY_FLOOR = 0.45;

// --- honors: the heaviest term, because Pro Bowls and All-Pros are ballots -------------------
/** Recognition units for one Pro Bowl / one first-team All-Pro, before the concave curve. */
const PRO_BOWL_UNIT = 2.0;
const ALL_PRO_UNIT = 3.4;
/** Concavity of the selection count. The 11th Pro Bowl adds far less recognition than the 1st. */
const HONOR_CURVE = 0.66;

/** Recognition units per major award win, from `fame-signals.json` (Wikipedia, with years). */
const MAJOR_AWARD_UNIT = {
  'NFL MVP': 5.2,
  'Super Bowl MVP': 4.5,
  'Defensive Player of the Year': 3.2,
  'Offensive Player of the Year': 2.5,
  'Offensive Rookie of the Year': 1.9,
  'Defensive Rookie of the Year': 1.7,
  'Comeback Player of the Year': 1.0,
};
/** Repeat wins are concave too: a second MVP matters, a fourth adds less. */
const MAJOR_AWARD_CURVE = 0.75;
/** Per-win recency, floored: fame is sticky, so a 2011 MVP still counts for most of a 2024 one. */
const MAJOR_AWARD_DECAY = 0.96;
const MAJOR_AWARD_FLOOR = 0.55;

// --- national profile: the only signal that speaks about the general public directly ----------
/** Additive floor by `nationalProfile` 0-3 — a billboard face is famous with no résumé at all. */
const PROFILE_ADD = [0, 2.5, 5.5, 9];
/** …and a multiplier on the whole résumé, which is where most of its force lives. */
const PROFILE_MULT = [1, 1.25, 1.65, 2.1];

// --- draft pedigree and rookie narrative ------------------------------------------------------
const PEDIGREE_TOP = 5.5;
/** Recognition halves roughly every 17 picks: pick 1 ≫ pick 13 ≫ pick 60. */
const PEDIGREE_K = 25;
/** "Number one or two overall" is its own kind of famous. */
const PEDIGREE_TOP3_BONUS = 1.8;
const PEDIGREE_TOP5_BONUS = 0.9;
const HEISMAN_BONUS = 3.0;
/** Pedigree is loudest for rookies and then fades to a permanent floor — busts stop trading on it. */
const PEDIGREE_DECAY = 0.9;
const PEDIGREE_FLOOR = 0.4;
/** Undrafted players are scored as if picked here: effectively no pedigree at all. */
const UNDRAFTED_PICK = 270;

// --- statistics: supporting evidence, about a third the weight of honors ----------------------
const STAT_CAREER = 0.3;
const STAT_PEAK = 0.9;
const STAT_BREADTH = 1.8;
const BREADTH_FULL = 7;
/** ESPN's own award score, used ONLY for players `fame-signals.json` does not cover. */
const ESPN_AWARD_FALLBACK = 2.5;

/** A fifteen-year veteran has simply been on television more often. Smallest term in the score. */
const LONGEVITY = 1.5;
const LONGEVITY_FULL = 10;

/**
 * Nudge applied to the résumé before the single league-wide sort. Small by design: this is a
 * thumb, not a normaliser, and it is what the previous attempt got structurally wrong.
 */
const GROUP_WEIGHT = { QB: 1.05, RB: 1, WR: 1, TE: 1, DL: 1, LB: 0.97, DB: 0.95, OL: 0.72, ST: 0.6 };
/**
 * Hard cap per position group: the highest fame anybody at that position may hold. `star` is 80,
 * so OL and ST cannot reach the game's EASY tier at all — which is the point.
 */
const GROUP_CEILING = { QB: 100, WR: 98, RB: 97, TE: 96, DL: 96, LB: 93, DB: 91, OL: 62, ST: 56 };
/**
 * The same cap by RAW ESPN position, so a lineman or specialist filed under an unexpected group
 * still cannot reach EASY. `scripts/verify-nfl.mjs` asserts this list from the other side.
 */
const UNGUESSABLE_POSITIONS = new Set([
  'OL', 'OT', 'T', 'LT', 'RT', 'OG', 'G', 'LG', 'RG', 'C', // offensive line
  'PK', 'K', 'P', 'LS', 'H', // kicker, punter, long snapper, holder
]);
const UNGUESSABLE_CEILING = 62;

/**
 * League-wide rank → raw fame, linear between anchors. One global order (not one per position) is
 * what stops a thin position from manufacturing stars, and it makes the tier sizes a property of
 * this table: ~110 players clear 80 (`star`), ~520 clear 55 (`starter`), ~1,370 clear 30.
 */
const RANK_ANCHORS = [
  [1, 100],
  [3, 98],
  [6, 96],
  [12, 93],
  [20, 90],
  [32, 87],
  [45, 85],
  [70, 82],
  [110, 80],
  [160, 76],
  [240, 70],
  [340, 64],
  [460, 57],
  [620, 50],
  [820, 43],
  [1050, 37],
  [1350, 30],
  [1700, 22],
  [2100, 12],
  [2600, 1],
];

/** Diminishing returns on a count of anything. */
const concave = (n, power) => (n > 0 ? n ** power : 0);

function emptyEvidence() {
  return {
    /** Recency-weighted leaderboard credit, summed over every season and both season types. */
    career: 0,
    /** Best single (season, type) haul, decayed gently. */
    peak: 0,
    /** Regular seasons containing a top-10 finish in a marquee category. */
    eliteSeasons: new Set(),
    /** Leaderboard slots occupied, and top-5 finishes — reporting only. */
    appearances: 0,
    topFive: 0,
    awardScore: 0,
    awards: [],
  };
}

/**
 * Walk every leaderboard and award ESPN has for the last `FAME_SEASONS_BACK` seasons.
 * ~34 leaderboard requests + ~170 award requests, all cached — cheap next to the roster crawl.
 */
async function fetchFameSignals(season) {
  const evidence = new Map();
  const at = (id) => {
    let e = evidence.get(id);
    if (!e) evidence.set(id, (e = emptyEvidence()));
    return e;
  };

  const years = [];
  for (let y = season; y > season - FAME_SEASONS_BACK; y--) years.push(y);
  const seasonWeight = (year) =>
    year === season ? LIVE_SEASON_WEIGHT : SEASON_DECAY ** (season - 1 - year);

  const rows = [];
  for (const year of years) {
    const sw = seasonWeight(year);
    const row = { season: year, weight: sw.toFixed(3), 'reg slots': 0, 'post slots': 0 };
    for (const [type, typeWeight] of [
      [2, 1],
      [3, POSTSEASON_WEIGHT],
    ]) {
      // limit=250 is the deepest ESPN serves and is what separates a qualifying starter
      // (somewhere on the board) from a backup (nowhere on it).
      const data = await getJson(`${CORE}/seasons/${year}/types/${type}/leaders?limit=${LEADER_DEPTH}`, {
        optional: true,
      });
      if (!data?.categories) {
        if (type === 2) warn(`no regular-season leaders for ${year}`);
        continue;
      }
      /** Credit earned in THIS (season, type) only, so `peak` can see one season at a time. */
      const thisSeason = new Map();
      for (const cat of data.categories) {
        const catWeight = CATEGORY_WEIGHT[cat.name];
        if (catWeight === undefined) continue;
        const list = cat.leaders ?? [];
        const depth = Math.max(1, list.length);
        list.forEach((leader, idx) => {
          const id = refId(leader.athlete?.$ref);
          if (!id) return;
          // `elite` makes leading a category worth vastly more than merely qualifying for it;
          // `presence` hands every player on the board a little credit, normalised by the
          // board's own length (89 qualifying passers vs 250 qualifying tacklers).
          const elite = ELITE_BASE ** idx;
          const presence = Math.max(0, 1 - idx / depth) ** 1.5;
          thisSeason.set(id, (thisSeason.get(id) ?? 0) + catWeight * (elite + PRESENCE_WEIGHT * presence));
          const e = at(id);
          e.appearances++;
          if (idx < 5) e.topFive++;
          if (type === 2 && idx < 10 && catWeight >= MARQUEE_WEIGHT) e.eliteSeasons.add(year);
          row[type === 2 ? 'reg slots' : 'post slots']++;
        });
      }
      for (const [id, raw] of thisSeason) {
        const e = at(id);
        e.career += sw * typeWeight * raw;
        e.peak = Math.max(e.peak, raw * typeWeight * Math.max(PEAK_FLOOR, sw));
      }
    }
    rows.push(row);
  }
  table(rows);

  // --- awards: one index request per season, then one per award ------------------------------
  const awardRefs = [];
  for (const year of years) {
    const index = await getJson(`${CORE}/seasons/${year}/awards`, { optional: true });
    for (const item of index?.items ?? []) {
      const ref = String(item.$ref ?? '').replace(/^http:/, 'https:');
      if (ref) awardRefs.push({ year, ref });
    }
  }
  const awardDocs = await pool('awards', awardRefs, (a) => getJson(a.ref, { optional: true }));
  const awardTally = new Map();
  const unknownAwards = new Set();
  awardDocs.forEach((doc, i) => {
    if (!doc) return;
    const { year } = awardRefs[i];
    const name = String(doc.name ?? '');
    const weight = AWARD_WEIGHT[name];
    if (weight === undefined) {
      unknownAwards.add(name);
      return;
    }
    const recency = Math.max(AWARD_RECENCY_FLOOR, AWARD_DECAY ** Math.max(0, season - year));
    for (const winner of doc.winners ?? []) {
      const id = refId(winner.athlete?.$ref);
      if (!id) continue;
      const e = at(id);
      e.awardScore += weight * recency;
      e.awards.push(`${name} '${String(year).slice(2)}`);
      awardTally.set(name, (awardTally.get(name) ?? 0) + 1);
    }
  });
  table(
    [...awardTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([award, winners]) => ({ award, winners, weight: AWARD_WEIGHT[award] })),
  );
  if (unknownAwards.size) log(`awards ignored (no fame weight): ${[...unknownAwards].join(', ')}`);
  log(
    `fame signals: ${evidence.size} players on a leaderboard or award list across ${years.length} seasons`,
  );
  return evidence;
}

/**
 * Read the committed `fame-signals.json` (Pro Bowls, first-team All-Pros, major awards, Heisman,
 * draft slot, editorial `nationalProfile`). It is a hand-verified INPUT like facts.json and is never
 * written by this script.
 *
 * Absence is harmless at every level, per the file's own `_meta.absentMeans`: no file, no `players`
 * map or no entry for a player all mean UNKNOWN, and the score falls back to the leaderboard walk,
 * the draft slot and experience. Only a present entry counts as a verified zero.
 */
async function readAccolades() {
  let raw;
  try {
    raw = JSON.parse(await readFile(join(OUT_DIR, 'fame-signals.json'), 'utf8'));
  } catch {
    warn('fame-signals.json is missing — fame will fall back to leaderboards, draft and experience');
    return {};
  }
  const table = raw?.players;
  if (!table || typeof table !== 'object') {
    warn('fame-signals.json has no `players` map — fame will score from leaderboards alone');
    return {};
  }
  const entries = Object.values(table);
  const rated = entries.filter((a) => (a?.nationalProfile ?? 0) > 0).length;
  const honored = entries.filter((a) => (a?.proBowls ?? 0) > 0 || (a?.allPros ?? 0) > 0).length;
  log(
    `accolades: ${entries.length} players from fame-signals.json ` +
      `(${honored} with a Pro Bowl or All-Pro, ${rated} with a national profile above 0)`,
  );
  return table;
}

/**
 * An editorial `notes` line in fame-signals.json argues one specific player's public profile, so
 * two rostered players sharing one verbatim is a name collision — the harvest matched a merchandise
 * or editorial anchor by name. Exactly one exists today: the 2026 fifth-round rookie linebacker
 * Justin Jefferson picked up the Vikings receiver's "Griddy" note and his top-10 merchandise rank.
 *
 * Only the stronger résumé keeps the rating; everyone else falls back to profile 0 (unknown). Their
 * own harvested Pro Bowls, All-Pros and draft slot are untouched — those were read from their own
 * article and are correct.
 */
function resolveProfileCollisions(players, table) {
  const byNote = new Map();
  for (const p of players) {
    const note = table[p.id]?.notes;
    if (!note) continue;
    if (!byNote.has(note)) byNote.set(note, []);
    byNote.get(note).push(p);
  }
  const strength = (p) => {
    const a = table[p.id] ?? {};
    return (a.proBowls ?? 0) + 2 * (a.allPros ?? 0) + 3 * (a.majorAwards?.length ?? 0) + (p.exp ?? 0) / 10;
  };
  const demoted = new Set();
  for (const shared of byNote.values()) {
    if (shared.length < 2) continue;
    const keep = shared.reduce((best, p) => (strength(p) > strength(best) ? p : best), shared[0]);
    for (const p of shared) {
      if (p === keep) continue;
      demoted.add(p.id);
      warn(
        `nationalProfile collision: "${p.name}" (${p.pos}, id ${p.id}) shares an editorial note with ` +
          `"${keep.name}" (${keep.pos}, id ${keep.id}) — treating the profile as unknown for the former`,
      );
    }
  }
  return demoted;
}

/** League-wide rank (1-based) → raw fame, linear between `RANK_ANCHORS`. */
function rawFameFromRank(rank) {
  const a = RANK_ANCHORS;
  if (rank <= a[0][0]) return a[0][1];
  for (let i = 0; i < a.length - 1; i++) {
    const [r0, f0] = a[i];
    const [r1, f1] = a[i + 1];
    if (rank <= r1) return f0 + ((f1 - f0) * (rank - r0)) / (r1 - r0);
  }
  return a[a.length - 1][1];
}

/** Career recognition units from voted honors: Pro Bowls, first-team All-Pros, major awards. */
function honorUnits(accolade, season) {
  if (!accolade) return { units: 0, proBowls: 0, allPros: 0, awards: [] };
  const proBowls = Math.max(0, accolade.proBowls ?? 0);
  const allPros = Math.max(0, accolade.allPros ?? 0);
  let awardUnits = 0;
  const awards = [];
  for (const award of accolade.majorAwards ?? []) {
    const unit = MAJOR_AWARD_UNIT[award.award];
    if (unit === undefined) continue;
    const years = Array.isArray(award.years) && award.years.length ? award.years : null;
    const wins = Math.max(1, award.count ?? years?.length ?? 1);
    // Each win is discounted by its own age, floored — fame is sticky, memory is not perfect.
    const effective = years
      ? years.reduce(
          (n, y) => n + Math.max(MAJOR_AWARD_FLOOR, MAJOR_AWARD_DECAY ** Math.max(0, season - y)),
          0,
        )
      : wins * MAJOR_AWARD_FLOOR;
    awardUnits += unit * concave(effective, MAJOR_AWARD_CURVE);
    awards.push(wins > 1 ? `${award.award} ×${wins}` : award.award);
  }
  return {
    units:
      PRO_BOWL_UNIT * concave(proBowls, HONOR_CURVE) +
      ALL_PRO_UNIT * concave(allPros, HONOR_CURVE) +
      awardUnits,
    proBowls,
    allPros,
    awards,
  };
}

/** Draft slot + Heisman, front-loaded for rookies and fading to `PEDIGREE_FLOOR`. */
function pedigreeUnits(player, accolade, season) {
  const pick = player.draft?.pick ?? UNDRAFTED_PICK;
  let units = PEDIGREE_TOP * Math.exp(-(pick - 1) / PEDIGREE_K);
  if (pick <= 3) units += PEDIGREE_TOP3_BONUS;
  else if (pick <= 5) units += PEDIGREE_TOP5_BONUS;
  if (accolade?.heisman) units += HEISMAN_BONUS;
  const age = Math.max(0, season - (player.draft?.year ?? season));
  return units * Math.max(PEDIGREE_FLOOR, PEDIGREE_DECAY ** age);
}

/**
 * Turn the evidence into `player.fame`, in place.
 *
 * Returns `{ order, parts }`: the league-wide order most-famous-first plus the résumé breakdown
 * behind every player, for the report tables.
 */
function scoreFame(players, signals, accolades, season) {
  const table = accolades ?? {};
  const demoted = resolveProfileCollisions(players, table);
  const evidence = players.map((p) => signals.get(p.id) ?? emptyEvidence());

  const parts = players.map((p, i) => {
    const e = evidence[i];
    const a = table[p.id];

    const honors = honorUnits(a, season);
    const pedigree = pedigreeUnits(p, a, season);

    // Statistics corroborate; they do not lead. `career` already sums every season walked, so a
    // season lost to injury dilutes a career total rather than resetting it.
    const breadth = Math.min(1, e.eliteSeasons.size / BREADTH_FULL);
    let stat = STAT_CAREER * e.career + STAT_PEAK * e.peak + STAT_BREADTH * breadth;
    // ESPN's award list is the only award signal for a player fame-signals.json never saw.
    if (!a) stat += ESPN_AWARD_FALLBACK * e.awardScore;

    const longevity = LONGEVITY * Math.min(1, (p.exp ?? 0) / LONGEVITY_FULL);

    // Absent entry → profile 0 → multiplier 1 and no additive floor: unknown, never a penalty.
    const profile = a && !demoted.has(p.id) ? Math.min(3, Math.max(0, Math.round(a.nationalProfile ?? 0))) : 0;
    const resume = PROFILE_MULT[profile] * (honors.units + pedigree + stat + longevity) + PROFILE_ADD[profile];

    return {
      /** The sort key: the whole résumé, nudged by position group. */
      resume: resume * (GROUP_WEIGHT[p.group] ?? 0.9),
      honors: honors.units,
      proBowls: honors.proBowls,
      allPros: honors.allPros,
      awards: honors.awards,
      profile,
      pedigree,
      stat,
    };
  });

  // ONE league-wide order. No per-group normalisation, so a position with nobody famous in it
  // produces nobody famous — which is the whole fix.
  const order = players
    .map((_, i) => i)
    .sort(
      (a, b) => parts[b].resume - parts[a].resume || players[a].name.localeCompare(players[b].name),
    );

  order.forEach((i, idx) => {
    const p = players[i];
    const ceiling = Math.min(
      GROUP_CEILING[p.group] ?? 80,
      UNGUESSABLE_POSITIONS.has(String(p.pos).toUpperCase()) ? UNGUESSABLE_CEILING : 100,
    );
    p.fame = Math.max(1, Math.min(ceiling, Math.round(rawFameFromRank(idx + 1))));
  });

  return { order, parts };
}

/** Tier bands, exactly as documented in CLAUDE.md and implemented by `src/scout/subjects.ts`. */
const TIERS = [
  ['star', 80, 101],
  ['starter', 55, 80],
  ['rotation', 30, 55],
  ['deepCut', 0, 30],
];
const tierOf = (fame) => TIERS.find(([, lo, hi]) => fame >= lo && fame < hi)?.[0] ?? 'deepCut';
const REPORT_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];
const DEFENSIVE_GROUPS = ['DL', 'LB', 'DB'];

/** The top 50, the tier histogram, a position breakdown per tier and the shape checks. */
function reportFame(players, teams, scored) {
  const { order, parts } = scored;
  const abbrOf = new Map(teams.map((t) => [t.id, t.abbr]));

  log('fame top 50 — these should read as household names:');
  table(
    order.slice(0, 50).map((i, n) => {
      const p = players[i];
      const t = parts[i];
      return {
        '#': n + 1,
        fame: p.fame,
        player: p.name,
        pos: p.pos,
        grp: p.group,
        team: abbrOf.get(p.teamId) ?? '?',
        resume: t.resume.toFixed(1),
        honors: t.honors.toFixed(1),
        pb: t.proBowls,
        ap: t.allPros,
        prof: t.profile,
        draft: t.pedigree.toFixed(1),
        stat: t.stat.toFixed(1),
        awards: t.awards.slice(0, 2).join(', '),
      };
    }),
  );

  log('position-group histogram per tier:');
  table(
    TIERS.map(([name, lo, hi]) => {
      const rows = players.filter((p) => tierOf(p.fame) === name);
      const row = { tier: name, band: `${lo}-${hi - 1}`, total: rows.length };
      for (const g of REPORT_GROUPS) row[g] = rows.filter((p) => p.group === g).length;
      return row;
    }),
  );

  log('ceiling vs the most famous player at every position group:');
  table(
    REPORT_GROUPS.map((g) => {
      const best = order.find((i) => players[i].group === g);
      return {
        group: g,
        ceiling: GROUP_CEILING[g],
        weight: GROUP_WEIGHT[g],
        fame: best === undefined ? '-' : players[best].fame,
        player: best === undefined ? '(none)' : players[best].name,
        team: best === undefined ? '' : (abbrOf.get(players[best].teamId) ?? '?'),
      };
    }),
  );

  // The shape the two rejected versions of this score got wrong. `scripts/verify-nfl.mjs` turns
  // every line here into a hard assertion; this table is so a sync run shows it without waiting.
  const top40 = [...players].sort((a, b) => b.fame - a.fame || a.name.localeCompare(b.name)).slice(0, 40);
  const stars = players.filter((p) => p.fame >= 80);
  const count = (rows, test) => rows.filter(test).length;
  log('top-40 and star-tier shape:');
  table([
    { property: 'quarterbacks in the top 40', want: '12-18', got: count(top40, (p) => p.group === 'QB') },
    { property: 'defenders in the top 40', want: '>=4', got: count(top40, (p) => DEFENSIVE_GROUPS.includes(p.group)) },
    { property: 'tight ends in the top 40', want: '>=2', got: count(top40, (p) => p.group === 'TE') },
    { property: 'star tier size', want: '60-140', got: stars.length },
    { property: 'star tier position groups', want: 'QB RB WR TE DL LB DB', got: [...new Set(stars.map((p) => p.group))].sort().join(' ') },
    {
      property: 'OL / K / P / LS in the star tier',
      want: '0',
      got: count(stars, (p) => p.group === 'OL' || p.group === 'ST' || UNGUESSABLE_POSITIONS.has(p.pos.toUpperCase())),
    },
  ]);
}

/** Curated nicknames — only ones that are genuinely in common use. */
const NICKNAMES = {
  'Christian McCaffrey': ['cmc', 'run cmc'],
  'Patrick Mahomes': ['pat mahomes', 'showtime'],
  'Tyreek Hill': ['cheetah'],
  'Amon-Ra St. Brown': ['sun god', 'amon ra st brown'],
  'Ja’Marr Chase': ['jamarr chase'],
  "Ja'Marr Chase": ['jamarr chase'],
  'T.J. Watt': ['tj watt'],
  'A.J. Brown': ['aj brown'],
  'D.K. Metcalf': ['dk metcalf', 'dk'],
  'CeeDee Lamb': ['ceedee'],
  'Saquon Barkley': ['saquon'],
  'Lamar Jackson': ['lamar'],
  'Jalen Hurts': ['hurts'],
  'Myles Garrett': ['myles'],
  'Aidan Hutchinson': ['hutch'],
  'Puka Nacua': ['puka'],
};

function addAliases(players) {
  const lastCount = new Map();
  for (const p of players) {
    const k = normName(p.last);
    lastCount.set(k, (lastCount.get(k) ?? 0) + 1);
  }
  for (const p of players) {
    const set = new Set(NICKNAMES[p.name] ?? []);
    // A bare surname is only safe when it is unique league-wide.
    if (p.last && lastCount.get(normName(p.last)) === 1) set.add(p.last.toLowerCase());
    // Punctuation-free spelling ("jamarr chase", "dk metcalf", "amon ra st brown").
    const plain = `${p.first} ${p.last}`
      .toLowerCase()
      .replace(/[.'’]/g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (plain && plain !== p.name.toLowerCase()) set.add(plain);
    if (set.size) p.aliases = [...set].sort();
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Highlights
// ---------------------------------------------------------------------------------------------

/**
 * Gamebook names look like `J.Elliott`, `T.J.Watt`, `A.St.Brown`, `J.Smith-Njigba`, and may carry
 * a team prefix (`PHI-Q.Mitchell`). When team-mates share initial + surname the gamebook uses more
 * of the first name — `Jo.Simpson`, `Qi.Williams`, `Bri.Thomas` — hence up to three letters.
 * Group 1 = team abbr, 2 = initials, 3 = surname.
 */
const NAME_RE = /\b(?:([A-Z]{2,3})-)?((?:[A-Z][a-z]{0,2}\.){1,3})\s?([A-Z][A-Za-z'’\-]*)/g;

/**
 * Surname particles the gamebook writes with a dot, so they look like an initial:
 * `A.St.Brown`, `J.Mc.Kinney`. When the last "initial" is one of these it belongs to the surname.
 */
const NAME_PARTICLES = new Set(['St', 'Mc', 'Mac', 'De', 'Del', 'Di', 'Du', 'La', 'Le', 'Van', 'Von', 'O']);

/**
 * Play `type.text` values worth a round. Taken from a scan of real ESPN summaries — note that a
 * plain interception is typed `Pass Interception Return`, and that the "Safety" texts carry full
 * names with no gamebook abbreviation, so they are deliberately left out.
 */
const KEEP_KINDS = new Set([
  'Rush',
  'Pass Reception',
  'Passing Touchdown',
  'Rushing Touchdown',
  'Sack',
  'Pass Interception Return',
  'Interception Return Touchdown',
  'Fumble Recovery (Opponent)',
  'Sack Opp Fumble Recovery',
  'Fumble Return Touchdown',
  'Kickoff Return Touchdown',
  'Punt Return Touchdown',
]);

/** NFL gamebook team codes inside play text differ from ESPN's team abbreviations. */
const GAMEBOOK_ABBR = {
  CLV: 'CLE',
  BLT: 'BAL',
  HST: 'HOU',
  ARZ: 'ARI',
  WAS: 'WSH',
  LA: 'LAR',
  SL: 'LAR',
  STL: 'LAR',
  OAK: 'LV',
  LVR: 'LV',
  SD: 'LAC',
  SDG: 'LAC',
};

/** Words that look like surnames in a football gamebook but are not. */
const NOT_A_SURNAME = new Set([
  'long', 'short', 'deep', 'left', 'right', 'middle', 'end', 'guard', 'center', 'tackle',
  'pass', 'rush', 'punt', 'kick', 'field', 'goal', 'good', 'play', 'penalty', 'holder',
  'snap', 'yards', 'line', 'down', 'safety', 'touchdown', 'shotgun', 'huddle', 'quarter',
  'half', 'game', 'period', 'timeout', 'reversed', 'upheld', 'stands', 'formation', 'contact',
  'holding', 'illegal', 'false', 'start', 'offsetting', 'declined', 'enforced', 'injured',
  'aborted', 'muffed', 'touchback', 'onside', 'extra', 'point', 'conversion', 'attempt',
]);

/**
 * Position groups that can plausibly fill each role. A 2024 play's "A.Cooper" (Amari, long gone)
 * would otherwise resolve to today's lone Cooper on that roster — a guard. Cheap insurance: we
 * have four times more candidates than slots, so dropping the doubtful ones costs nothing.
 */
const ROLE_GROUPS = {
  first: ['RB', 'QB', 'WR', 'TE'],
  receiver: ['WR', 'TE', 'RB', 'QB'],
  parens: ['DL', 'LB', 'DB'],
  interceptor: ['DL', 'LB', 'DB'],
  recoverer: ['DL', 'LB', 'DB', 'ST', 'RB', 'WR', 'TE'],
  returner: ['WR', 'RB', 'DB', 'ST'],
};

/** Per-kind target role: who the round asks about, and which side of the ball they are on. */
function targetSpec(kind) {
  switch (kind) {
    case 'Rush':
    case 'Rushing Touchdown':
      return { role: 'first', side: 'offense' };
    case 'Pass Reception':
    case 'Passing Touchdown':
    case 'Pass Reception Touchdown':
      return { role: 'receiver', side: 'offense' };
    case 'Sack':
      return { role: 'parens', side: 'defense' };
    case 'Pass Interception Return':
    case 'Interception Return Touchdown':
      return { role: 'interceptor', side: 'defense' };
    case 'Fumble Recovery (Opponent)':
    case 'Sack Opp Fumble Recovery':
    case 'Fumble Return Touchdown':
      return { role: 'recoverer', side: 'defense' };
    case 'Kickoff Return Touchdown':
    case 'Punt Return Touchdown':
      return { role: 'returner', side: 'offense' };
    default:
      return null;
  }
}

/** All `Initial.Surname` tokens in a play text, with their exact spans. */
function nameTokens(text) {
  const out = [];
  NAME_RE.lastIndex = 0;
  let m;
  while ((m = NAME_RE.exec(text)) !== null) {
    const segments = m[2].split('.').filter(Boolean);
    let surname = m[3].replace(/[\-'’]+$/, '');
    // "A.St." + "Brown" -> initials "A", surname "StBrown".
    while (segments.length > 1 && NAME_PARTICLES.has(segments[segments.length - 1])) {
      surname = segments.pop() + surname;
    }
    if (!surname || surname.length < 2) continue;
    // NOTE: NOT_A_SURNAME is deliberately NOT consulted here. The leading "X." initial already
    // proves this is a name, and players really are called Rush, Long and Short — filtering them
    // out here would leave their names unredacted in the puzzle text.
    const teamAbbr = m[1] ?? null;
    // Span covers just the name (initials + surname), leaving any "PHI-" prefix in place.
    const nameStart = m.index + (m[1] ? m[1].length + 1 : 0);
    const nameEnd = m.index + m[0].length - (m[3].length - m[3].replace(/[\-'’]+$/, '').length);
    out.push({
      teamAbbr,
      initials: segments.join(''),
      surname,
      start: nameStart,
      end: nameEnd,
      raw: text.slice(nameStart, nameEnd),
    });
  }
  return out;
}

function buildPlayerIndex(players) {
  const byTeamLast = new Map(); // teamId -> normLast -> players
  const byLast = new Map(); // normLast -> players
  for (const p of players) {
    // Index under both spellings: the gamebook writes "K.Walker" where ESPN stores
    // lastName "Walker III", so the bare surname has to be a key too.
    const keys = new Set([normName(p.last), normName(baseSurname(p.last))].filter(Boolean));
    if (!keys.size) continue;
    if (!byTeamLast.has(p.teamId)) byTeamLast.set(p.teamId, new Map());
    const tm = byTeamLast.get(p.teamId);
    for (const key of keys) {
      if (!tm.has(key)) tm.set(key, []);
      tm.get(key).push(p);
      if (!byLast.has(key)) byLast.set(key, []);
      byLast.get(key).push(p);
    }
  }
  return { byTeamLast, byLast };
}

/** Does `initials` (e.g. "TJ", "A") prefix this player's given name(s)? */
function initialsMatch(initials, player) {
  const given = `${player.first}`.trim();
  if (!given) return false;
  const letters = normName(initials).toUpperCase();
  if (!letters) return false;
  // "A" vs "Amon-Ra"; "TJ" vs "T.J."; "CJ" vs "Christopher"? no — require real prefixes.
  const parts = given.split(/[\s.\-']+/).filter(Boolean);
  const initialsOfGiven = parts.map((s) => s[0].toUpperCase()).join('');
  if (initialsOfGiven.startsWith(letters)) return true;
  // Gamebooks abbreviate "T.J. Watt" as "T.Watt" — a single initial may match the first letter.
  if (letters.length === 1 && parts[0][0].toUpperCase() === letters) return true;
  // When two team-mates share initial + surname the gamebook writes more of the first name
  // ("Jo.Simpson" for Josh Simpson), so a prefix of the given name counts too.
  if (letters.length > 1 && normName(parts[0]).toUpperCase().startsWith(letters)) return true;
  return false;
}

/**
 * Resolve one gamebook token to a roster player: team-scoped first (the two competing teams,
 * preferring the side of the ball the role implies), then league-wide if unique.
 */
function resolveToken(tok, index, ctx, { strictSide = false } = {}) {
  const key = normName(tok.surname);
  if (!key) return null;

  const tryTeam = (teamId) => {
    const bucket = index.byTeamLast.get(teamId)?.get(key);
    if (!bucket) return null;
    const hit = bucket.filter((p) => initialsMatch(tok.initials, p));
    if (hit.length === 1) return hit[0];
    // Sole surname on the roster: accept, but only when the first letter still agrees. Without
    // that guard a 2024 play's departed "M.Collins" silently resolves to today's A. Collins.
    const firstLetter = normName(tok.initials).toUpperCase().slice(0, 1);
    if (hit.length === 0 && bucket.length === 1 &&
        normName(bucket[0].first).toUpperCase().startsWith(firstLetter)) {
      return bucket[0];
    }
    return null;
  };

  if (tok.teamAbbr) {
    const teamId = ctx.abbrToId.get(tok.teamAbbr);
    if (teamId) {
      const hit = tryTeam(teamId);
      if (hit) return hit;
    }
  }
  // The TARGET is resolved strictly: a sacker is on the defence, a rusher on the offence. Without
  // this, an ambiguous "C.Jones" on the defence silently resolves to the offence's lone C.Jones.
  const sideFirst =
    ctx.preferred === 'defense'
      ? [ctx.defenseTeamId, ctx.offenseTeamId]
      : [ctx.offenseTeamId, ctx.defenseTeamId];
  const ordered = strictSide ? [ctx.targetTeamId ?? sideFirst[0]] : sideFirst;
  for (const teamId of ordered) {
    if (!teamId) continue;
    const hit = tryTeam(teamId);
    if (hit) return hit;
  }
  // League-wide fallback, only when unambiguous.
  const all = index.byLast.get(key) ?? [];
  const hit = all.filter((p) => initialsMatch(tok.initials, p));
  if (hit.length === 1) return hit[0];
  return null;
}

/** Pick the token the round should ask about. */
function pickTargetToken(text, allTokens, role) {
  // "W.Reid and M.Dunn reported in as eligible.  N.Chubb right guard for 2 yards, TOUCHDOWN."
  // The linemen who reported in are not the ball carrier; the play starts after that clause.
  let bodyStart = 0;
  const elig = /reported in as eligible\.\s*/g;
  let e;
  while ((e = elig.exec(text)) !== null) bodyStart = e.index + e[0].length;
  const tokens = bodyStart ? allTokens.filter((t) => t.start >= bodyStart) : allTokens;
  if (!tokens.length) return null;
  switch (role) {
    case 'first':
      return tokens[0];
    case 'returner': {
      // "K.Kicker kicks 65 yards from CLV 35 to CIN 0. C.Returner for 100 yards, TOUCHDOWN."
      // The scorer is the last name before the first TOUCHDOWN — never tokens[1], which is
      // usually "Center-L.Snapper". ESPN also mislabels plain kickoffs, so demand the word.
      const td = /\bTOUCHDOWN\b/.exec(text);
      if (!td) return null;
      const before = tokens.filter((t) => t.end <= td.index);
      return before.length ? before[before.length - 1] : null;
    }
    case 'receiver': {
      const m = /\bpass\b[^.]{0,80}?\bto\s/.exec(text);
      if (m) {
        const at = m.index + m[0].length;
        return tokens.find((t) => t.start >= at - 1) ?? null;
      }
      return tokens[1] ?? null;
    }
    case 'interceptor': {
      const m = /INTERCEPTED by\s/i.exec(text);
      if (!m) return null;
      const at = m.index + m[0].length;
      return tokens.find((t) => t.start >= at - 1) ?? null;
    }
    case 'recoverer': {
      const m = /RECOVERED by\s(?:[A-Z]{2,3}-)?/i.exec(text);
      if (!m) return null;
      const at = m.index + m[0].length;
      return tokens.find((t) => t.start >= at - 4) ?? null;
    }
    case 'parens': {
      // The sacker is credited in parentheses inside the sack clause itself. Requiring no period
      // in between keeps us off the tackler on a later fumble return; a sack with nobody credited
      // simply yields no target and the play is dropped.
      const m = /sacked[^().]{0,80}\(([^)]+)\)/.exec(text);
      if (!m) return null;
      const inner = m.index + m[0].length - m[1].length - 1;
      return tokens.find((t) => t.start >= inner && t.end <= inner + m[1].length) ?? null;
    }
    default:
      return null;
  }
}

function redact(text, tokens, resolvedPlayers) {
  let out = '';
  let cursor = 0;
  for (const tok of [...tokens].sort((a, b) => a.start - b.start)) {
    if (tok.start < cursor) continue;
    out += text.slice(cursor, tok.start) + '[?]';
    cursor = tok.end;
  }
  out += text.slice(cursor);
  // Belt and braces: sweep any full surname that survived (case-sensitive, so the football
  // words "long"/"short"/"end" are untouched).
  for (const p of resolvedPlayers) {
    for (const part of [p.last, baseSurname(p.last), p.first]) {
      const word = String(part ?? '').trim();
      if (word.length < 3 || NOT_A_SURNAME.has(word.toLowerCase())) continue;
      const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`, 'g'), '[?]');
    }
  }
  return out;
}

/** Case-sensitive surname check — the football words "long"/"short"/"end" stay lower case. */
function surnameSurvives(redacted, player) {
  const word = baseSurname(player.last);
  if (word.length < 3 || NOT_A_SURNAME.has(word.toLowerCase())) return false;
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`).test(redacted);
}

async function fetchSchedule(seasons) {
  const jobs = [];
  for (const year of seasons) for (let week = 1; week <= 18; week++) jobs.push({ year, week });
  const boards = await pool('scoreboards', jobs, (j) =>
    getJson(`${SITE}/scoreboard?dates=${j.year}&seasontype=2&week=${j.week}`, { optional: true }),
  );
  const games = [];
  boards.forEach((b, i) => {
    const { year, week } = jobs[i];
    for (const e of b?.events ?? []) {
      if (e.status?.type?.completed !== true) continue;
      const comp = e.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === 'home');
      const away = comp?.competitors?.find((c) => c.homeAway === 'away');
      if (!home || !away) continue;
      games.push({
        id: String(e.id),
        season: year,
        week,
        homeId: String(home.id),
        awayId: String(away.id),
      });
    }
  });
  return games;
}

async function fetchHighlights(games, players, teams) {
  const index = buildPlayerIndex(players);
  const abbrToId = new Map(teams.map((t) => [t.abbr, t.id]));
  for (const [gamebook, espn] of Object.entries(GAMEBOOK_ABBR)) {
    const id = abbrToId.get(espn);
    if (id && !abbrToId.has(gamebook)) abbrToId.set(gamebook, id);
  }
  const byId = new Map(players.map((p) => [p.id, p]));

  const summaries = await pool('game summaries', games, (g) =>
    getJson(`${SITE}/summary?event=${g.id}`, { optional: true }),
  );

  const candidates = [];
  const stats = { plays: 0, considered: 0, badFormat: 0, noTarget: 0, unresolved: 0, implausible: 0, leaked: 0 };

  summaries.forEach((s, gi) => {
    const game = games[gi];
    if (!s?.drives?.previous) return;
    for (const drive of s.drives.previous) {
      for (const play of drive.plays ?? []) {
        stats.plays++;
        const kind = String(play.type?.text ?? '');
        const text = String(play.text ?? '');
        if (!text) continue;
        const yards = Number(play.statYardage ?? 0);
        const explosive = yards >= 20 && (kind === 'Rush' || kind === 'Pass Reception');
        const interesting =
          KEEP_KINDS.has(kind) && (play.scoringPlay === true || explosive || kind === 'Sack' ||
            /Interception|Fumble/.test(kind));
        if (!interesting) continue;
        if (/No Play/i.test(text)) continue;
        // A minority of plays carry ESPN's scoring-summary sentence instead of the gamebook one
        // ("Ricky Pearsall 46 Yd pass from Brock Purdy"). Those spell names out in full, so they
        // cannot be redacted token-by-token — drop them. The gamebook never capitalises "Yd(s)".
        if (/\bYds?\b/.test(text) || /\bPass From\b/i.test(text)) {
          stats.badFormat++;
          continue;
        }
        stats.considered++;

        const spec = targetSpec(kind);
        if (!spec) continue;
        const tp = play.teamParticipants ?? [];
        const offenseTeamId = String(tp.find((t) => t.type === 'offense')?.id ?? '');
        const defenseTeamId = String(tp.find((t) => t.type === 'defense')?.id ?? '');
        if (!offenseTeamId || !defenseTeamId) continue;

        const tokens = nameTokens(text);
        if (!tokens.length) continue;
        const targetTok = pickTargetToken(text, tokens, spec.role);
        if (!targetTok) {
          stats.noTarget++;
          continue;
        }
        // Which team the round's subject plays for. For a recovery the text names it outright,
        // and it is not always the defence (a defender can fumble the ball straight back).
        let subjectTeamId = spec.side === 'defense' ? defenseTeamId : offenseTeamId;
        if (spec.role === 'recoverer') {
          const tid = targetTok.teamAbbr ? abbrToId.get(targetTok.teamAbbr) : null;
          if (!tid || (tid !== offenseTeamId && tid !== defenseTeamId)) {
            stats.noTarget++;
            continue;
          }
          subjectTeamId = tid;
        }
        const oppTeamId = subjectTeamId === offenseTeamId ? defenseTeamId : offenseTeamId;

        const ctx = {
          abbrToId,
          offenseTeamId,
          defenseTeamId,
          preferred: spec.side,
          targetTeamId: subjectTeamId,
        };
        const target = resolveToken(targetTok, index, ctx, { strictSide: true });
        if (!target) {
          stats.unresolved++;
          continue;
        }
        if (!ROLE_GROUPS[spec.role].includes(target.group)) {
          stats.implausible++;
          continue;
        }
        const resolved = new Map([[target.id, target]]);
        for (const tok of tokens) {
          if (tok === targetTok) continue;
          const p = resolveToken(tok, index, ctx);
          if (p) resolved.set(p.id, p);
        }
        const redacted = redact(text, tokens, [...resolved.values()]);
        // Mirror of the verifier's assertion: no named player's surname may survive.
        const leaked = [...resolved.values()].some((pp) => surnameSurvives(redacted, pp));
        if (leaked) {
          stats.leaked++;
          continue;
        }

        candidates.push({
          id: `${game.id}-${play.id ?? play.sequenceNumber ?? candidates.length}`,
          season: game.season,
          week: game.week,
          gameId: game.id,
          text,
          redacted,
          playerId: target.id,
          otherPlayerIds: [...resolved.keys()].filter((id) => id !== target.id),
          teamId: subjectTeamId,
          oppTeamId,
          quarter: Number(play.period?.number ?? 0) || 1,
          clock: String(play.clock?.displayValue ?? '0:00'),
          kind,
        });
      }
    }
  });

  log(
    `plays walked ${stats.plays}, interesting ${stats.considered}, dropped: ` +
      `${stats.badFormat} bad format, ${stats.noTarget} no target, ${stats.unresolved} unresolved, ` +
      `${stats.implausible} implausible position, ${stats.leaked} would leak a name ` +
      `→ ${candidates.length} usable`,
  );

  // --- dedupe near-identical texts -----------------------------------------------------------
  const seenShape = new Set();
  const unique = [];
  for (const c of candidates) {
    const shape = `${c.playerId}|${c.kind}|${c.redacted.replace(/\d+/g, '#').replace(/\s+/g, ' ')}`;
    if (seenShape.has(shape)) continue;
    seenShape.add(shape);
    unique.push(c);
  }
  log(`deduped ${candidates.length} → ${unique.length}`);

  // --- spread across teams, players and play kinds --------------------------------------------
  // Prefer famous targets and touchdowns, then round-robin so no team/kind dominates.
  const fameOf = (id) => byId.get(id)?.fame ?? 0;
  const newest = Math.max(...unique.map((c) => c.season), 0);
  // Recent plays are preferred: the further back a play is, the more likely its players have
  // moved on, and the more likely an initial+surname match lands on the wrong man.
  const score = (c) => fameOf(c.playerId) + (newest - c.season) * -14;
  unique.sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1));

  const perPlayer = new Map();
  const perTeam = new Map();
  const perKind = new Map();
  const kindCap = Math.floor(HL_TARGET * HL_MAX_KIND_SHARE);
  const picked = [];

  // Round-robin across play kinds so touchdowns cannot crowd out the explosive-gain texts,
  // which make the best clues ("[?] pass deep right to [?] for 42 yards").
  const byKind = new Map();
  for (const c of unique) {
    if (!byKind.has(c.kind)) byKind.set(c.kind, []);
    byKind.get(c.kind).push(c); // already in global score order
  }
  const kindOrder = [...byKind.keys()].sort((a, b) => byKind.get(b).length - byKind.get(a).length);
  const cursor = new Map(kindOrder.map((k) => [k, 0]));

  const take = (c) => {
    c.__picked = true;
    perPlayer.set(c.playerId, (perPlayer.get(c.playerId) ?? 0) + 1);
    perTeam.set(c.teamId, (perTeam.get(c.teamId) ?? 0) + 1);
    perKind.set(c.kind, (perKind.get(c.kind) ?? 0) + 1);
    picked.push(c);
  };

  for (let round = 1; round <= HL_MAX_PER_PLAYER && picked.length < HL_TARGET; round++) {
    for (const k of kindOrder) cursor.set(k, 0); // reconsider everything each round
    let progressed = true;
    while (progressed && picked.length < HL_TARGET) {
      progressed = false;
      for (const kind of kindOrder) {
        if (picked.length >= HL_TARGET) break;
        if ((perKind.get(kind) ?? 0) >= kindCap) continue;
        const list = byKind.get(kind);
        let i = cursor.get(kind);
        while (i < list.length) {
          const c = list[i++];
          if (c.__picked) continue;
          if ((perPlayer.get(c.playerId) ?? 0) >= round) continue;
          if ((perTeam.get(c.teamId) ?? 0) >= HL_MAX_PER_TEAM) continue;
          take(c);
          progressed = true;
          break;
        }
        cursor.set(kind, i);
      }
    }
  }
  for (const c of unique) delete c.__picked;

  picked.sort((a, b) => a.season - b.season || a.week - b.week || (a.id < b.id ? -1 : 1));
  table([
    { metric: 'highlights kept', value: picked.length },
    { metric: 'distinct players', value: perPlayer.size },
    { metric: 'distinct teams', value: perTeam.size },
    { metric: 'distinct kinds', value: perKind.size },
  ]);
  table(
    [...perKind.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => ({ kind, count })),
  );
  return picked;
}

// ---------------------------------------------------------------------------------------------
// 5. Stat lines
// ---------------------------------------------------------------------------------------------

const STAT_PLAN = {
  QB: [
    ['passing', 'passingYards', 'Pass yds'],
    ['passing', 'passingTouchdowns', 'Pass TD'],
    ['passing', 'interceptions', 'INT'],
    ['passing', 'QBRating', 'Rating'],
    ['rushing', 'rushingYards', 'Rush yds'],
  ],
  RB: [
    ['rushing', 'rushingAttempts', 'Carries'],
    ['rushing', 'rushingYards', 'Rush yds'],
    ['rushing', 'yardsPerRushAttempt', 'Yds/carry'],
    ['rushing', 'rushingTouchdowns', 'Rush TD'],
    ['receiving', 'receptions', 'Rec'],
    ['receiving', 'receivingYards', 'Rec yds'],
  ],
  WR: [
    ['receiving', 'receptions', 'Rec'],
    ['receiving', 'receivingYards', 'Rec yds'],
    ['receiving', 'yardsPerReception', 'Yds/rec'],
    ['receiving', 'receivingTouchdowns', 'Rec TD'],
    ['receiving', 'receivingTargets', 'Targets'],
    ['receiving', 'longReception', 'Longest'],
  ],
  DL: [
    ['defensive', 'totalTackles', 'Tackles'],
    ['defensive', 'sacks', 'Sacks'],
    ['defensive', 'tacklesForLoss', 'TFL'],
    ['defensive', 'QBHits', 'QB hits'],
    ['general', 'fumblesForced', 'Forced FUM'],
  ],
  DB: [
    ['defensive', 'totalTackles', 'Tackles'],
    ['defensive', 'soloTackles', 'Solo'],
    ['defensive', 'passesDefended', 'Pass def'],
    ['defensiveInterceptions', 'interceptions', 'INT'],
    ['defensive', 'sacks', 'Sacks'],
  ],
  OL: [
    ['general', 'gamesPlayed', 'Games'],
    ['defensive', 'totalTackles', 'Tackles'],
  ],
  ST: [
    ['kicking', 'fieldGoalsMade', 'FG made'],
    ['kicking', 'fieldGoalAttempts', 'FG att'],
    ['kicking', 'fieldGoalPct', 'FG %'],
    ['kicking', 'longFieldGoalMade', 'Longest'],
    ['scoring', 'totalPoints', 'Points'],
    ['punting', 'grossAvgPuntYards', 'Punt avg'],
  ],
};
STAT_PLAN.TE = STAT_PLAN.WR;
STAT_PLAN.LB = STAT_PLAN.DL;

function readStats(doc, plan) {
  const cats = new Map((doc?.splits?.categories ?? []).map((c) => [c.name, c]));
  const out = [];
  for (const [catName, statName, label] of plan) {
    const stat = cats.get(catName)?.stats?.find((s) => s.name === statName);
    if (!stat) continue;
    const value = String(stat.displayValue ?? '').trim();
    if (!value || value === '0' || value === '0.0' || value === '--') continue;
    out.push([label, value]);
    if (out.length >= 6) break;
  }
  return out;
}

async function fetchStatLines(players, season) {
  const top = [...players].sort((a, b) => b.fame - a.fame).slice(0, STATLINE_TOP);
  const best = new Map();

  const gather = async (label, candidates, year) => {
    const docs = await pool(label, candidates, (p) =>
      getJson(`${CORE}/seasons/${year}/types/2/athletes/${p.id}/statistics`, { optional: true }),
    );
    docs.forEach((doc, i) => {
      const p = candidates[i];
      const stats = readStats(doc, STAT_PLAN[p.group] ?? STAT_PLAN.WR);
      if (stats.length >= 3) best.set(p.id, { playerId: p.id, season: year, stats });
    });
  };

  // The most recent COMPLETED season is the good line; the live one only fills gaps (rookies).
  await gather(`statlines ${season - 1}`, top, season - 1);
  const missing = top.filter((p) => !best.has(p.id));
  if (missing.length) await gather(`statlines ${season}`, missing, season);

  const lines = [...best.values()];
  log(`statlines: ${lines.length}/${top.length} of the most famous players have a usable line`);
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function writeJson(name, data) {
  const file = join(OUT_DIR, name);
  await writeFile(file, JSON.stringify(data));
  const { size } = await stat(file);
  return { file: name, bytes: size, kb: `${(size / 1024).toFixed(0)} KB` };
}

/**
 * NFL_FAME_ONLY=1 — rescore `fame` in place over the committed players.json.
 *
 * Every other field (roster identity, draft capital, college, headshot, aliases) is already on
 * disk, so this needs nothing but the leaderboard and award documents: ~200 small requests instead
 * of the ~4,500 a full sync makes. `scoreFame` is the same function the full run calls, so the two
 * paths cannot drift.
 */
async function fameOnly() {
  await mkdir(CACHE_DIR, { recursive: true });
  log(`cache: ${CACHE_DIR}${FRESH ? ' (ignoring, NFL_FRESH=1)' : ''}`);
  const [teams, players, meta] = await Promise.all([
    readFile(join(OUT_DIR, 'teams.json'), 'utf8').then(JSON.parse),
    readFile(join(OUT_DIR, 'players.json'), 'utf8').then(JSON.parse),
    readFile(join(OUT_DIR, 'meta.json'), 'utf8').then(JSON.parse),
  ]);
  const season = Number(meta.season);
  if (!Number.isFinite(season)) throw new Error('meta.json has no usable season');
  log(`NFL_FAME_ONLY: rescoring ${players.length} players against season ${season}`);
  const before = new Map(players.map((p) => [p.id, p.fame]));

  const [signals, accolades] = await Promise.all([fetchFameSignals(season), readAccolades()]);
  const scored = scoreFame(players, signals, accolades, season);
  addAliases(players);
  reportFame(players, teams, scored);

  let moved = 0;
  let biggest = { delta: 0 };
  for (const p of players) {
    const delta = p.fame - (before.get(p.id) ?? 0);
    if (delta !== 0) moved++;
    if (Math.abs(delta) > Math.abs(biggest.delta)) biggest = { delta, name: p.name, to: p.fame };
  }
  const written = await writeJson('players.json', players);
  table([
    { metric: 'players rescored', value: players.length },
    { metric: 'fame changed', value: moved },
    { metric: 'largest move', value: biggest.name ? `${biggest.name} ${biggest.delta > 0 ? '+' : ''}${biggest.delta} -> ${biggest.to}` : 'none' },
    { metric: 'players.json', value: written.kb },
    { metric: 'cache hits', value: hits },
    { metric: 'network fetches', value: misses },
    { metric: 'failed fetches', value: failures },
  ]);
  log(`done in ${secs()} — run \`node scripts/verify-nfl.mjs\` next`);
}

async function main() {
  if (FAME_ONLY) return fameOnly();
  if (FACTS_ONLY) return factsOnly();
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  log(`cache: ${CACHE_DIR}${FRESH ? ' (ignoring, NFL_FRESH=1)' : ''}`);

  const { teams: baseTeams, season } = await fetchTeams();
  const teams = await mergeFacts(baseTeams);

  const divisionCheck = new Map();
  for (const t of teams) {
    const k = `${t.conference} ${t.division}`;
    divisionCheck.set(k, (divisionCheck.get(k) ?? 0) + 1);
  }
  table([...divisionCheck.entries()].sort().map(([division, teamCount]) => ({ division, teamCount })));
  if (divisionCheck.size !== 8 || [...divisionCheck.values()].some((n) => n !== 4)) {
    throw new Error('divisions did not resolve to 8 × 4 teams');
  }

  const players = await fetchPlayers(teams);
  await enrichDrafts(players);

  const [signals, accolades] = await Promise.all([fetchFameSignals(season), readAccolades()]);
  const scored = scoreFame(players, signals, accolades, season);
  addAliases(players);
  reportFame(players, teams, scored);

  const seasons = [season - 2, season - 1, season].filter((y) => y > 2000);
  let games = await fetchSchedule(seasons);
  log(`schedule: ${games.length} completed regular-season games across ${seasons.join(', ')}`);
  if (games.length > MAX_GAMES) {
    // Keep an even spread rather than the first N weeks.
    const stride = games.length / MAX_GAMES;
    games = Array.from({ length: MAX_GAMES }, (_, i) => games[Math.floor(i * stride)]);
    log(`NFL_MAX_GAMES: sampled down to ${games.length} games`);
  }

  const highlights = await fetchHighlights(games, players, teams);
  const statlines = await fetchStatLines(players, season);

  const meta = {
    syncedAt: new Date().toISOString(),
    season,
    seasonsWalked: seasons,
    counts: {
      teams: teams.length,
      players: players.length,
      highlights: highlights.length,
      statlines: statlines.length,
    },
  };

  const written = [];
  written.push(await writeJson('teams.json', teams));
  written.push(await writeJson('players.json', players));
  written.push(await writeJson('highlights.json', highlights));
  written.push(await writeJson('statlines.json', statlines));
  written.push(await writeJson('meta.json', meta));

  console.log('');
  log('WROTE');
  table(written.map(({ file, kb }) => ({ file, size: kb })));
  table([
    { metric: 'season', value: season },
    { metric: 'teams', value: teams.length },
    { metric: 'players', value: players.length },
    { metric: 'highlights', value: highlights.length },
    { metric: 'statlines', value: statlines.length },
    { metric: 'total bytes', value: written.reduce((n, w) => n + w.bytes, 0) },
    { metric: 'cache hits', value: hits },
    { metric: 'network fetches', value: misses },
    { metric: 'failed fetches', value: failures },
  ]);
  log(`done in ${secs()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
