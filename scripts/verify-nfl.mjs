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
const FIRST_SUPER_BOWL_SEASON = 1966;

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
  table(Object.entries(tiers).map(([t, count]) => ({ tier: t, count })));

  const top = [...players].sort((a, b) => b.fame - a.fame || a.name.localeCompare(b.name)).slice(0, 40);
  const abbrOf = new Map(teams.map((t) => [t.id, t.abbr]));
  table(
    top.map((p, i) => ({
      '#': i + 1,
      fame: p.fame,
      player: p.name,
      pos: p.pos,
      team: abbrOf.get(p.teamId) ?? '?',
      draft: p.draft ? `${p.draft.year} R${p.draft.round}P${p.draft.pick}` : 'UDFA',
    })),
  );

  check('fame: 20-140 players in the star tier', tiers.star >= 20 && tiers.star <= 140, `got ${tiers.star}`);
  check('fame: starter tier populated', tiers.starter >= 150, `got ${tiers.starter}`);
  check('fame: deep cuts are under 75% of the league',
    tiers.deepCut / players.length < 0.75, `${((tiers.deepCut / players.length) * 100).toFixed(0)}%`);
  const skillShare = top.filter((p) => SKILL_GROUPS.includes(p.group)).length / top.length;
  check('fame: top 40 is mostly QB/RB/WR/TE (recognisable positions)', skillShare >= 0.7,
    `${(skillShare * 100).toFixed(0)}%`);
  check('fame: the single most famous player is a QB or skill player',
    SKILL_GROUPS.includes(top[0].group), `${top[0].name} (${top[0].group})`);

  // --- highlights -----------------------------------------------------------------------------
  const playerById = new Map(players.map((p) => [p.id, p]));
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
