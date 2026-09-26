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
 *
 * Outputs (all typed against src/scout/types.ts):
 *   teams.json       32 × NflTeam        (ESPN facts + the curated half from facts.json)
 *   players.json     every rostered player × NflPlayer, each with a 0-100 `fame` score
 *   highlights.json  ~1.2-2k × HighlightPlay, real play text with names replaced by [?]
 *   statlines.json   season stat lines for the most famous players × StatLine
 *   meta.json        { syncedAt, season, counts } — powers loadDataset()
 *
 * facts.json is INPUT (hand-curated) and is merged into teams.json; it is never overwritten.
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

/** How deep to read each statistical-leader category (the API default is only 25). */
const LEADER_DEPTH = 200;

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
  return merged;
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

/** Statistical categories, weighted by how much being a leader in them makes you famous. */
const CATEGORY_WEIGHT = {
  passingYards: 1.0,
  passingTouchdowns: 1.0,
  quarterbackRating: 0.75,
  rushingYards: 1.0,
  rushingTouchdowns: 0.9,
  receivingYards: 1.0,
  receivingTouchdowns: 0.9,
  receptions: 0.85,
  totalTouchdowns: 0.95,
  totalPoints: 0.45,
  sacks: 0.85,
  interceptions: 0.7,
  totalTackles: 0.55,
  passesDefended: 0.5,
  kickoffYards: 0.1,
  puntYards: 0.1,
};

/** Some positions are simply more recognizable. */
const POSITION_FAME = { QB: 1.0, WR: 0.86, RB: 0.84, TE: 0.74, DL: 0.62, LB: 0.58, DB: 0.56, OL: 0.4, ST: 0.28 };

/** Fame anchors: [rank, fame]. Linear between anchors, so the histogram is sane by construction. */
const FAME_ANCHORS = [
  [1, 99],
  [40, 80],
  [400, 55],
  [1050, 30],
];

async function fetchLeaderPoints(season) {
  // Most recent completed season carries the most weight; the in-progress one is noisy.
  const weights = new Map([
    [season - 1, 1.0],
    [season, 0.8],
    [season - 2, 0.55],
  ]);
  const points = new Map(); // playerId -> weighted leaderboard points
  const appearances = new Map(); // playerId -> count
  const rows = [];
  for (const [year, seasonWeight] of weights) {
    // limit=200 goes far deeper than the default 25, which is what separates starters
    // (somewhere on the board) from backups (nowhere on it).
    const data = await getJson(`${CORE}/seasons/${year}/types/2/leaders?limit=${LEADER_DEPTH}`, {
      optional: true,
    });
    if (!data?.categories) {
      warn(`no leaders for ${year}`);
      continue;
    }
    let n = 0;
    for (const cat of data.categories) {
      const catWeight = CATEGORY_WEIGHT[cat.name];
      if (catWeight === undefined) continue;
      (cat.leaders ?? []).forEach((leader, idx) => {
        const id = refId(leader.athlete?.$ref);
        if (!id) return;
        // `elite` makes a top-5 finish worth vastly more than a top-50 one; `presence` gives
        // every qualifying starter a small, gently-decaying amount of credit.
        const elite = 0.9 ** idx;
        const presence = Math.max(0, 1 - idx / LEADER_DEPTH) ** 1.5;
        points.set(id, (points.get(id) ?? 0) + seasonWeight * catWeight * (elite + 0.22 * presence));
        appearances.set(id, (appearances.get(id) ?? 0) + 1);
        n++;
      });
    }
    rows.push({ season: year, weight: seasonWeight, 'leader slots': n });
  }
  table(rows);
  return { points, appearances };
}

function scoreFame(players, leaders) {
  const raw = players.map((p) => {
    const lead = 1 - Math.exp(-(leaders.points.get(p.id) ?? 0) / 2.2); // 0..1, saturating
    const pick = p.draft?.pick;
    const draftScore = pick ? Math.exp(-(pick - 1) / 55) : 0.05;
    const expScore = Math.min(1, (p.exp ?? 0) / 9);
    const posScore = POSITION_FAME[p.group] ?? 0.5;
    return 0.6 * lead + 0.15 * draftScore + 0.07 * expScore + 0.18 * posScore;
  });

  // Rank-calibrate onto the documented bands so the tiers mean what the game says they mean.
  const order = players.map((_, i) => i).sort((a, b) => raw[b] - raw[a]);
  const n = order.length;
  const anchors = [...FAME_ANCHORS, [n, 3]];
  const fameForRank = (rank) => {
    for (let i = 0; i < anchors.length - 1; i++) {
      const [r0, f0] = anchors[i];
      const [r1, f1] = anchors[i + 1];
      if (rank <= r1) {
        const t = r1 === r0 ? 0 : (rank - r0) / (r1 - r0);
        return f0 + (f1 - f0) * Math.max(0, Math.min(1, t));
      }
    }
    return 3;
  };

  // Ties share the same fame so identical résumés score identically.
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && Math.abs(raw[order[j + 1]] - raw[order[i]]) < 1e-9) j++;
    const midRank = (i + j) / 2 + 1;
    const fame = Math.max(1, Math.min(100, Math.round(fameForRank(midRank))));
    for (let k = i; k <= j; k++) players[order[k]].fame = fame;
    i = j + 1;
  }
  return order;
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

async function main() {
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

  const leaders = await fetchLeaderPoints(season);
  const order = scoreFame(players, leaders);
  addAliases(players);

  log('fame top 40 (sanity check — these should be household names):');
  table(
    order.slice(0, 40).map((i, n) => {
      const p = players[i];
      const team = teams.find((t) => t.id === p.teamId);
      return {
        '#': n + 1,
        fame: p.fame,
        player: p.name,
        pos: p.pos,
        team: team?.abbr ?? '?',
        'leaderboards': leaders.appearances.get(p.id) ?? 0,
        draft: p.draft ? `${p.draft.year} R${p.draft.round}P${p.draft.pick}` : 'UDFA',
      };
    }),
  );

  const histogram = [
    ['star  >=80', players.filter((p) => p.fame >= 80).length],
    ['starter 55-79', players.filter((p) => p.fame >= 55 && p.fame < 80).length],
    ['rotation 30-54', players.filter((p) => p.fame >= 30 && p.fame < 55).length],
    ['deepCut <30', players.filter((p) => p.fame < 30).length],
  ];
  table(histogram.map(([tier, count]) => ({ tier, count })));

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
