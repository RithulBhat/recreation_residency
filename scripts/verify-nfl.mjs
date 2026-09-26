#!/usr/bin/env node
/**
 * verify-nfl.mjs — police the committed Highlight Scout dataset.
 *
 *   node scripts/verify-nfl.mjs              # offline structural checks
 *   NFL_VERIFY_IMAGES=1 node scripts/…       # also spot-check 20 real headshot PNGs
 *
 * Exits non-zero on any failure. Warnings are printed but do not fail the run.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'nfl');
const CHECK_IMAGES = process.env.NFL_VERIFY_IMAGES === '1';
const IMAGE_SAMPLE = 20;

// ---------------------------------------------------------------------------------------------

const failures = [];
const warnings = [];
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ check: name, result: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}
const warn = (msg) => warnings.push(msg);
/** A check that cannot be evaluated (a named player left the league). Visible, never silent. */
function skip(name, why) {
  checks.push({ check: name, result: 'SKIP', detail: why });
  warn(`SKIPPED "${name}" — ${why}`);
}

function table(rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (cells) => '  ' + cells.map((s, i) => String(s).padEnd(w[i])).join('  ');
  console.log(line(cols));
  console.log('  ' + w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of rows) console.log(line(cols.map((c) => r[c] ?? '')));
  console.log('');
}

const json = async (file) => JSON.parse(await readFile(join(DATA, file), 'utf8'));

/** Ground truth since the 2002 realignment. */
const DIVISIONS = {
  'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'],
  'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
  'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
  'AFC West': ['DEN', 'KC', 'LAC', 'LV'],
  'NFC East': ['DAL', 'NYG', 'PHI', 'WSH'],
  'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
  'NFC South': ['ATL', 'CAR', 'NO', 'TB'],
  'NFC West': ['ARI', 'LAR', 'SEA', 'SF'],
};
const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];
const SKILL_GROUPS = ['QB', 'RB', 'WR', 'TE'];
const DEFENSIVE_GROUPS = ['DL', 'LB', 'DB'];
const FIRST_SUPER_BOWL_SEASON = 1966;

// --- fame contract (CLAUDE.md "Difficulty", src/scout/subjects.ts TIER_THRESHOLDS) -------------
const FAME_BAND_RANGE = { star: [80, 100], starter: [55, 79], rotation: [30, 54], deepCut: [1, 29] };
const FAME_BANDS = Object.fromEntries(
  Object.entries(FAME_BAND_RANGE).map(([t, [lo, hi]]) => [t, `${lo}-${hi}`]),
);
/** EASY difficulty has to offer a famous face at every position a fan actually watches. */
const STAR_REQUIRED_GROUPS = ['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB'];
/** Nobody a general fan cannot name may sit in EASY, by raw ESPN position or by group. */
const UNGUESSABLE_GROUPS = ['OL', 'ST'];
const UNGUESSABLE_POSITIONS = new Set([
  'OL', 'OT', 'T', 'LT', 'RT', 'OG', 'G', 'LG', 'RG', 'C', // offensive line
  'PK', 'K', 'P', 'LS', 'H', // kicker, punter, long snapper, holder
]);
/** The longest game Highlight Scout offers; every tier must be able to fill one. */
const ROUNDS_PER_GAME = 20;

// ESPN falls back to its college-football headshot for a handful of fringe players. Same asset
// format (600x436 RGBA PNG, CORS-enabled), different path — both are valid.
const HEADSHOT_RE = /^https:\/\/a\.espncdn\.com\/i\/headshots\/(?:nfl|college-football)\/players\/full\/\d+\.png$/;
const LOGO_RE = /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500(?:-dark)?\/[a-z]+\.png$/;
const HEX_RE = /^#[0-9a-f]{6}$/;
const CLOCK_RE = /^\d{1,2}:\d{2}$/;

/** ESPN stores generational suffixes in lastName. */
const baseSurname = (last) => String(last ?? '').replace(/\s+(?:Jr\.?|Sr\.?|I{2,3}|IV|VI{0,3}|V)$/i, '').trim();

