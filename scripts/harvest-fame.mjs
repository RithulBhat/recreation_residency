/**
 * harvest-fame.mjs — harvest the FAME signals that ESPN's statistics APIs do not carry.
 *
 * WHY THIS EXISTS
 * ---------------
 * `NflPlayer.fame` used to be derived from statistical leaderboards alone, which confuses
 * production with recognizability: Kevin Byard out-ranked Jayden Daniels, and an injured
 * Joe Burrow fell out of `star`. ESPN's public JSON has no accolade data at all — a previous
 * investigation established that `/nfl/awards` exposes only 9 season awards, `/athletes/{id}/awards`
 * returns only those same types, and the v3 athlete payload has no accolades block. So the
 * signals that actually predict "would a fan recognize this face" have to come from elsewhere.
 *
 * WHAT IT WRITES
 * --------------
 * `src/data/nfl/fame-signals.json`: `{ _meta, players: { <espnAthleteId>: FameSignals } }`
 *
 *   proBowls        number   Pro Bowl selections (a literal fan vote — the best fame proxy there is)
 *   allPros         number   First-team All-Pro selections (second-team is deliberately ignored)
 *   majorAwards     []       { award, years[] } for MVP / OPOY / DPOY / OROY / DROY / SB MVP / CPOY
 *   draft           {}       { year, round, pick } as verified on Wikipedia (cross-checked vs players.json)
 *   heisman         boolean  won the Heisman Trophy
 *   nationalProfile 0..3     general-public recognition; anchored to sourced lists, then curated
 *   notes           string   present only to justify nationalProfile >= 2
 *   profileFrom     []       which anchors produced nationalProfile
 *
 * CONTRACT WITH THE SCORER
 * ------------------------
 * An entry is only written for a player whose Wikipedia biography was positively identified as
 * *that* player (draft pick match, or three agreements among college/position/team/jersey, or two
 * with nothing contradicting them — see verifyIdentity). Every unverified or
 * unmatched player is simply ABSENT, and absence means "unknown", never "zero" — the scorer must
 * treat a missing id as "no signal available" and fall back to its other inputs. Conversely a
 * present entry with `proBowls: 0` is a real, verified zero: we read that player's accolade list.
 * Pro Bowl counts are never inferred, estimated or invented.
 *
 * SOURCES
 * -------
 * - Wikipedia (en) MediaWiki API — `Infobox gridiron football biography` / `Infobox NFL player`
 *   highlights → Pro Bowls, first-team All-Pro, major awards, Heisman, draft slot. Batched 40
 *   titles per request; every response is cached under the scratch dir so runs resume.
 * - NFLPA Top 50 player sales list (Mar 2025 – Feb 2026) → nationalProfile floor: top 10 ⇒ 2,
 *   top 50 ⇒ 1. What fans actually buy is evidence, not opinion.
 * - Wikipedia "List of current NFL starting quarterbacks" → nationalProfile floor of 1. This is
 *   the fix for the injured-and-therefore-invisible problem: a starting QB is a famous person
 *   whether or not he threw a pass this month.
 * - Above those floors, nationalProfile 2 and 3 are editorial and each carries a `notes` line.
 *
 * RESOLUTION, in three passes, each one verified before it counts (see verifyIdentity):
 *   1. the roster name, and the roster name minus its suffix
 *   2. conventional disambiguators — "(American football)", "(American football, born YYYY)",
 *      apostrophe-stripped, and long/short first-name forms (Joshua ↔ Josh)
 *   3. `intitle:` search, verifying every candidate it returns
 *
 * USAGE
 *   node scripts/harvest-fame.mjs             # resumable; uses the cache
 *   node scripts/harvest-fame.mjs --refresh   # ignore the cache and refetch
 *   node scripts/harvest-fame.mjs --spot      # print the spot-check table and exit
 *   node scripts/harvest-fame.mjs --limit=40  # smoke test; writes to the scratch dir, not src/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(ROOT, 'src', 'data', 'nfl');
const OUT = join(DATA, 'fame-signals.json');

const SCRATCH =
  process.env.FAME_SCRATCH ??
  '/private/tmp/claude-501/-Users-rithulbhat/1fd27c24-bed9-4560-b8c7-da95d55d2b85/scratchpad/fame2/signals';
const RAW = join(SCRATCH, 'raw');
const CACHE_WIKI = join(RAW, 'wiki');
const CACHE_SEARCH = join(RAW, 'search');

const UA = 'songooner-highlight-scout-fame-harvest/1.0 (one-off dataset build; contact rithul.bhat@gmail.com)';
const API = 'https://en.wikipedia.org/w/api.php';

const REFRESH = process.argv.includes('--refresh');
const SPOT_ONLY = process.argv.includes('--spot');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? 0);

// ---------------------------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDirs() {
  for (const d of [RAW, CACHE_WIKI, CACHE_SEARCH]) mkdirSync(d, { recursive: true });
}

/**
 * Filesystem-safe cache key. The hash suffix is load-bearing: sanitising alone collides
 * ("Tre' Harris" and "Tre Harris" both flatten to "Tre_Harris"), which silently served one
 * player's cache entry to another and cost real coverage.
 */
function cacheKey(s) {
  const hash = createHash('sha1').update(s).digest('hex').slice(0, 8);
  return `${s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120)}.${hash}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readCache(dir, key) {
  const p = join(dir, `${cacheKey(key)}.json`);
  if (!REFRESH && existsSync(p)) {
    try {
      return readJson(p);
    } catch {
      return null;
    }
  }
  return null;
}

function writeCache(dir, key, value) {
  writeFileSync(join(dir, `${cacheKey(key)}.json`), JSON.stringify(value), 'utf8');
}

async function apiGet(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(600 * (attempt + 1) ** 2);
    }
  }
  throw new Error(`wikipedia api failed: ${String(lastErr)}`);
}

// ---------------------------------------------------------------------------------------------
// wikitext parsing
// ---------------------------------------------------------------------------------------------

// Older/rookie articles use `Infobox NFL player`; the modern standard is
// `Infobox gridiron football biography`. Both appear in the live corpus.
const INFOBOX_RE =
  /\{\{\s*Infobox (?:gridiron football biography|NFL player|NFL biography|American football biography)/i;

/** Slice out the balanced `{{Infobox …}}` template, or null. */
export function extractInfobox(text) {
  const m = INFOBOX_RE.exec(text);
  if (!m) return null;
  let depth = 0;
  for (let k = m.index; k < text.length - 1; k++) {
    const two = text.slice(k, k + 2);
    if (two === '{{') {
      depth++;
      k++;
      continue;
    }
    if (two === '}}') {
      depth--;
      k++;
      if (depth === 0) return text.slice(m.index, k + 1);
    }
  }
  return null;
}

/** Split a template body into `name → raw value`, respecting nested `{{}}` / `[[]]`. */
export function templateFields(box) {
  const nl = box.indexOf('\n');
  const inner = box.slice(nl >= 0 ? nl : 0, box.length - 2);
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let k = 0; k < inner.length; k++) {
    const two = inner.slice(k, k + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      cur += two;
      k++;
      continue;
    }
    if (two === '}}' || two === ']]') {
      depth--;
      cur += two;
      k++;
      continue;
    }
    if (inner[k] === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += inner[k];
  }
  parts.push(cur);
  const out = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    if (key && !(key in out)) out[key] = p.slice(eq + 1).trim();
  }
  return out;
}

/** Wikitext → readable plain text (drops refs, notes, comments, markup). */
export function plain(wiki) {
  let s = wiki ?? '';
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<ref[^>]*\/>/gi, '');
  s = s.replace(/<ref[\s\S]*?<\/ref>/gi, '');
  // {{efn|…}} / {{refn|…}} / {{sfn|…}} — balanced-ish removal
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/\{\{\s*(?:efn|refn|sfn|sfnp|ref|NoteTag)[^{}]*\}\}/gi, '');
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\{\{\s*(?:ubl|unbulleted list|plainlist|hlist|flatlist)\s*\|/gi, '');
  s = s.replace(/\{\{\s*NFL Year\s*\|\s*(\d{4})\s*\}\}/gi, '$1');
  s = s.replace(/\{\{\s*nowrap\s*\|([^{}]*)\}\}/gi, '$1');
  s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1');
  s = s.replace(/\[\[([^\]]*)\]\]/g, '$1');
  s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s.replace(/<\/?[a-z][^>]*>/gi, ' ');
  s = s.replace(/'''?/g, '');
  s = s.replace(/&nbsp;/g, ' ');
  s = s.replace(/&ndash;|&mdash;/g, '-');
  return s.replace(/[ \t]+/g, ' ').trim();
}

const COLLEGE_AND_CONFERENCE =
  /\b(?:Big 12|Big Ten|Big East|SEC|ACC|Pac-12|Pac-10|Conference USA|C-USA|Mountain West|American Athletic|AAC|MAC|Sun Belt|SWAC|MEAC|Ivy League|CAA|Missouri Valley|Big Sky|Southland|WAC|Big South|Patriot League|NCAA|college|collegiate|All-America|All-American|freshman|Freshman|bowl game|CFP|Junior College|JUCO|high school|CFL|XFL|UFL|USFL|Arena|Canadian Football|Grey Cup)\b/;

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function romanToInt(r) {
  let total = 0;
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN[r[i]];
    const n = ROMAN[r[i + 1]];
    if (v === undefined) return NaN;
    total += n !== undefined && n > v ? -v : v;
  }
  return total;
}

/** Years mentioned in a highlight bullet, expanding `2018–2023` ranges. Super Bowl numerals too. */
function bulletYears(line) {
  const years = new Set();
  const tail = line.slice(line.indexOf('(') >= 0 ? line.indexOf('(') : 0);
  const source = tail || line;
  const rangeRe = /\b(19[5-9]\d|20[0-4]\d)\s*(?:-|–|—|−|to)\s*(19[5-9]\d|20[0-4]\d)\b/g;
  let m;
  while ((m = rangeRe.exec(source))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b >= a && b - a < 30) for (let y = a; y <= b; y++) years.add(y);
  }
  const yearRe = /\b(19[5-9]\d|20[0-4]\d)\b/g;
  while ((m = yearRe.exec(source))) years.add(Number(m[1]));
  if (years.size === 0) {
    // Super Bowl MVPs are listed by numeral: "(LIV, LVII, LVIII)".
    const romans = source.match(/\b([IVXLCDM]{1,7})\b/g) ?? [];
    for (const r of romans) {
      const n = romanToInt(r);
      // Super Bowl I was the 1966 season; guard against stray "I"/"V" noise.
      if (Number.isFinite(n) && n >= 30 && n <= 80) years.add(1965 + n);
    }
  }
  return [...years].sort((a, b) => a - b);
}

function multiplier(line) {
  const m = /^\s*(\d{1,2})\s*(?:×|x|X)\s/.exec(line);
  return m ? Number(m[1]) : 0;
}

const AWARD_MATCHERS = [
  { award: 'NFL MVP', test: (t) => /\bNFL Most Valuable Player\b/i.test(t) || /\bNFL MVP\b/i.test(t) },
  { award: 'Super Bowl MVP', test: (t) => /\bSuper Bowl (?:Most Valuable Player|MVP)\b/i.test(t) },
  {
    award: 'Offensive Player of the Year',
    test: (t) => /\bOffensive Player of the Year\b/i.test(t) && !COLLEGE_AND_CONFERENCE.test(t),
  },
  {
    award: 'Defensive Player of the Year',
    test: (t) => /\bDefensive Player of the Year\b/i.test(t) && !COLLEGE_AND_CONFERENCE.test(t),
  },
  { award: 'Offensive Rookie of the Year', test: (t) => /\bOffensive Rookie of the Year\b/i.test(t) },
  { award: 'Defensive Rookie of the Year', test: (t) => /\bDefensive Rookie of the Year\b/i.test(t) },
  {
    award: 'Comeback Player of the Year',
    test: (t) => /\bComeback Player of the Year\b/i.test(t) && !COLLEGE_AND_CONFERENCE.test(t),
  },
];

/**
 * Parse an infobox `highlights` value into accolades.
 * Only counts what is literally listed — never estimates.
 */
export function parseHighlights(rawHighlights) {
  const result = { proBowls: 0, allPros: 0, majorAwards: [], heisman: false };
  if (!rawHighlights) return result;
  const text = plain(rawHighlights);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Records subsections ("; NFL records") list feats, not honours — stop counting there.
  const bullets = [];
  let inRecords = false;
  for (const line of lines) {
    if (/^;/.test(line)) {
      inRecords = /record/i.test(line);
      continue;
    }
    if (inRecords) continue;
    bullets.push(line.replace(/^[*:#\s]+/, '').trim());
  }

  const awardYears = new Map();
  for (const b of bullets) {
    if (!b) continue;
    const mult = multiplier(b);
    const years = bulletYears(b);
    const n = mult || Math.max(years.length, 1);

    // Audited across all 1,830 cached infoboxes: every Pro Bowl bullet carries either an
    // "N×" multiplier or an explicit year list, none says "alternate" or "replacement", and
    // "Pro Bowl MVP" never appears in `highlights` (the template documentation forbids it).
    // So the count below is always read, never estimated. The exclusion stays narrow on purpose:
    // a broad one would throw away a whole bullet that listed selections and an MVP together.
    if (/\bPro Bowl(?:s|er)?\b/i.test(b) && !/Pro Bowl (?:MVP|Most Valuable|Games? MVP)/i.test(b)) {
      result.proBowls = Math.max(result.proBowls, n);
      continue;
    }
    if (/\bFirst[- ]team All-Pro\b/i.test(b) || /\bAll-Pro \(first[- ]team\)/i.test(b)) {
      result.allPros = Math.max(result.allPros, n);
      continue;
    }
    if (/\bHeisman Trophy\b/i.test(b)) {
      if (!/(finalist|runner[- ]up|voting|candidate|nominee)/i.test(b)) result.heisman = true;
      continue;
    }
    for (const { award, test } of AWARD_MATCHERS) {
      if (!test(b)) continue;
      const prev = awardYears.get(award) ?? { years: new Set(), count: 0 };
      for (const y of years) prev.years.add(y);
      prev.count = Math.max(prev.count, n);
      awardYears.set(award, prev);
      break;
    }
  }
  for (const [award, v] of awardYears) {
    const years = [...v.years].sort((a, b) => a - b);
    const entry = { award };
    if (years.length) entry.years = years;
    const count = Math.max(v.count, years.length, 1);
    if (count > 1) entry.count = count;
    result.majorAwards.push(entry);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// identity verification — the page must demonstrably be THIS player
// ---------------------------------------------------------------------------------------------

const POSITION_GROUP_WORDS = [
  [/\bquarterback\b/i, 'QB'],
  [/\b(?:running back|halfback|tailback|fullback)\b/i, 'RB'],
  [/\bwide receiver\b/i, 'WR'],
  [/\btight end\b/i, 'TE'],
  [/\b(?:offensive tackle|offensive guard|offensive lineman|offensive line|center|guard|tackle)\b/i, 'OL'],
  [/\b(?:defensive end|defensive tackle|nose tackle|defensive lineman|defensive line|edge)\b/i, 'DL'],
  [/\blinebacker\b/i, 'LB'],
  [/\b(?:cornerback|safety|defensive back|nickelback)\b/i, 'DB'],
  [/\b(?:placekicker|kicker|punter|long snapper|kick returner|punt returner)\b/i, 'ST'],
];

function wikiPositionGroup(positionField) {
  const t = plain(positionField);
  if (!t) return null;
  const hits = new Set();
  for (const [re, group] of POSITION_GROUP_WORDS) if (re.test(t)) hits.add(group);
  // Defensive end reads as "tackle" too; prefer the more specific hit order above.
  if (hits.size === 0) return null;
  return [...hits];
}

const COLLEGE_ALIAS = new Map([
  ['ole miss', 'mississippi'],
  ['pitt', 'pittsburgh'],
  ['usc', 'southern california'],
  ['ucf', 'central florida'],
  ['smu', 'southern methodist'],
  ['tcu', 'texas christian'],
  ['lsu', 'louisiana state'],
  ['byu', 'brigham young'],
  ['nc state', 'north carolina state'],
  ['miami (fl)', 'miami'],
  ['miami (oh)', 'miami ohio'],
  ['texas a&m', 'texas am'],
  ['san jose state', 'san jos state'],
]);

function normText(s) {
  return plain(s)
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collegeTokens(s) {
  const base = normText(s);
  const alias = COLLEGE_ALIAS.get(base);
  return new Set([base, alias].filter(Boolean));
}

function collegeMatches(playerCollege, wikiCollege) {
  if (!playerCollege || !wikiCollege) return false;
  const wiki = normText(wikiCollege);
  for (const tok of collegeTokens(playerCollege)) {
    if (!tok) continue;
    if (wiki.includes(tok)) return true;
    // "Texas A&M" ↔ "Texas A&M Aggies football"; also try the first two words.
    const short = tok.split(' ').slice(0, 2).join(' ');
    if (short.length >= 6 && wiki.includes(short)) return true;
  }
  return false;
}

/** Edge defenders are labelled DE by ESPN and OLB/LB by Wikipedia (and vice versa) — not a mismatch. */
const COMPATIBLE_GROUPS = [new Set(['DL', 'LB'])];

function groupsCompatible(a, b) {
  if (a === b) return true;
  return COMPATIBLE_GROUPS.some((fam) => fam.has(a) && fam.has(b));
}

/**
 * Decide whether a Wikipedia page is this exact player.
 *
 * A matching draft slot is conclusive. Otherwise we need either three independent agreements,
 * or two with nothing contradicting — deliberately strict, because the cost of silently pulling
 * a different person's Pro Bowl count into the dataset is far worse than leaving a gap.
 */
export function verifyIdentity(player, fields, teamName) {
  const reasons = [];
  const agree = new Set();

  const wikiDraftYear = Number(plain(fields.draftyear ?? '').match(/\d{4}/)?.[0] ?? NaN);
  const wikiPick = Number(plain(fields.draftpick ?? '').match(/\d{1,3}/)?.[0] ?? NaN);
  const wikiRound = Number(plain(fields.draftround ?? '').match(/\d{1,2}/)?.[0] ?? NaN);

  const groups = wikiPositionGroup(fields.position ?? '');
  const groupOk = groups ? groups.some((g) => groupsCompatible(g, player.group)) : null;

  let draftExact = false;
  if (player.draft && Number.isFinite(wikiDraftYear) && Number.isFinite(wikiPick)) {
    if (wikiDraftYear === player.draft.year && wikiPick === player.draft.pick) {
      draftExact = true;
      agree.add('draft-exact');
    } else if (wikiDraftYear === player.draft.year && wikiRound === player.draft.round) {
      agree.add('draft-year-round');
    } else {
      // Usually the wrong person — but occasionally just a stale Wikipedia draft slot, so treat it
      // as a contradiction (three other agreements can still carry it) rather than a hard reject.
      reasons.push('draft-mismatch');
    }
  }
  if (collegeMatches(player.college, fields.college ?? '')) agree.add('college');
  if (groupOk === true) agree.add('position');
  else if (groupOk === false) reasons.push('position-mismatch');
  // `Infobox NFL player` spells the club `team`; `Infobox gridiron…` spells it `current_team`.
  const wikiTeam = fields.current_team ?? fields.team ?? '';
  if (teamName && normText(wikiTeam).includes(normText(teamName))) agree.add('team');
  if (player.jersey && plain(fields.number ?? '').trim() === String(player.jersey)) agree.add('jersey');

  const contradicted = reasons.length > 0;
  const ok = draftExact || agree.size >= 3 || (agree.size >= 2 && !contradicted);
  return { ok, score: agree.size, reasons: [...agree, ...reasons] };
}

// ---------------------------------------------------------------------------------------------
// fetching
// ---------------------------------------------------------------------------------------------

async function fetchPages(titles) {
  const pages = new Map();
  const want = [];
  for (const t of titles) {
    const hit = readCache(CACHE_WIKI, t);
    if (hit) pages.set(t, hit);
    else want.push(t);
  }
  for (let i = 0; i < want.length; i += 40) {
    const batch = want.slice(i, i + 40);
    const json = await apiGet({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: '1',
      titles: batch.join('|'),
    });
    const q = json.query ?? {};
    const normalized = new Map((q.normalized ?? []).map((n) => [n.to, n.from]));
    const redirects = new Map((q.redirects ?? []).map((r) => [r.to, r.from]));
    const resolveRequested = (title) => {
      let t = title;
      for (let hop = 0; hop < 4; hop++) {
        if (redirects.has(t)) {
          t = redirects.get(t);
          continue;
        }
        if (normalized.has(t)) {
          t = normalized.get(t);
          continue;
        }
        break;
      }
      return t;
    };
    for (const p of q.pages ?? []) {
      const requested = resolveRequested(p.title);
      const record = {
        title: p.title,
        missing: Boolean(p.missing),
        content: p.missing ? '' : (p.revisions?.[0]?.slots?.main?.content ?? ''),
      };
      for (const key of new Set([requested, p.title])) {
        if (batch.includes(key) || key === requested) {
          writeCache(CACHE_WIKI, key, record);
          pages.set(key, record);
        }
      }
    }
    for (const t of batch) {
      if (!pages.has(t)) {
        const record = { title: t, missing: true, content: '' };
        writeCache(CACHE_WIKI, t, record);
        pages.set(t, record);
      }
    }
    await sleep(120);
  }
  return pages;
}

const SUFFIX_RE = /\s+(?:Jr\.?|Sr\.?|I{2,3}|IV|V)$/i;

/**
 * Rosters and Wikipedia disagree about first names: ESPN lists "Joshua Palmer", the article is
 * "Josh Palmer". Every candidate still has to pass identity verification, so a wrong guess here
 * cannot contaminate the output — it just wastes a lookup.
 */
const FIRST_NAME_FORMS = [
  ['Joshua', 'Josh'], ['Michael', 'Mike'], ['Christopher', 'Chris'], ['Matthew', 'Matt'],
  ['Zachary', 'Zach'], ['Nicholas', 'Nick'], ['Jonathan', 'Jon'], ['Benjamin', 'Ben'],
  ['Daniel', 'Dan'], ['Robert', 'Rob'], ['William', 'Will'], ['Anthony', 'Tony'],
  ['Cameron', 'Cam'], ['Alexander', 'Alex'], ['Samuel', 'Sam'], ['Nathaniel', 'Nate'],
  ['Andrew', 'Drew'], ['Timothy', 'Tim'], ['Jeffrey', 'Jeff'], ['Gregory', 'Greg'],
  ['Patrick', 'Pat'], ['Kenneth', 'Ken'], ['Ronald', 'Ron'], ['Terrence', 'Terry'],
  ['Jacob', 'Jake'], ['Edward', 'Ed'], ['Charles', 'Charlie'], ['Thomas', 'Tom'],
];

function firstNameAlternates(name) {
  const out = [];
  const [first, ...rest] = name.split(' ');
  if (!rest.length) return out;
  for (const [long, short] of FIRST_NAME_FORMS) {
    if (first === long) out.push([short, ...rest].join(' '));
    if (first === short) out.push([long, ...rest].join(' '));
  }
  return out;
}

/** players.json carries roster suffixes ("Tyrique Stevenson Sr.") that Wikipedia titles usually omit. */
function titleVariants(player) {
  const out = [player.name];
  const bare = player.name.replace(SUFFIX_RE, '').trim();
  if (bare !== player.name) out.push(bare);
  // Apostrophes are sometimes dropped in article titles ("Tre' Harris" → "Tre Harris").
  for (const base of [...out]) {
    const noApostrophe = base.replace(/['’]/g, '');
    if (noApostrophe !== base) out.push(noApostrophe);
  }
  for (const base of [...out]) out.push(...firstNameAlternates(base));
  for (const base of [...out]) {
    out.push(`${base} (American football)`);
    // "Robert Hunt (American football, born 1996)" — age is on the roster, so the year is derivable.
    if (player.age) {
      const born = new Date().getUTCFullYear() - player.age;
      for (const y of [born, born - 1]) out.push(`${base} (American football, born ${y})`);
    }
  }
  return [...new Set(out)];
}

async function searchCandidates(player) {
  const key = `v2-${player.name}-${player.pos}-${player.id}`;
  const hit = readCache(CACHE_SEARCH, key);
  if (hit) return hit;
  const bare = player.name.replace(SUFFIX_RE, '').trim();
  const titles = [];
  // `intitle:` keeps the person's own article on top; a bare full-text search drowns in
  // college-team and season pages that merely mention the name.
  const queries = [`intitle:"${bare}" (football OR NFL)`, `${bare} American football ${player.pos} ${player.college ?? ''}`];
  for (const srsearch of queries) {
    const json = await apiGet({ action: 'query', list: 'search', srsearch, srlimit: '8', srnamespace: '0' });
    for (const s of json.query?.search ?? []) if (!titles.includes(s.title)) titles.push(s.title);
    await sleep(120);
    if (titles.length) break;
  }
  writeCache(CACHE_SEARCH, key, titles);
  return titles;
}

// ---------------------------------------------------------------------------------------------
// nationalProfile — editorial 0..3 general-public recognition
// ---------------------------------------------------------------------------------------------

/**
 * THE 0–3 SCALE
 *   0 = known to followers of the sport only. The default for everybody, including many excellent
 *       players — this is the honest answer for most of a 2,500-man league.
 *   1 = a name essentially every NFL viewer knows. Anchored, not guessed: every current starting
 *       quarterback, plus anyone in the NFLPA's top-50 licensed-merchandise sales list.
 *   2 = crosses over past the fanbase — national ad campaigns, top-10 merchandise sales,
 *       magazine covers, a story non-fans followed.
 *   3 = genuinely famous to people who do not watch football. The handful.
 *
 * `RULE_ANCHORS` below is applied programmatically from the two cached source lists, so level 1 is
 * evidence-backed rather than a vibe. The curated table can only RAISE a player above his anchor.
 */

/** NFLPA top-50 licensed-merchandise sales, March 1 2025 – February 28 2026 (fan purchases). */
const NFLPA_TOP_50 = [
  'Josh Allen', 'Drake Maye', 'Saquon Barkley', 'Jaxon Smith-Njigba', 'Jayden Daniels',
  'Patrick Mahomes', 'Jalen Hurts', 'Caleb Williams', 'Jordan Love', 'Micah Parsons',
  'Bo Nix', 'Christian McCaffrey', 'Justin Jefferson', 'Aidan Hutchinson', 'T.J. Watt',
  'Jahmyr Gibbs', 'Amon-Ra St. Brown', 'Brock Purdy', 'Lamar Jackson', 'C.J. Stroud',
  'CeeDee Lamb', 'Cooper DeJean', 'George Kittle', 'Puka Nacua', 'Fred Warner',
  'Joe Burrow', 'Jaxson Dart', 'Baker Mayfield', 'Travis Kelce', 'Maxx Crosby',
  'Shedeur Sanders', 'Justin Herbert', 'Patrick Surtain II', 'Ashton Jeanty', 'Cam Skattebo',
  'Jared Goff', 'Cam Ward', 'Malik Nabers', 'Tyreek Hill', 'Mike Evans',
  'Cooper Kupp', 'Travis Hunter', 'DK Metcalf', 'Aaron Rodgers', "Ja'Marr Chase",
  'Derrick Henry', 'Bijan Robinson', 'Nick Bosa', 'Sam Darnold', 'A.J. Brown',
];

/** Each team's current starting quarterback — the most recognizable job in American sport. */
const STARTING_QBS = [
  'Jacoby Brissett', 'Michael Penix Jr.', 'Lamar Jackson', 'Josh Allen', 'Bryce Young',
  'Caleb Williams', 'Joe Burrow', 'Deshaun Watson', 'Dak Prescott', 'Bo Nix',
  'Jared Goff', 'Jordan Love', 'C.J. Stroud', 'Daniel Jones', 'Trevor Lawrence',
  'Patrick Mahomes', 'Kirk Cousins', 'Justin Herbert', 'Matthew Stafford', 'Malik Willis',
  'Kyler Murray', 'Drake Maye', 'Tyler Shough', 'Jaxson Dart', 'Geno Smith',
  'Jalen Hurts', 'Aaron Rodgers', 'Brock Purdy', 'Drew Lock', 'Baker Mayfield',
  'Cam Ward', 'Jayden Daniels',
];

/**
 * Curated crossover ratings. Only 2s and 3s belong here — everything else comes from the anchors.
 * Keyed by `players.json` name, matched suffix-insensitively (the roster says "Deebo Samuel Sr.").
 */
const NATIONAL_PROFILE = [
  // ---- 3: household names outside football ----
  ['Patrick Mahomes', 3, 'Perennial top jersey seller; State Farm, Oakley, Adidas and Head & Shoulders national campaigns; three-time Super Bowl MVP.'],
  ['Travis Kelce', 3, 'Highest-profile non-QB in the sport: Taylor Swift relationship drove years of non-sports coverage, plus State Farm, Pfizer and Campbell\'s ads and a hosting turn on Saturday Night Live.'],
  ['Aaron Rodgers', 3, 'Two decades of State Farm "discount double check" advertising and constant mainstream news coverage; now in Pittsburgh.'],
  ['Lamar Jackson', 3, 'Two-time MVP with top-five jersey sales and Nike/Oakley national campaigns.'],
  ['Josh Allen', 3, 'MVP, top-five jersey sales, New Era and Microsoft national ads; a face used to sell the league itself.'],
  ['Joe Burrow', 3, 'Magazine-cover fixture and fashion-press crossover ("Joe Brrr"); Nike and Bose campaigns; consistently top-10 in jersey sales.'],
  ['Saquon Barkley', 3, 'Backwards-hurdle highlight went mainstream-viral; longtime Nike signature athlete and top-five jersey seller after the 2024 rushing title.'],

  // ---- 2: crosses over into general awareness ----
  ['Jayden Daniels', 2, 'Offensive Rookie of the Year in the Washington market; one of the league\'s most heavily marketed young faces, with top-five jersey sales as a rookie.'],
  ['Jalen Hurts', 2, 'Super Bowl-winning QB in Philadelphia; top-10 jersey sales and national Nike/Toyota campaigns.'],
  ['Dak Prescott', 2, 'Quarterback of the league\'s most-watched franchise; long-running national ad presence (Sleep Number, Campbell\'s, AT&T).'],
  ['Tyreek Hill', 2, '"Cheetah" nickname and celebration are league marketing staples; among the highest-profile receivers in the sport.'],
  ['Justin Jefferson', 2, 'The "Griddy" celebration became a cross-cultural dance; highest-paid non-QB and a Nike/Gatorade campaign face.'],
  ['Micah Parsons', 2, 'Most-marketed defender in the league — Dallas platform, huge social following, national ad work.'],
  ['Myles Garrett', 2, 'Defensive Player of the Year whose blockbuster trade to the Rams was a mainstream sports news cycle.'],
  ['Maxx Crosby', 2, 'Top-selling defensive jersey and a heavily followed personality via podcasts and NFL media.'],
  ['Travis Hunter', 2, 'Heisman-winning two-way player, second overall pick, and the most-covered college football figure of his era; Ruffles and Adidas campaigns before his first NFL snap.'],
  ['Caleb Williams', 2, 'Heisman winner and number-one overall pick in Chicago; painted-nails coverage and national endorsements made him a general-audience name pre-draft.'],
  ['Justin Herbert', 2, 'Face of the Chargers in Los Angeles with Nike and Panini campaigns; a top-10 jersey seller.'],
  ['Christian McCaffrey', 2, 'Offensive Player of the Year with Madden-cover and Netflix-documentary exposure; top-five jersey sales.'],
  ['Ja\'Marr Chase', 2, 'Triple-crown receiver whose Bengals duo with Burrow is a national broadcast fixture.'],
  ['Puka Nacua', 2, 'Record-setting rookie whose family-story coverage reached well beyond football media.'],
  ['CeeDee Lamb', 2, 'Cowboys number-one receiver; top-10 jersey sales and national ad work.'],
  ['Brock Purdy', 2, '"Last pick to Super Bowl starter" is one of the most-told sports stories of the decade.'],
  ['Aaron Donald', 2, 'Three-time Defensive Player of the Year, Super Bowl closer, and one of the few defenders with a signature shoe-level marketing profile.'],
  ['Brock Bowers', 2, 'Record-setting rookie tight end whose Georgia pedigree and rookie records drew national attention.'],
  ['Nick Bosa', 2, 'Highest-paid defender in the league at signing; national ad presence and a top defensive jersey.'],
  ['George Kittle', 2, 'Personality-driven crossover via NFL media, WWE appearances and Amazon/Prime features.'],
  ['Baker Mayfield', 2, 'Progressive Insurance campaign ran for years on national television — recognizable to people who do not watch football.'],
  ['Deebo Samuel', 2, 'Positionless "wide back" archetype and a heavy social presence.'],
  ['Cooper Kupp', 2, 'Super Bowl LVI MVP with the triple crown; a national campaign face during that run.'],
  ['Davante Adams', 2, 'Long-running top-five receiver across three major markets.'],
  ['Mike Evans', 2, 'A decade of 1,000-yard seasons and a Super Bowl with Brady; his move to San Francisco was a national story.'],
  ['Trevor Lawrence', 2, 'Generational number-one pick with Adidas and Gatorade deals dating to college.'],
  ['Bijan Robinson', 2, 'Top-10 pick turned fantasy-era household name with national Nike work.'],
  ['Derrick Henry', 2, '"King Henry" is one of the sport\'s most recognizable physical archetypes; multiple rushing titles.'],
  ['T.J. Watt', 2, 'Defensive Player of the Year and a Watt-family name the general public already knows.'],
  ['Kyler Murray', 2, 'Heisman winner and two-sport number-one pick; long-running Nike campaign.'],
  ['C.J. Stroud', 2, 'Offensive Rookie of the Year who became the face of Houston football.'],
  ['Matthew Stafford', 2, 'Super Bowl-winning veteran QB, 2025 MVP season; a household sports name for fifteen years.'],
  ['Tua Tagovailoa', 2, 'National-title-winning college career and years of mainstream health-and-safety coverage.'],
  ['Drake Maye', 2, 'Third overall pick and the face of a rebuilt Patriots franchise in a major market.'],
  ['Marvin Harrison Jr.', 2, 'Son of a Hall of Famer, fourth overall pick, and a pre-draft endorsement favorite.'],
  ['Shedeur Sanders', 2, 'Deion Sanders\'s son; his draft slide was the most-covered storyline of the 2025 draft and he still sells the 31st-most merchandise in the league as a fifth-round pick.'],
];

/** Roster names carry suffixes Wikipedia and merchandise lists drop. Compare without them. */
function profileKey(name) {
  return name
    .replace(SUFFIX_RE, '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every key one name could be listed under. The roster says "Pat Surtain II" while the NFLPA
 * sales list says "Patrick Surtain II" — without this the league's 33rd best-selling player
 * silently gets no recognition signal at all.
 */
function profileKeys(name) {
  const base = name.replace(SUFFIX_RE, '').trim();
  return [...new Set([base, ...firstNameAlternates(base)].map(profileKey))];
}

/** First value found in `map` under any spelling of `name`. */
function lookupByName(map, name) {
  for (const k of profileKeys(name)) {
    const hit = map.get(k);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * Resolve nationalProfile for one player: the higher of its anchored floor and any curated rating.
 * Returns the level plus the provenance that produced it.
 */
function resolveNationalProfile(name, curated, nflpaRank, isStartingQb) {
  let level = 0;
  const from = [];
  let note = '';

  if (isStartingQb) {
    level = Math.max(level, 1);
    from.push('starting-qb');
  }
  if (nflpaRank) {
    from.push(`nflpa-merch-#${nflpaRank}`);
    if (nflpaRank <= 10) {
      if (level < 2) {
        level = 2;
        note = `Top-10 in NFLPA licensed-merchandise sales for 2025-26 (#${nflpaRank}) — a direct measure of what fans buy.`;
      }
    } else {
      level = Math.max(level, 1);
    }
  }
  if (curated && curated.level > level) {
    level = curated.level;
    note = curated.note;
    from.push('editorial');
  } else if (curated && curated.level === level && curated.note) {
    note = curated.note;
    from.push('editorial');
  }
  return { level, note: level >= 2 ? note : '', from };
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