/** Football words that are also surnames; a bare lower-case hit is not a leak. */
const NOT_A_SURNAME = new Set([
  'long', 'short', 'deep', 'left', 'right', 'middle', 'end', 'guard', 'center', 'tackle',
  'pass', 'rush', 'punt', 'kick', 'field', 'goal', 'good', 'play', 'penalty', 'holder',
  'snap', 'yards', 'line', 'down', 'safety', 'touchdown', 'shotgun', 'huddle', 'quarter',
]);

function dupes(values) {
  const seen = new Set();
  const dup = new Set();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const [meta, teams, players, highlights, statlines] = await Promise.all([
    json('meta.json'),
    json('teams.json'),
    json('players.json'),
    json('highlights.json'),
    json('statlines.json'),
  ]);

  const lastCompletedSeason = meta.season - 1;
  console.log(
    `verify-nfl — synced ${String(meta.syncedAt).slice(0, 10)}, ESPN season ${meta.season}\n`,
  );

  // --- teams ----------------------------------------------------------------------------------
  check('teams: exactly 32', teams.length === 32, `got ${teams.length}`);
  check('teams: no duplicate ids', dupes(teams.map((t) => t.id)).length === 0);
  check('teams: no duplicate abbrs', dupes(teams.map((t) => t.abbr)).length === 0);

  const byDivision = new Map();
  for (const t of teams) {
    const key = `${t.conference} ${t.division}`;
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key).push(t.abbr);
  }
  const divisionRows = [];
  let divisionsOk = byDivision.size === 8;
  for (const [key, expected] of Object.entries(DIVISIONS)) {
    const got = (byDivision.get(key) ?? []).slice().sort();
    const ok = got.length === 4 && got.join(',') === expected.slice().sort().join(',');
    if (!ok) divisionsOk = false;
    divisionRows.push({ division: key, teams: got.join(' ') || '(none)', ok: ok ? 'ok' : 'WRONG' });
  }
  table(divisionRows);
  check('teams: 8 divisions of 4, matching the real alignment', divisionsOk);

  const teamProblems = [];
  const teamAbbrs = new Set(teams.map((t) => t.abbr));
  for (const t of teams) {
    const push = (why) => teamProblems.push(`${t.abbr}: ${why}`);
    if (!t.venue) push('no venue');
    if (!HEX_RE.test(t.color) || !HEX_RE.test(t.altColor)) push(`bad colors ${t.color}/${t.altColor}`);
    if (!LOGO_RE.test(t.logo)) push(`bad logo url ${t.logo}`);
    if (!(t.founded >= 1890 && t.founded <= 2005)) push(`implausible founded ${t.founded}`);
    if (t.facts.length < 6) push(`only ${t.facts.length} facts`);
    if (t.legends.length < 4) push(`only ${t.legends.length} legends`);
    if (t.aliases.length < 3) push(`only ${t.aliases.length} aliases`);
    if (t.aliases.some((a) => a !== a.toLowerCase())) push('aliases must be lowercase');
    if (!t.rivals.length) push('no rivals');
    for (const r of t.rivals) {
      if (!teamAbbrs.has(r)) push(`unknown rival ${r}`);
      if (r === t.abbr) push('listed as its own rival');
    }
    // A clue must not name the franchise it is a clue for.
    const selfWords = [t.name, t.location, t.displayName].filter((s) => s && s.length > 3);
    for (const fact of t.facts) {
      for (const word of selfWords) {
        if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(fact)) {
          push(`fact names the team ("${word}"): ${fact.slice(0, 60)}…`);
        }
      }
    }
  }
  check('teams: metadata + curated fields complete', teamProblems.length === 0, teamProblems.slice(0, 8).join(' | '));

  // Super Bowls: every season from 1966 to the last completed one, claimed exactly once.
  const allSb = teams.flatMap((t) => t.superBowls);
  const expectedSb = lastCompletedSeason - FIRST_SUPER_BOWL_SEASON + 1;
  check(
    `superBowls: ${expectedSb} titles across the league (seasons ${FIRST_SUPER_BOWL_SEASON}-${lastCompletedSeason})`,
    allSb.length === expectedSb,
    `got ${allSb.length}`,
  );
  check('superBowls: no season claimed by two teams', dupes(allSb).length === 0, dupes(allSb).join(','));
  const sbRange = allSb.filter((y) => y < FIRST_SUPER_BOWL_SEASON || y > lastCompletedSeason);
  check('superBowls: every season in range', sbRange.length === 0, sbRange.join(','));
  const missingSb = [];
  for (let y = FIRST_SUPER_BOWL_SEASON; y <= lastCompletedSeason; y++) {
    if (!allSb.includes(y)) missingSb.push(y);
  }
  check('superBowls: no season unaccounted for', missingSb.length === 0, missingSb.join(','));
  check(
    'superBowls: each list ascending',
    teams.every((t) => t.superBowls.every((y, i) => i === 0 || y > t.superBowls[i - 1])),
  );

  // --- players --------------------------------------------------------------------------------
  const teamIds = new Set(teams.map((t) => t.id));
  const playerById = new Map(players.map((p) => [p.id, p]));
  check('players: at least 1600 on file', players.length >= 1600, `got ${players.length}`);
  check('players: no duplicate ids', dupes(players.map((p) => p.id)).length === 0);

  const playerProblems = [];
  for (const p of players) {
    const push = (why) => playerProblems.push(`${p.name || p.id}: ${why}`);
    if (!POSITION_GROUPS.includes(p.group)) push(`bad position group "${p.group}"`);
    if (!p.pos) push('no raw position');
    if (!HEADSHOT_RE.test(p.headshot)) push(`bad headshot url ${p.headshot}`);
    if (!p.headshot.includes(`/${p.id}.png`)) push('headshot url does not match the id');
    if (!teamIds.has(p.teamId)) push(`unknown teamId ${p.teamId}`);
    if (!p.name || !p.last) push('missing name');
    if (!(p.fame >= 1 && p.fame <= 100)) push(`fame out of range: ${p.fame}`);
    if (p.heightIn !== undefined && !(p.heightIn > 55 && p.heightIn < 90)) push(`height ${p.heightIn}`);
    if (p.weightLb !== undefined && !(p.weightLb > 120 && p.weightLb < 420)) push(`weight ${p.weightLb}`);
    if (p.draft && !(p.draft.round >= 1 && p.draft.round <= 8 && p.draft.pick >= 1 && p.draft.pick <= 300)) {
      push(`bad draft ${JSON.stringify(p.draft)}`);
    }
    if (p.aliases && p.aliases.some((a) => a !== a.toLowerCase())) push('aliases must be lowercase');
  }
  check('players: every record valid', playerProblems.length === 0, playerProblems.slice(0, 8).join(' | '));

  const withHeight = players.filter((p) => p.heightIn !== undefined).length;
  const withWeight = players.filter((p) => p.weightLb !== undefined).length;
  const withDraft = players.filter((p) => p.draft).length;
  const withCollege = players.filter((p) => p.college).length;
  check('players: >90% have a parsed height', withHeight / players.length > 0.9,
    `${withHeight}/${players.length}`);
  check('players: >90% have a parsed weight', withWeight / players.length > 0.9,
    `${withWeight}/${players.length}`);
  const collegeShots = players.filter((p) => !p.headshot.includes('/headshots/nfl/')).length;
  if (collegeShots) {
    warn(`${collegeShots} player(s) use ESPN's college-football headshot (no NFL asset exists yet)`);
  }
  check('players: >98% have an NFL-path headshot',
    1 - collegeShots / players.length > 0.98, `${collegeShots} fallbacks`);
  if (withDraft / players.length < 0.5) warn(`only ${withDraft}/${players.length} players have draft data`);
  if (withCollege / players.length < 0.9) warn(`only ${withCollege}/${players.length} players have a college`);

  // --- fame -----------------------------------------------------------------------------------
  //
  // Fame is a RECOGNISABILITY score — "would a general NFL fan name this face?" — and NOT a measure
  // of statistical volume. Every assertion below names a concrete failure it prevents, because two
  // versions of this field have already been rejected. A volume-ranked score put 15 quarterbacks in
  // the top 25, no defender and one tight end in the whole `star` tier (the game's EASY difficulty),
  // Jared Goff above Patrick Mahomes and Travis Kelce around 70th. Ranking inside each position
  // group and mapping onto per-group ceilings then fixed the shape and broke the meaning: the leader
  // of a thin group landed near its ceiling regardless of public profile, so Dallas Goedert (zero
  // Pro Bowls), Kevin Byard, Trey McBride, James Cook III, Danielle Hunter, Derek Stingley Jr. and
  // Keenan Allen filled the top 40 while Joe Burrow sat 43rd after turf-toe surgery, Jayden Daniels
  // 248th, Travis Hunter 736th and only 8 quarterbacks made the top 40 at all.
  //
  // If one of these goes red the score has regressed — fix `scoreFame` in scripts/sync-nfl.mjs and
  // rerun `NFL_FAME_ONLY=1 npm run nfl:sync`. Do not relax a bound; `src/data/nfl/nfl.test.ts`
  // mirrors all seven criteria and would still catch it.
  const tier = (f) => (f >= 80 ? 'star' : f >= 55 ? 'starter' : f >= 30 ? 'rotation' : 'deepCut');
  const tiers = { star: 0, starter: 0, rotation: 0, deepCut: 0 };
  for (const p of players) tiers[tier(p.fame)]++;

  const buckets = new Array(10).fill(0);
  for (const p of players) buckets[Math.min(9, Math.floor(p.fame / 10))]++;
  table(
    buckets.map((n, i) => ({
      fame: `${i * 10}-${i * 10 + 9}`,
      count: n,
      bar: '#'.repeat(Math.round((n / players.length) * 120)),
    })),
  );

  const ranked = [...players].sort((a, b) => b.fame - a.fame || a.name.localeCompare(b.name));
  /** Keyed by id: two rostered players are called Justin Jefferson, and one is a rookie linebacker. */
  const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));
  const top40 = ranked.slice(0, 40);
  const abbrOf = new Map(teams.map((t) => [t.id, t.abbr]));
  table(
    ranked.slice(0, 50).map((p, i) => ({
      '#': i + 1,
      fame: p.fame,
      player: p.name,
      pos: p.pos,
      grp: p.group,
      team: abbrOf.get(p.teamId) ?? '?',
      draft: p.draft ? `${p.draft.year} R${p.draft.round}P${p.draft.pick}` : 'UDFA',
    })),
  );

  // Position-group histogram per tier — the shape that the old score got wrong.
  table(
    ['star', 'starter', 'rotation', 'deepCut'].map((name) => {
      const rows = players.filter((p) => tier(p.fame) === name);
      const out = { tier: name, band: FAME_BANDS[name], total: rows.length };
      for (const g of POSITION_GROUPS) out[g] = rows.filter((p) => p.group === g).length;
      return out;
    }),
  );

  // --- ACCEPTANCE CRITERION 1: quarterback is the most famous position in football --------------
  // The first rebuild over-corrected a quarterback-heavy top 25 with per-position ceilings and left
  // only 8 quarterbacks in the top 40. An honest list of the 40 most recognisable faces in the NFL
  // is 12-18 of them, because quarterback is simply the most famous position in the sport.
  const topQbs = top40.filter((p) => p.group === 'QB');
  check(
    'fame: top 40 contains 12-18 quarterbacks',
    topQbs.length >= 12 && topQbs.length <= 18,
    `${topQbs.length}: ${topQbs.map((p) => p.name).join(', ')}`,
  );

  // --- ACCEPTANCE CRITERION 2: the top 40 is not an all-offense list ----------------------------
  // With 12-18 quarterback slots spoken for, four defenders and two tight ends is the floor that
  // keeps EASY mode from being a quarterback quiz. (The shipped score clears it with room: see the
  // detail column.) The previous contract asked for six and was written before the quarterback
  // floor existed; the numbers here are the ones the three judges set.
  const topDefenders = top40.filter((p) => DEFENSIVE_GROUPS.includes(p.group));
  const topTightEnds = top40.filter((p) => p.group === 'TE');
  check(
    'fame: top 40 contains >=4 defensive players (DL/LB/DB)',
    topDefenders.length >= 4,
    `${topDefenders.length}: ${topDefenders.map((p) => `${p.name} ${p.fame}`).join(', ') || 'none'}`,
  );
  check(
    'fame: top 40 contains >=2 tight ends',
    topTightEnds.length >= 2,
    `${topTightEnds.length}: ${topTightEnds.map((p) => `${p.name} ${p.fame}`).join(', ') || 'none'}`,
  );
  // …and is still mostly skill players: a top 40 stuffed with defenders would be just as wrong as
  // one with none. The upper bound is what stops the fix from over-correcting.
  const skillShare = top40.filter((p) => SKILL_GROUPS.includes(p.group)).length / top40.length;
  check(
    'fame: top 40 is 55-90% QB/RB/WR/TE — recognisable, but not offense-only',
    skillShare >= 0.55 && skillShare <= 0.9,
    `${(skillShare * 100).toFixed(0)}%`,
  );
  check(
    'fame: the single most famous player is a QB or skill player',
    SKILL_GROUPS.includes(ranked[0].group),
    `${ranked[0].name} (${ranked[0].group})`,
  );

  // --- ACCEPTANCE CRITERION 3: the household names are in the top 40 ----------------------------
  // Keyed by ESPN athlete id, not by name: two rostered players are called Justin Jefferson (the
  // Vikings receiver and a 2026 rookie linebacker) and only one of them belongs here.
  const TOP_40_NAMES = [
    ['3139477', 'Patrick Mahomes'],
    ['3918298', 'Josh Allen'],
    ['3915511', 'Joe Burrow'],
    ['3916387', 'Lamar Jackson'],
    ['15847', 'Travis Kelce'],
    ['4362628', "Ja'Marr Chase"],
    ['3117251', 'Christian McCaffrey'],
    ['4262921', 'Justin Jefferson'],
    ['3929630', 'Saquon Barkley'],
    ['3122132', 'Myles Garrett'],
    ['4361423', 'Micah Parsons'],
  ];
  /** Every player whose fame is strictly above the 40th — i.e. in the top 40 no matter the tie-break. */
  const fortiethFame = top40[top40.length - 1].fame;
  const top40Ids = new Set(top40.map((p) => p.id));
  const requiredRows = [];
  for (const [id, name] of TOP_40_NAMES) {
    const p = playerById.get(id);
    if (!p) {
      skip(`fame: ${name} is inside the top 40`, `id ${id} is not on an NFL roster`);
      continue;
    }
    if (p.name !== name) warn(`fame: id ${id} is "${p.name}" on file, expected "${name}"`);
    requiredRows.push({ player: p.name, grp: p.group, fame: p.fame, rank: rankOf.get(p.id) });
    check(
      `fame: ${p.name} is inside the top 40`,
      top40Ids.has(p.id),
      `#${rankOf.get(p.id)}, fame ${p.fame} (40th is ${fortiethFame})`,
    );
  }
  table(requiredRows);

  // --- ACCEPTANCE CRITERION 4: pedigree and narrative, not just production ----------------------
  // Every one of these ranked outside the top 100 under a production-driven score — an Offensive
  // Rookie of the Year who lost a season to injury, a Heisman-winning second overall pick, a
  // record-setting tight end, a number one overall pick, a franchise quarterback, a five-time Pro
  // Bowl edge rusher. All six are EASY-mode famous.
  const STAR_NAMES = [
    ['4426348', 'Jayden Daniels'],
    ['4685415', 'Travis Hunter'],
    ['4432665', 'Brock Bowers'],
    ['4431611', 'Caleb Williams'],
    ['4038941', 'Justin Herbert'],
    ['3916655', 'Maxx Crosby'],
  ];
  const starRows = [];
  for (const [id, name] of STAR_NAMES) {
    const p = playerById.get(id);
    if (!p) {
      skip(`fame: ${name} is in the star tier`, `id ${id} is not on an NFL roster`);
      continue;
    }
    if (p.name !== name) warn(`fame: id ${id} is "${p.name}" on file, expected "${name}"`);
    starRows.push({ player: p.name, grp: p.group, fame: p.fame, rank: rankOf.get(p.id), tier: tier(p.fame) });
    check(`fame: ${p.name} is in the star tier (fame >= 80)`, p.fame >= 80, `fame ${p.fame}, #${rankOf.get(p.id)}`);
  }
  table(starRows);

  // --- ACCEPTANCE CRITERION 5: statistical production is not fame -------------------------------
  // These seven are fantasy-relevant or film-room respected, not household names, and a
  // leaderboard-driven score put every one of them in the top 40 — one round in five became
  // unwinnable for the exact audience EASY mode is for. They may be famous enough for the star
  // tier; they may not be among the forty most recognisable faces in the league.
  const NOT_TOP_40_NAMES = [
    ['2574056', 'Kevin Byard'],
    ['3121023', 'Dallas Goedert'],
    ['4426434', 'Derek Stingley Jr.'],
    ['4379399', 'James Cook III'],
    ['2976560', 'Danielle Hunter'],
    ['4361307', 'Trey McBride'],
    ['15818', 'Keenan Allen'],
  ];
  const excludedRows = [];
  for (const [id, name] of NOT_TOP_40_NAMES) {
    const p = playerById.get(id);
    if (!p) {
      skip(`fame: ${name} is outside the top 40`, `id ${id} is not on an NFL roster`);
      continue;
    }
    if (p.name !== name) warn(`fame: id ${id} is "${p.name}" on file, expected "${name}"`);
    excludedRows.push({ player: p.name, grp: p.group, fame: p.fame, rank: rankOf.get(p.id), tier: tier(p.fame) });
    check(
      `fame: ${p.name} is outside the top 40`,
      !top40Ids.has(p.id),
      `#${rankOf.get(p.id)}, fame ${p.fame} (40th is ${fortiethFame})`,
    );
  }
  table(excludedRows);

  // --- sustained excellence beats one loud season -----------------------------------------------
  // Goff/Mayfield/Stafford/Darnold all out-ranked Mahomes under the volume score. Whoever has the
  // MVPs and the Super Bowl MVPs has to come first.
  const byName = new Map(players.map((p) => [p.name, p]));
  const mahomes = byName.get('Patrick Mahomes');
  for (const rival of ['Sam Darnold', 'Baker Mayfield', 'Jared Goff', 'Matthew Stafford']) {
    const other = byName.get(rival);
    if (!mahomes || !other) {
      skip(`fame: Patrick Mahomes ranks above ${rival}`, `${!mahomes ? 'Mahomes' : rival} is not on an NFL roster`);
      continue;
    }
    check(
      `fame: Patrick Mahomes ranks above ${rival}`,
      mahomes.fame > other.fame,
      `Mahomes ${mahomes.fame} (#${rankOf.get(mahomes.id)}) vs ${rival} ${other.fame} (#${rankOf.get(other.id)})`,
    );
  }

  // --- ACCEPTANCE CRITERION 6: the star tier is the game's EASY mode ----------------------------
  check(
    'fame: 60-140 players in the star tier (EASY difficulty)',
    tiers.star >= 60 && tiers.star <= 140,
    `got ${tiers.star}`,
  );
  const starGroups = new Set(players.filter((p) => p.fame >= 80).map((p) => p.group));
  const missingFromStar = STAR_REQUIRED_GROUPS.filter((g) => !starGroups.has(g));
  check(
    `fame: star tier covers every recognisable position (${STAR_REQUIRED_GROUPS.join('/')})`,
    missingFromStar.length === 0,
    missingFromStar.length ? `missing ${missingFromStar.join(', ')}` : [...starGroups].sort().join(','),
  );
  // A silhouette of an interior lineman or a long snapper is not "easy" at any difficulty, and the
  // per-group and per-position ceilings in scoreFame are what make this unreachable rather than
  // merely unlikely.
  const wrongInStar = players.filter((p) => p.fame >= 80 && UNGUESSABLE_POSITIONS.has(p.pos.toUpperCase()));
  const groupsInStar = players.filter((p) => p.fame >= 80 && UNGUESSABLE_GROUPS.includes(p.group));
  check(
    'fame: no offensive lineman, kicker, punter or long snapper in the star tier',
    wrongInStar.length === 0 && groupsInStar.length === 0,
    [...wrongInStar, ...groupsInStar].map((p) => `${p.name} (${p.pos}) ${p.fame}`).slice(0, 8).join(', '),
  );

  // --- ACCEPTANCE CRITERION 7: the documented bands hold and every tier is playable -------------
  const bandProblems = [];
  for (const p of players) {
    const t = tier(p.fame);
    const [lo, hi] = FAME_BAND_RANGE[t];
    if (!(p.fame >= lo && p.fame <= hi)) bandProblems.push(`${p.name} fame ${p.fame} -> ${t}`);
  }
  check('fame: every player lands in the band CLAUDE.md documents', bandProblems.length === 0,
    bandProblems.slice(0, 5).join(' | '));
  const thinTiers = Object.entries(tiers).filter(([, n]) => n < ROUNDS_PER_GAME);
  check(
    `fame: every tier can fill a ${ROUNDS_PER_GAME}-round game`,
    thinTiers.length === 0,
    thinTiers.map(([t, n]) => `${t}=${n}`).join(', '),
  );
  check('fame: starter tier populated', tiers.starter >= 150, `got ${tiers.starter}`);
  check('fame: rotation tier populated', tiers.rotation >= 150, `got ${tiers.rotation}`);
  check('fame: deep cuts are under 75% of the league',
    tiers.deepCut / players.length < 0.75, `${((tiers.deepCut / players.length) * 100).toFixed(0)}%`);
  // The best player at a watchable position must be able to anchor EASY mode; the best lineman or
  // specialist must not. This is the per-group ceiling seen from the outside.
  const bestOf = (group) => Math.max(0, ...players.filter((p) => p.group === group).map((p) => p.fame));
  const ceilingProblems = [
    ...STAR_REQUIRED_GROUPS.filter((g) => bestOf(g) < 80).map((g) => `${g} best is ${bestOf(g)}, want >=80`),
    ...UNGUESSABLE_GROUPS.filter((g) => bestOf(g) >= 80).map((g) => `${g} best is ${bestOf(g)}, want <80`),
  ];
  check('fame: every position group respects its recognisability ceiling', ceilingProblems.length === 0,
    ceilingProblems.join(' | ') || POSITION_GROUPS.map((g) => `${g}:${bestOf(g)}`).join(' '));
  // --- highlights -----------------------------------------------------------------------------
  check('highlights: 1200-2500 plays', highlights.length >= 1200 && highlights.length <= 2500,
    `got ${highlights.length}`);
  check('highlights: no duplicate ids', dupes(highlights.map((h) => h.id)).length === 0);

  const hlProblems = [];
  const leaks = [];
  const kindCounts = new Map();
  const seasonCounts = new Map();
  const teamCounts = new Map();
  for (const h of highlights) {
    const push = (why) => hlProblems.push(`${h.id}: ${why}`);
    const target = playerById.get(h.playerId);
    if (!target) {
      push(`playerId ${h.playerId} is not in players.json`);
      continue;
    }
    for (const id of h.otherPlayerIds) {
      if (!playerById.has(id)) push(`otherPlayerId ${id} is not in players.json`);
      if (id === h.playerId) push('playerId repeated in otherPlayerIds');
    }
    if (!teamIds.has(h.teamId) || !teamIds.has(h.oppTeamId)) push('unknown team id');
    if (h.teamId === h.oppTeamId) push('teamId equals oppTeamId');
    if (!h.text || !h.redacted) push('missing text');
    if (!h.redacted.includes('[?]')) push('redacted text has no [?] placeholder');
    if (!(h.quarter >= 1 && h.quarter <= 6)) push(`quarter ${h.quarter}`);
    if (!CLOCK_RE.test(h.clock)) push(`clock "${h.clock}"`);
    if (!(h.week >= 1 && h.week <= 18)) push(`week ${h.week}`);
    if (!(h.season >= meta.season - 3 && h.season <= meta.season)) push(`season ${h.season}`);
    if (!h.kind) push('no kind');

    // Nobody named in the play may survive redaction. Case-sensitive: the gamebook's own
    // "long"/"short"/"end" are lower case, real surnames are capitalised.
    for (const id of [h.playerId, ...h.otherPlayerIds]) {
      const p = playerById.get(id);
      if (!p) continue;
      const word = baseSurname(p.last);
      if (word.length < 3 || NOT_A_SURNAME.has(word.toLowerCase())) continue;
      const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`).test(h.redacted)) {
        leaks.push(`${h.id}: "${word}" survives — ${h.redacted.slice(0, 90)}`);
      }
    }
    kindCounts.set(h.kind, (kindCounts.get(h.kind) ?? 0) + 1);
    seasonCounts.set(h.season, (seasonCounts.get(h.season) ?? 0) + 1);
    teamCounts.set(h.teamId, (teamCounts.get(h.teamId) ?? 0) + 1);
  }
  check('highlights: every record valid', hlProblems.length === 0, hlProblems.slice(0, 8).join(' | '));
  check('highlights: no player surname survives redaction', leaks.length === 0, leaks.slice(0, 5).join(' | '));

  table(
    [...kindCounts.entries()].sort((a, b) => b[1] - a[1]).map(([kind, count]) => ({ kind, count })),
  );
  table([...seasonCounts.entries()].sort().map(([season, count]) => ({ season, count })));

  check('highlights: all 32 teams represented', teamCounts.size === 32, `${teamCounts.size} teams`);
  check('highlights: at least 6 kinds of play', kindCounts.size >= 6, `${kindCounts.size} kinds`);
  const biggestKind = Math.max(...kindCounts.values());
  check('highlights: no single kind above 40%', biggestKind / highlights.length <= 0.4,
    `${((biggestKind / highlights.length) * 100).toFixed(0)}%`);
  const distinctTargets = new Set(highlights.map((h) => h.playerId)).size;
  check('highlights: at least 400 distinct answers', distinctTargets >= 400, `got ${distinctTargets}`);
  const hlGroups = new Set(highlights.map((h) => playerById.get(h.playerId)?.group));
  check('highlights: answers span at least 6 position groups', hlGroups.size >= 6,
    [...hlGroups].join(','));

  // --- statlines ------------------------------------------------------------------------------
  const slProblems = [];
  for (const s of statlines) {
    const push = (why) => slProblems.push(`${s.playerId}: ${why}`);
    if (!playerById.has(s.playerId)) push('playerId is not in players.json');
    if (!(s.stats.length >= 3 && s.stats.length <= 6)) push(`${s.stats.length} stat pairs`);
    if (!(s.season >= meta.season - 3 && s.season <= meta.season)) push(`season ${s.season}`);
    for (const pair of s.stats) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1]) {
        push(`bad pair ${JSON.stringify(pair)}`);
      }
    }
  }
  check('statlines: every record valid', slProblems.length === 0, slProblems.slice(0, 6).join(' | '));
  check('statlines: no duplicate players', dupes(statlines.map((s) => s.playerId)).length === 0);
  if (statlines.length < 150) warn(`only ${statlines.length} statlines`);

  // --- meta -----------------------------------------------------------------------------------
  check('meta: counts match the files',
    meta.counts.teams === teams.length &&
      meta.counts.players === players.length &&
      meta.counts.highlights === highlights.length &&
      meta.counts.statlines === statlines.length);

  // --- images (opt-in, hits the network) ------------------------------------------------------
  if (CHECK_IMAGES) {
    console.log(`spot-checking ${IMAGE_SAMPLE} headshots on a.espncdn.com…\n`);
    const sample = [];
    const step = Math.max(1, Math.floor(players.length / IMAGE_SAMPLE));
    for (let i = 0; i < players.length && sample.length < IMAGE_SAMPLE; i += step) sample.push(players[i]);
    const rows = await Promise.all(
      sample.map(async (p) => {
        const row = { player: p.name, status: '-', type: '-', cors: '-', size: '-', colortype: '-' };
        try {
          const res = await fetch(p.headshot, { signal: AbortSignal.timeout(20_000) });
          row.status = res.status;
          row.type = res.headers.get('content-type') ?? '-';
          row.cors = res.headers.get('access-control-allow-origin') ?? 'MISSING';
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 26 && buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
            row.size = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
            row.colortype = buf[25];
          }
        } catch (err) {
          row.status = err instanceof Error ? err.message : 'error';
        }
        return row;
      }),
    );
    table(rows);
    const pass = rows.filter(
      (r) => r.status === 200 && r.type === 'image/png' && r.cors === '*' && r.colortype === 6,
    );
    check(`images: all ${IMAGE_SAMPLE} headshots are CORS-enabled RGBA PNGs`,
      pass.length === rows.length, `${pass.length}/${rows.length} passed`);
  } else {
    warn('image spot-check skipped — set NFL_VERIFY_IMAGES=1 to run it');
  }

  // --- report ---------------------------------------------------------------------------------
  table(checks);
  for (const w of warnings) console.log(`  warn: ${w}`);
  if (warnings.length) console.log('');

  table([
    { metric: 'teams', value: teams.length },
    { metric: 'players', value: players.length },
    { metric: 'highlights', value: highlights.length },
    { metric: 'statlines', value: statlines.length },
    { metric: 'distinct highlight answers', value: distinctTargets },
    { metric: 'checks run', value: checks.length },
    { metric: 'failures', value: failures.length },
  ]);

  if (failures.length) {
    console.error(`FAILED ${failures.length} check(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('verify-nfl: all checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