function buildTargets() {
  const players = readJson(join(DATA, 'players.json'));
  const teams = readJson(join(DATA, 'teams.json'));
  const clips = readJson(join(DATA, 'clips.json'));
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamName = new Map(teams.map((t) => [t.id, t.displayName]));

  const reasons = new Map();
  const add = (id, why) => {
    if (!byId.has(id)) return;
    const set = reasons.get(id) ?? new Set();
    set.add(why);
    reasons.set(id, set);
  };
  for (const p of players) if (p.fame >= 45) add(p.id, 'fame>=45');
  for (const c of clips) add(c.id, 'clip');
  const lastSixDrafts = 6;
  const meta = readJson(join(DATA, 'meta.json'));
  const minDraftYear = meta.season - lastSixDrafts + 1;
  for (const p of players) {
    if (p.draft && p.draft.year >= minDraftYear && p.draft.round <= 2) add(p.id, `draft-r${p.draft.round}`);
  }
  // A player fans buy 50,000 jerseys of matters however late he was drafted: Shedeur Sanders is
  // 31st in league merchandise sales and a fifth-round pick, so no other clause would reach him.
  const rosterByName = new Map();
  for (const p of players) for (const k of profileKeys(p.name)) if (!rosterByName.has(k)) rosterByName.set(k, p);
  for (const name of NFLPA_TOP_50) {
    const hit = lookupByName(rosterByName, name);
    if (hit) add(hit.id, 'nflpa-top50');
  }
  const targets = [...reasons.keys()].map((id) => ({ ...byId.get(id), why: [...reasons.get(id)] }));
  targets.sort((a, b) => b.fame - a.fame || a.name.localeCompare(b.name));
  return {
    targets: LIMIT > 0 ? targets.slice(0, LIMIT) : targets,
    teamName,
    minDraftYear,
    season: meta.season,
    totalPlayers: players.length,
  };
}

async function harvest() {
  ensureDirs();
  const { targets, teamName, minDraftYear, season, totalPlayers } = buildTargets();
  console.log(
    `targets: ${targets.length} (fame>=45 ∪ clips ∪ round 1-2 picks since ${minDraftYear} ∪ NFLPA top 50) of ${totalPlayers} players`,
  );

  const accepted = new Map();
  const rejects = [];

  const tryPage = (player, record) => {
    if (!record || record.missing || !record.content) return null;
    const box = extractInfobox(record.content);
    if (!box) return null;
    const fields = templateFields(box);
    const verdict = verifyIdentity(player, fields, teamName.get(player.teamId));
    return { record, fields, verdict };
  };

  /** Try a set of candidate titles for one player; keep the best verified match. */
  const resolveFrom = (player, titles, pages) => {
    let best = null;
    for (const title of titles) {
      const attempt = tryPage(player, pages.get(title));
      if (!attempt) continue;
      const better =
        !best ||
        (attempt.verdict.ok && !best.verdict.ok) ||
        (attempt.verdict.ok === best.verdict.ok && attempt.verdict.score > best.verdict.score);
      if (better) best = attempt;
    }
    if (best?.verdict.ok) {
      accepted.set(player.id, { player, ...best });
      return true;
    }
    if (best) rejects.push({ id: player.id, name: player.name, title: best.record.title, ...best.verdict });
    return false;
  };

  // Pass 1 — the roster name, and the same name without its roster suffix.
  const pass1Titles = new Map(
    targets.map((t) => [t.id, [...new Set([t.name, t.name.replace(SUFFIX_RE, '').trim()])]]),
  );
  const pass1Pages = await fetchPages([...new Set([...pass1Titles.values()].flat())]);
  console.log(`pass 1: ${pass1Pages.size} pages for ${targets.length} players`);
  const afterPass1 = targets.filter((t) => !resolveFrom(t, pass1Titles.get(t.id), pass1Pages));
  console.log(`pass 1 verified: ${accepted.size}; remaining: ${afterPass1.length}`);

  // Pass 2 — the conventional Wikipedia disambiguators.
  const pass2Titles = new Map(afterPass1.map((t) => [t.id, titleVariants(t)]));
  const pass2Pages = await fetchPages([...new Set([...pass2Titles.values()].flat())]);
  const afterPass2 = afterPass1.filter((t) => !resolveFrom(t, pass2Titles.get(t.id), pass2Pages));
  console.log(`pass 2 verified: ${accepted.size}; remaining: ${afterPass2.length}`);

  // Pass 3 — titled search, then verify every candidate it offers.
  let searched = 0;
  for (const t of afterPass2) {
    const candidates = await searchCandidates(t);
    if (candidates.length) resolveFrom(t, candidates, await fetchPages(candidates));
    searched++;
    if (searched % 20 === 0) console.log(`  pass 3: ${searched}/${afterPass2.length}, accepted ${accepted.size}`);
  }
  console.log(`pass 3 done: ${accepted.size} verified of ${targets.length}`);

  // Assemble.
  const profileByName = new Map(NATIONAL_PROFILE.map(([name, level, note]) => [profileKey(name), { level, note }]));
  const nflpaRankByName = new Map(NFLPA_TOP_50.map((n, i) => [profileKey(n), i + 1]));
  const startingQbs = new Set(STARTING_QBS.map(profileKey));
  const profileUsed = new Set();

  const entries = {};
  const draftDisagreements = [];
  for (const [id, hit] of [...accepted.entries()].sort(
    (a, b) => b[1].player.fame - a[1].player.fame || a[1].player.name.localeCompare(b[1].player.name),
  )) {
    const { player, fields, record, verdict } = hit;
    const signals = parseHighlights(fields.highlights);

    const year = Number(plain(fields.draftyear ?? '').match(/\d{4}/)?.[0] ?? NaN);
    const round = Number(plain(fields.draftround ?? '').match(/\d{1,2}/)?.[0] ?? NaN);
    const pick = Number(plain(fields.draftpick ?? '').match(/\d{1,3}/)?.[0] ?? NaN);
    const draft =
      Number.isFinite(year) && Number.isFinite(round) && Number.isFinite(pick) ? { year, round, pick } : undefined;
    if (draft && player.draft && (draft.year !== player.draft.year || draft.pick !== player.draft.pick)) {
      draftDisagreements.push({ id, name: player.name, wiki: draft, espn: player.draft });
    }

    const curated = lookupByName(profileByName, player.name);
    // A quarterback is only the *starting* quarterback if he is the one this list names.
    const isStartingQb =
      player.group === 'QB' && profileKeys(player.name).some((k) => startingQbs.has(k));
    const nflpaRank = lookupByName(nflpaRankByName, player.name);
    const profile = resolveNationalProfile(player.name, curated, nflpaRank, isStartingQb);
    if (curated) profileUsed.add(profileKey(player.name));

    const entry = {
      name: player.name,
      proBowls: signals.proBowls,
      allPros: signals.allPros,
      nationalProfile: profile.level,
    };
    if (signals.majorAwards.length) entry.majorAwards = signals.majorAwards;
    if (signals.heisman) entry.heisman = true;
    if (draft) entry.draft = draft;
    if (draft && player.draft && (draft.year !== player.draft.year || draft.pick !== player.draft.pick)) {
      // players.json is authoritative for the roster; surface the conflict rather than hiding it.
      entry.draftConflict = { roster: player.draft };
    }
    if (profile.note) entry.notes = profile.note;
    if (profile.from.length) entry.profileFrom = profile.from;
    entry.source = { wikipedia: record.title, match: verdict.reasons.join('+') };
    entries[id] = entry;
  }

  const unmatched = targets
    .filter((t) => !accepted.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, pos: t.pos, team: teamName.get(t.teamId), fame: t.fame, why: t.why }));

  const missingProfiles = NATIONAL_PROFILE.map(([n]) => n).filter(
    (n) => !profileKeys(n).some((k) => profileUsed.has(k)),
  );

  const out = {
    _meta: {
      harvestedAt: new Date().toISOString(),
      generator: 'scripts/harvest-fame.mjs',
      season,
      purpose:
        'Fame signals ESPN does not expose (Pro Bowls, first-team All-Pro, major awards, draft slot, Heisman, ' +
        'general-public profile). Feeds NflPlayer.fame so easy mode contains recognizable faces, not statistical leaders.',
      absentMeans:
        'UNKNOWN, never zero. A player with no entry could not be positively identified on Wikipedia; the scorer ' +
        'must fall back to its other inputs. A present entry with proBowls: 0 is a verified zero.',
      targetRule: `union of fame>=45 in players.json, every id in clips.json, every round 1-2 pick since ${minDraftYear}, and every player on the NFLPA top-50 sales list`,
      targets: targets.length,
      covered: Object.keys(entries).length,
      unmatched: unmatched.length,
      fields: {
        proBowls: 'Pro Bowl selections, from the Wikipedia infobox highlights list',
        allPros: 'first-team All-Pro selections only (second-team ignored)',
        majorAwards: 'MVP, Offensive/Defensive Player of the Year, Offensive/Defensive Rookie of the Year, Super Bowl MVP, Comeback Player of the Year, with years',
        draft: 'overall pick and year as stated on Wikipedia (cross-checked against players.json)',
        heisman: 'won the Heisman Trophy',
        nationalProfile: '0-3 editorial rating of general-public recognition; 3 is the genuinely famous handful',
        notes: 'justification, present only when nationalProfile >= 2',
        profileFrom: 'which anchors produced nationalProfile (starting-qb, nflpa-merch-#N, editorial)',
        draftConflict: 'present only where Wikipedia and players.json disagree on the draft slot; players.json is authoritative for the roster',
        source: 'the Wikipedia article used and which identity checks agreed',
      },
      sources: [
        {
          what: 'proBowls, allPros, majorAwards, heisman, draft',
          how: 'en.wikipedia.org MediaWiki API (action=query&prop=revisions&rvslots=main), "Infobox gridiron football biography" highlights list, parsed verbatim',
          url: 'https://en.wikipedia.org/w/api.php',
        },
        {
          what: 'nationalProfile floor of 1 for every current starting quarterback',
          how: 'Wikipedia, List of current NFL starting quarterbacks (32 teams)',
          url: 'https://en.wikipedia.org/wiki/List_of_current_NFL_starting_quarterbacks',
        },
        {
          what: 'nationalProfile floor of 1 (top 50) and 2 (top 10) from what fans actually buy',
          how: 'NFLPA Top 50 NFL Player Sales List, March 1 2025 - February 28 2026, compiled from 85+ licensees',
          url: 'https://nflpa.com/partners/posts/top-50-nfl-player-sales-list-march-1-february-28-2026',
        },
        {
          what: 'nationalProfile 2 and 3 above the anchored floor',
          how: 'editorial, argued in each entry\'s notes from national ad campaigns, mainstream (non-sports) coverage and social-following rankings',
          url: 'https://www.flinque.com/blog/most-followed-nfl-players-on-instagram/',
        },
      ],
      nationalProfileScale: {
        0: 'known to followers of the sport only — the honest default',
        1: 'a name essentially every NFL viewer knows (anchored: starting QB, or NFLPA top-50 merchandise sales)',
        2: 'crosses over past the fanbase — national ad campaigns, top-10 merchandise sales, magazine covers',
        3: 'famous to people who do not watch football',
      },
      notCarried: [
        'second-team All-Pro (too weak a fame signal to be worth the false precision)',
        'Super Bowl rings (a team outcome; the roster already implies them)',
        'Pro Bowl alternates/replacements are counted exactly as Wikipedia lists them, never inferred',
      ],
    },
    players: entries,
  };
  // A limited run is a smoke test — never let it overwrite the shipped dataset.
  const outPath = LIMIT > 0 ? join(SCRATCH, 'fame-signals.partial.json') : OUT;
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  writeFileSync(join(SCRATCH, 'unmatched.json'), JSON.stringify(unmatched, null, 2), 'utf8');
  writeFileSync(join(SCRATCH, 'rejects.json'), JSON.stringify(rejects, null, 2), 'utf8');
  writeFileSync(join(SCRATCH, 'draft-disagreements.json'), JSON.stringify(draftDisagreements, null, 2), 'utf8');

  console.log(`\nwrote ${outPath}`);
  console.log(`covered ${Object.keys(entries).length} / ${targets.length}; unmatched ${unmatched.length}`);
  console.log(`draft disagreements vs players.json: ${draftDisagreements.length} (see scratch)`);
  if (missingProfiles.length) {
    console.log(`note: curated nationalProfile rows with nobody on the current roster: ${missingProfiles.join(', ')}`);
  }
  return out;
}

const SPOT_CHECK = [
  'Patrick Mahomes',
  'Joe Burrow',
  'Jayden Daniels',
  'Travis Hunter',
  'Brock Bowers',
  'Caleb Williams',
  'Justin Herbert',
  'Myles Garrett',
  'Micah Parsons',
  'Maxx Crosby',
  'Travis Kelce',
  'Kevin Byard',
  'Dallas Goedert',
  'Danielle Hunter',
];

function spotCheck(doc) {
  const rows = [];
  for (const name of SPOT_CHECK) {
    const found = Object.entries(doc.players).find(([, v]) => v.name === name);
    if (!found) {
      rows.push({ name, entry: 'NO ENTRY' });
      continue;
    }
    const [id, v] = found;
    rows.push({
      id,
      name,
      pb: v.proBowls,
      ap: v.allPros,
      awards: (v.majorAwards ?? []).map((a) => `${a.award}${a.years ? ` ${a.years.join('/')}` : ''}`).join('; ') || '-',
      heisman: v.heisman ? 'yes' : '-',
      draft: v.draft ? `${v.draft.year} #${v.draft.pick}` : '-',
      np: v.nationalProfile,
    });
  }
  console.log('\nSPOT CHECK');
  console.table(rows);
}

// Only harvest when run as a script — the parsers above are exported so they can be
// exercised in isolation without firing a thousand network requests.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  if (SPOT_ONLY) spotCheck(readJson(OUT));
  else spotCheck(await harvest());
}
