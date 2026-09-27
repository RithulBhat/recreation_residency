#!/usr/bin/env node
/**
 * Harvest and CERTIFY the highlight clips in `src/data/nfl/clips.json`.
 *
 * ---------------------------------------------------------------------------------------------
 * Why this script exists: the previous certification was invalid
 * ---------------------------------------------------------------------------------------------
 * The 215 clips shipped before this script were "verified embeddable" by instantiating each one
 * through the YouTube IFrame API and waiting for `onReady`. That proves nothing. A video whose
 * owner disabled playback on other sites still LOADS its player chrome and still answers
 * `onReady` — the restriction is only enforced when playback is actually requested, and it
 * surfaces as `onError` 150 ("blocked from display on this website"), never as a failed ready.
 *
 * The valid test, implemented in `testPlayability()` below, is:
 *   1. create the player,
 *   2. wait for `onReady`,
 *   3. `mute()` (headless Chromium only autoplays muted media) then `playVideo()`,
 *   4. poll `getPlayerState()` / `getCurrentTime()` for a few seconds while listening for
 *      `onError`.
 * A clip is playable only when the clock actually advances (state 1 = PLAYING and
 * currentTime > 0). Anything that errors, or never leaves buffering, is blocked.
 *
 * Measured outcome: every clip on the official "NFL" channel is blocked; the individual team
 * channels are where playable tape lives.
 *
 * A blocked clip is still WORTH KEEPING when nothing playable exists for that player: the reveal
 * falls back to a poster plus a working `youtube.com/watch` link (see `WatchTape`). So the goal is
 * to record the truth per clip in an `embeddable` boolean, not to delete blocked entries.
 *
 * ---------------------------------------------------------------------------------------------
 * Provenance: unchanged rules, stricter check
 * ---------------------------------------------------------------------------------------------
 * A video id is only ever taken from a real YouTube search result — never constructed, never
 * guessed. Every candidate is then confirmed through YouTube's keyless oEmbed endpoint, which
 * returns the AUTHORITATIVE channel title and channel handle (`author_url`, e.g.
 * `https://www.youtube.com/@packers`). A candidate is accepted only when that handle is on the
 * allowlist of the league channel plus the 32 team channels, and only when the title plausibly
 * names the player.
 *
 * ---------------------------------------------------------------------------------------------
 * Usage
 * ---------------------------------------------------------------------------------------------
 *   node scripts/harvest-clips.mjs --retest            re-certify the clips already in clips.json
 *   node scripts/harvest-clips.mjs --expand            find clips for uncovered fame>=55 players
 *   node scripts/harvest-clips.mjs --retest --expand --write    do both and rewrite clips.json
 *
 *   --min-fame=N     fame floor for --expand (default 55)
 *   --limit=N        cap how many players --expand works through this run
 *   --write          actually rewrite src/data/nfl/clips.json (otherwise it is a dry run)
 *   --cache-dir=DIR  where the search / oEmbed / playability caches live
 *   --report=FILE    write the full JSON report here
 *   --concurrency=N  parallel playability tests (default 4)
 *
 * Every network answer is cached on disk, so a re-run is nearly free and an interrupted run
 * resumes. `--fresh-playability` ignores the playability cache.
 *
 * NEVER writes src/data/nfl/players.json — it is read-only input here.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = join(ROOT, 'src', 'data', 'nfl');
const CLIPS_PATH = join(DATA, 'clips.json');
const PLAYERS_PATH = join(DATA, 'players.json');
const TEAMS_PATH = join(DATA, 'teams.json');

// -----------------------------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};

const OPTS = {
  retest: flag('retest'),
  expand: flag('expand'),
  write: flag('write'),
  freshPlayability: flag('fresh-playability'),
  minFame: Number(opt('min-fame', '55')),
  limit: Number(opt('limit', '0')) || Infinity,
  concurrency: Math.max(1, Number(opt('concurrency', '4'))),
  cacheDir: opt('cache-dir', join(ROOT, '.cache', 'clips')),
  report: opt('report', ''),
};
if (!OPTS.retest && !OPTS.expand) {
  OPTS.retest = true;
  OPTS.expand = true;
}

const log = (...args) => console.log(...args);

// -----------------------------------------------------------------------------------------------
// Disk cache — one JSON file per concern, so an interrupted run resumes for free
// -----------------------------------------------------------------------------------------------

mkdirSync(OPTS.cacheDir, { recursive: true });

function makeCache(name) {
  const path = join(OPTS.cacheDir, `${name}.json`);
  /** @type {Record<string, unknown>} */
  let store = {};
  if (existsSync(path)) {
    try {
      store = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      store = {};
    }
  }
  let dirty = false;
  const save = () => {
    if (!dirty) return;
    writeFileSync(path, JSON.stringify(store, null, 1));
    dirty = false;
  };
  return {
    get: (key) => store[key],
    has: (key) => Object.prototype.hasOwnProperty.call(store, key),
    set: (key, value) => {
      store[key] = value;
      dirty = true;
    },
    drop: (key) => {
      if (Object.prototype.hasOwnProperty.call(store, key)) {
        delete store[key];
        dirty = true;
      }
    },
    save,
    size: () => Object.keys(store).length,
  };
}

const searchCache = makeCache('search');
const oembedCache = makeCache('oembed');
const playCache = makeCache('playability');
const saveAll = () => {
  searchCache.save();
  oembedCache.save();
  playCache.save();
};

// -----------------------------------------------------------------------------------------------
// Official-channel allowlist
// -----------------------------------------------------------------------------------------------

const teams = JSON.parse(readFileSync(TEAMS_PATH, 'utf8'));

/**
 * The @handle of each team's official YouTube channel, keyed by ESPN abbreviation. Handles — not
 * display titles — are unique on YouTube, so this is the check that actually establishes
 * provenance. Every handle here was read off `author_url` from oEmbed for a clip already in the
 * dataset (or confirmed the same way when this list was extended); none was invented.
 */
const TEAM_HANDLES = {
  ARI: 'azcardinals',
  ATL: 'atlantafalcons',
  BAL: 'baltimoreravens',
  BUF: 'buffalobills',
  CAR: 'carolinapanthers',
  CHI: 'chicagobears',
  CIN: 'bengals',
  CLE: 'browns',
  DAL: 'dallascowboys',
  DEN: 'broncos',
  DET: 'detroitlionsnfl',
  GB: 'packers',
  HOU: 'houstontexans',
  IND: 'colts',
  JAX: 'jaguars',
  KC: 'kansascitychiefs',
  LAC: 'chargers',
  LAR: 'larams',
  LV: 'raiders',
  MIA: 'miamidolphins',
  MIN: 'vikings',
  NE: 'patriots',
  NO: 'neworleanssaints',
  NYG: 'nygiants',
  NYJ: 'nyjets',
  PHI: 'eagles',
  PIT: 'steelers',
  SEA: 'seahawks',
  SF: '49ers',
  TB: 'buccaneers',
  TEN: 'titans',
  WSH: 'commanders',
};

/** The league's own channel. Certified playable-blocked across the board — see the header. */
const LEAGUE_HANDLE = 'nfl';

/**
 * Every handle we will accept a clip from. The `channel` written into clips.json is whatever
 * YouTube itself calls the channel (oEmbed `author_name`) rather than the team's ESPN name — the
 * Raiders' channel is titled just "Raiders", and the reveal credits the publisher verbatim.
 */
const ALLOWED_HANDLES = new Set([LEAGUE_HANDLE]);
for (const team of teams) {
  const handle = TEAM_HANDLES[team.abbr];
  if (handle === undefined) throw new Error(`no YouTube handle mapped for team ${team.abbr}`);
  ALLOWED_HANDLES.add(handle);
}

const handleFromUrl = (authorUrl) => {
  const match = /youtube\.com\/@([^/?#]+)/i.exec(authorUrl ?? '');
  return match ? match[1].toLowerCase() : '';
};

// -----------------------------------------------------------------------------------------------
// Network helpers
// -----------------------------------------------------------------------------------------------

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return { status: res.status, text: await res.text() };
    } catch (err) {
      if (attempt === tries) throw err;
      await sleep(400 * attempt);
    }
  }
  throw new Error('unreachable');
}

/**
 * Keyless oEmbed provenance. Returns the authoritative channel title + handle and the real title,
 * or `{ ok: false }` when the video is private, deleted or region-blocked (oEmbed 401/404).
 */
async function oembed(videoId) {
  if (oembedCache.has(videoId)) return oembedCache.get(videoId);
  const url =
    'https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
  let value;
  try {
    const { status, text } = await fetchText(url);
    if (status !== 200) {
      value = { ok: false, status };
    } else {
      const json = JSON.parse(text);
      value = {
        ok: true,
        status,
        title: json.title,
        channel: json.author_name,
        handle: handleFromUrl(json.author_url),
      };
    }
  } catch (err) {
    value = { ok: false, status: 0, error: String(err) };
  }
  oembedCache.set(videoId, value);
  return value;
}

/**
 * Real YouTube search results, parsed out of the `ytInitialData` blob the results page ships in
 * its HTML. This is how candidate ids are DISCOVERED — every id comes from a live search for the
 * player's name, so no id is ever fabricated.
 */
async function searchYouTube(query) {
  if (searchCache.has(query)) return searchCache.get(query);
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  /** @type {Array<{videoId: string, title: string, channel: string, length: string}>} */
  let results = [];
  try {
    const { text } = await fetchText(url);
    const match = /var ytInitialData = (\{.*?\});<\/script>/s.exec(text);
    if (match) {
      const seen = new Set();
      const walk = (node) => {
        if (Array.isArray(node)) {
          for (const child of node) walk(child);
          return;
        }
        if (node === null || typeof node !== 'object') return;
        const renderer = node.videoRenderer;
        if (renderer && typeof renderer.videoId === 'string' && !seen.has(renderer.videoId)) {
          seen.add(renderer.videoId);
          results.push({
            videoId: renderer.videoId,
            title: renderer.title?.runs?.[0]?.text ?? '',
            channel: renderer.ownerText?.runs?.[0]?.text ?? '',
            length: renderer.lengthText?.simpleText ?? '',
          });
        }
        for (const child of Object.values(node)) walk(child);
      };
      walk(JSON.parse(match[1]));
    }
  } catch (err) {
    log(`  ! search failed for "${query}": ${String(err)}`);
    results = [];
  }
  searchCache.set(query, results);
  await sleep(220); // be a polite guest
  return results;
}

// -----------------------------------------------------------------------------------------------
// The playability test — the whole point of this script
// -----------------------------------------------------------------------------------------------

/**
 * The harness page. Served over http://127.0.0.1 so the embed has a real origin to be judged
 * against, exactly like the deployed site. `testClip` resolves with a verdict:
 *   'playable' — state reached PLAYING and the clock advanced past 0
 *   'blocked'  — onError fired (150/101 = embedding disabled, 100 = gone, 2 = bad id, 5 = HTML5)
 *   'stalled'  — no error, but playback never actually started inside the budget
 *   'no-ready' — the player never even initialised
 */
const HARNESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>clip playability harness</title>
<style>body{margin:0;background:#111}#slots{display:flex;flex-wrap:wrap}</style></head>
<body><div id="slots"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
  const apiReady = new Promise((res) => { window.onYouTubeIframeAPIReady = () => res(); });
  window.testClip = (videoId, budgetMs) => apiReady.then(() => new Promise((resolve) => {
    const host = document.createElement('div');
    document.getElementById('slots').appendChild(host);
    const events = [];
    let player = null, error = null, settled = false, poll = 0;
    const finish = (verdict, extra) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      try { if (player && player.destroy) player.destroy(); } catch (e) { /* already gone */ }
      host.remove();
      resolve(Object.assign({ verdict, error, events }, extra || {}));
    };
    const t0 = Date.now();
    try {
      player = new YT.Player(host, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        width: 320, height: 180,
        playerVars: { autoplay: 0, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            events.push(['ready', Date.now() - t0]);
            // Muted first: headless Chromium refuses unmuted autoplay, and a refusal would read
            // as "blocked" when the clip is fine. THEN ask to play — which is the only moment the
            // embedding restriction is enforced.
            try { player.mute(); player.playVideo(); } catch (e) { events.push(['throw', String(e)]); }
          },
          onStateChange: (e) => { events.push(['state', e.data, Date.now() - t0]); },
          onError: (e) => { error = e.data; events.push(['error', e.data, Date.now() - t0]); finish('blocked'); },
        },
      });
    } catch (e) { finish('no-ready', { thrown: String(e) }); return; }
    const started = Date.now();
    poll = setInterval(() => {
      let state = -99, time = 0;
      try { state = player.getPlayerState(); time = player.getCurrentTime() || 0; } catch (e) { /* not up yet */ }
      // PLAYING with a clock past zero is the only proof that survives scrutiny.
      if (state === 1 && time > 0.05) { finish('playable', { state, time }); return; }
      if (Date.now() - started > budgetMs) {
        const sawReady = events.some((ev) => ev[0] === 'ready');
        finish(sawReady ? (state === 1 ? 'playable' : 'stalled') : 'no-ready', { state, time });
      }
    }, 250);
  }));
</script></body></html>`;

const PLAY_BUDGET_MS = 9000;

/** Boots the harness: a local origin, a headless browser and N pages to test through. */
async function openHarness(pages) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HARNESS_HTML);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const open = [];
  for (let i = 0; i < pages; i += 1) {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForFunction('typeof window.testClip === "function"');
    open.push(page);
  }
  return {
    pages: open,
    origin: `http://127.0.0.1:${port}`,
    close: async () => {
      await browser.close();
      server.close();
    },
  };
}

/** One clip, one verdict. Cached, because a full pass is thousands of seconds of video handshakes. */
async function testPlayability(page, videoId) {
  if (!OPTS.freshPlayability && playCache.has(videoId)) return playCache.get(videoId);
  let value;
  try {
    value = await page.evaluate(
      ([id, budget]) => window.testClip(id, budget),
      [videoId, PLAY_BUDGET_MS],
    );
  } catch (err) {
    // A harness-level failure is NOT evidence about the clip, so it is never cached.
    return { verdict: 'harness-error', error: null, events: [], thrown: String(err) };
  }
  playCache.set(videoId, value);
  return value;
}

const isPlayable = (result) => result.verdict === 'playable';

/** Run `worker` over `items` with a fixed pool of harness pages. */
async function pooled(pages, items, worker) {
  let next = 0;
  const results = new Array(items.length);
  await Promise.all(
    pages.map(async (page) => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await worker(page, items[index], index);
      }
    }),
  );
  return results;
}

// -----------------------------------------------------------------------------------------------
// Candidate scoring
// -----------------------------------------------------------------------------------------------

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Does this title plausibly claim to be about this player? Requires the last name, and the first
 * name (or its initial, for the "C.Williams" style titles the league uses). Guards against a
 * search for "Zay Jones" landing on a Mac Jones reel.
 */
function titleNamesPlayer(title, player) {
  const hay = ` ${normalize(title)} `;
  const last = normalize(player.last);
  const first = normalize(player.first);
  if (last.length < 3 || !hay.includes(` ${last}`)) return false;
  if (hay.includes(`${first} ${last}`)) return true;
  // The league's own titles abbreviate ("C.Williams pass short right"), so an initial counts.
  if (first.length > 0 && hay.includes(` ${first[0]} ${last}`)) return true;
  // A lone surname is NOT enough: "Jefferson highlights" fits Justin and Van alike, and a clip
  // captioned with the wrong player is worse than no clip at all.
  return false;
}

const HIGHLIGHT_WORDS = [
  'highlight',
  'highlights',
  'top plays',
  'best plays',
  'every catch',
  'every touchdown',
  'season highlights',
  'career highlights',
  'mic',
];

/** Higher is better. Team channels beat the league channel because the league channel never plays. */
function scoreCandidate(candidate, player, teamAbbr) {
  const title = normalize(candidate.title);
  let score = 0;
  if (candidate.handle !== LEAGUE_HANDLE) score += 60; // team channel: the only kind that plays
  if (candidate.handle === TEAM_HANDLES[teamAbbr]) score += 15; // his own team's channel
  if (HIGHLIGHT_WORDS.some((word) => title.includes(word))) score += 20;
  if (title.includes('highlight')) score += 10;
  if (title.includes(normalize(`${player.first} ${player.last}`))) score += 12;
  const seconds = parseDuration(candidate.length);
  if (seconds >= 60) score += 8; // a reel, not a 20-second clip
  if (seconds > 0 && seconds < 25) score -= 15;
  const year = /(20\d\d)/.exec(candidate.title);
  if (year) score += Math.min(10, Math.max(0, Number(year[1]) - 2019));
  return score;
}

function parseDuration(text) {
  const parts = String(text).split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** The query ladder for one player, cheapest and most likely first. */
function queriesFor(player, team) {
  const name = `${player.first} ${player.last}`;
  return [
    `${name} highlights`,
    // The team's own name is what surfaces the TEAM channel's uploads, and team channels are the
    // only ones that ever play: the league channel measured 0 playable out of 80.
    team ? `${name} ${team.displayName} highlights` : '',
    `${name} top plays`,
  ].filter((q) => q.length > 0);
}

// -----------------------------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------------------------

const players = JSON.parse(readFileSync(PLAYERS_PATH, 'utf8'));
const playersById = new Map(players.map((p) => [p.id, p]));
const teamsById = new Map(teams.map((t) => [t.id, t]));
const existing = JSON.parse(readFileSync(CLIPS_PATH, 'utf8'));

log(`clips.json: ${existing.length} entries · players.json: ${players.length} players`);

const harness = await openHarness(OPTS.concurrency);
log(`harness up on ${harness.origin} with ${harness.pages.length} page(s)\n`);

/** videoId → { channel, title, handle, embeddable, verdict } for everything certified this run. */
const certified = new Map();

async function certify(page, videoId) {
  if (certified.has(videoId)) return certified.get(videoId);
  const meta = await oembed(videoId);
  if (!meta.ok) {
    const bad = { ok: false, reason: `oembed ${meta.status}` };
    certified.set(videoId, bad);
    return bad;
  }
  if (!ALLOWED_HANDLES.has(meta.handle)) {
    const bad = { ok: false, reason: `unofficial channel @${meta.handle} (${meta.channel})` };
    certified.set(videoId, bad);
    return bad;
  }
  const play = await testPlayability(page, videoId);
  const record = {
    ok: true,
    videoId,
    channel: meta.channel,
    handle: meta.handle,
    title: meta.title,
    embeddable: isPlayable(play),
    verdict: play.verdict,
    errorCode: play.error ?? null,
  };
  certified.set(videoId, record);
  return record;
}

// --- 1. Re-certify what is already shipped -----------------------------------------------------

/** id → clip we are going to ship. */
const final = new Map();
const retestRows = [];

if (OPTS.retest) {
  log(`— re-certifying ${existing.length} existing clips —`);
  let done = 0;
  await pooled(harness.pages, existing, async (page, clip) => {
    const record = await certify(page, clip.videoId);
    done += 1;
    if (done % 25 === 0) {
      log(`  ${done}/${existing.length}`);
      saveAll();
    }
    retestRows.push({ id: clip.id, videoId: clip.videoId, ...record });
    if (record.ok) {
      final.set(clip.id, {
        id: clip.id,
        videoId: clip.videoId,
        channel: record.channel,
        title: record.title,
        embeddable: record.embeddable,
      });
    }
  });
  saveAll();
  const playable = retestRows.filter((r) => r.ok && r.embeddable).length;
  const dropped = retestRows.filter((r) => !r.ok);
  log(`  playable ${playable}/${existing.length}; blocked ${existing.length - playable - dropped.length}; unusable ${dropped.length}`);
  for (const row of dropped) log(`    drop ${row.id} ${row.videoId}: ${row.reason}`);
  log('');
} else {
  for (const clip of existing) {
    final.set(clip.id, { ...clip, embeddable: clip.embeddable ?? false });
  }
}

// --- 2. Expand coverage ------------------------------------------------------------------------

const expandRows = [];

if (OPTS.expand) {
  const targets = players
    .filter((p) => p.fame >= OPTS.minFame)
    .filter((p) => {
      const have = final.get(p.id);
      return have === undefined || have.embeddable !== true;
    })
    .sort((a, b) => b.fame - a.fame)
    .slice(0, OPTS.limit === Infinity ? undefined : OPTS.limit);

  log(`— expanding: ${targets.length} players at fame >= ${OPTS.minFame} without a PLAYABLE clip —`);

  let index = 0;
  await pooled(harness.pages, targets, async (page, player) => {
    index += 1;
    const seq = index;
    const team = teamsById.get(player.teamId);
    const tried = new Set();
    /** @type {Array<{videoId: string, title: string, channel: string, handle: string, length: string, score: number}>} */
    const candidates = [];

    for (const query of queriesFor(player, team)) {
      if (query.length === 0) continue;
      for (const hit of await searchYouTube(query)) {
        if (tried.has(hit.videoId)) continue;
        tried.add(hit.videoId);
        if (!titleNamesPlayer(hit.title, player)) continue;
        const meta = await oembed(hit.videoId);
        if (!meta.ok) continue;
        if (!ALLOWED_HANDLES.has(meta.handle)) continue;
        if (!titleNamesPlayer(meta.title, player)) continue;
        candidates.push({
          videoId: hit.videoId,
          title: meta.title,
          channel: meta.channel,
          handle: meta.handle,
          length: hit.length,
          score: scoreCandidate({ ...hit, handle: meta.handle }, player, team?.abbr ?? ''),
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    // Test in score order and stop at the first PLAYABLE one; remember the best blocked fallback.
    let chosen = null;
    let fallback = final.get(player.id) ?? null;
    const attempts = [];
    for (const candidate of candidates.slice(0, 8)) {
      const record = await certify(page, candidate.videoId);
      attempts.push({ videoId: candidate.videoId, score: candidate.score, ...record });
      if (!record.ok) continue;
      if (record.embeddable) {
        chosen = record;
        break;
      }
      if (fallback === null) {
        fallback = {
          id: player.id,
          videoId: record.videoId,
          channel: record.channel,
          title: record.title,
          embeddable: false,
        };
      }
    }

    const picked =
      chosen !== null
        ? {
            id: player.id,
            videoId: chosen.videoId,
            channel: chosen.channel,
            title: chosen.title,
            embeddable: true,
          }
        : fallback;
    if (picked !== null) final.set(player.id, picked);

    expandRows.push({
      id: player.id,
      name: player.name,
      fame: player.fame,
      team: team?.abbr ?? '',
      candidates: candidates.length,
      attempts,
      picked: picked === null ? null : { videoId: picked.videoId, channel: picked.channel, embeddable: picked.embeddable },
    });

    const mark = chosen !== null ? 'PLAY' : picked !== null ? 'blkd' : ' -- ';
    log(
      `  [${String(seq).padStart(3)}/${targets.length}] ${mark} ${player.name} (${player.fame}) ` +
        `${candidates.length} cand${picked ? ` → ${picked.videoId} ${picked.channel}` : ''}`,
    );
    if (seq % 10 === 0) saveAll();
  });
  saveAll();
  log('');
}

await harness.close();
saveAll();

// --- 3. Write + report -------------------------------------------------------------------------

/**
 * A clip is keyed by ESPN athlete id and looked up by it, so a clip for someone who has fallen off
 * every roster can never be reached — `players.json` is the only source of ids the game asks about.
 * These accumulate naturally as `sync-nfl.mjs` refreshes rosters, so the prune happens every run.
 */
for (const [id, clip] of [...final]) {
  if (playersById.has(id)) continue;
  final.delete(id);
  log(`  prune ${id} (not in players.json): ${clip.title}`);
}

const shipped = [...final.values()].sort((a, b) => Number(a.id) - Number(b.id));
const playableCount = shipped.filter((c) => c.embeddable).length;

/** Playability rate by channel — the finding that drives the whole dataset. */
const byChannel = new Map();
for (const clip of shipped) {
  const row = byChannel.get(clip.channel) ?? { total: 0, playable: 0 };
  row.total += 1;
  if (clip.embeddable) row.playable += 1;
  byChannel.set(clip.channel, row);
}

const famous = players.filter((p) => p.fame >= OPTS.minFame);
const famousWithAny = famous.filter((p) => final.has(p.id)).length;
const famousWithPlayable = famous.filter((p) => final.get(p.id)?.embeddable === true).length;

log('================ RESULT ================');
log(`clips shipped:            ${shipped.length} (was ${existing.length})`);
log(`playable:                 ${playableCount} (${((playableCount / shipped.length) * 100).toFixed(1)}%)`);
log(`blocked but linkable:     ${shipped.length - playableCount}`);
log(`players fame>=${OPTS.minFame}:         ${famous.length}`);
log(`  ... with any clip:      ${famousWithAny} (${((famousWithAny / famous.length) * 100).toFixed(1)}%)`);
log(`  ... with playable clip: ${famousWithPlayable} (${((famousWithPlayable / famous.length) * 100).toFixed(1)}%)`);
log('playability by channel:');
for (const [channel, row] of [...byChannel].sort((a, b) => b[1].total - a[1].total)) {
  log(`  ${channel.padEnd(24)} ${String(row.playable).padStart(3)}/${String(row.total).padStart(3)}`);
}

if (OPTS.write) {
  // One object per line keeps the diff readable and the file small.
  const body = shipped
    .map(
      (c) =>
        JSON.stringify({
          id: c.id,
          videoId: c.videoId,
          channel: c.channel,
          title: c.title,
          embeddable: c.embeddable,
        }),
    )
    .join(',\n');
  writeFileSync(CLIPS_PATH, `[\n${body}\n]\n`);
  log(`\nwrote ${CLIPS_PATH}`);
} else {
  log('\n(dry run — pass --write to rewrite clips.json)');
}

if (OPTS.report.length > 0) {
  mkdirSync(dirname(resolve(OPTS.report)), { recursive: true });
  writeFileSync(
    resolve(OPTS.report),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        opts: OPTS,
        totals: {
          shipped: shipped.length,
          playable: playableCount,
          famous: famous.length,
          famousWithAny,
          famousWithPlayable,
        },
        byChannel: Object.fromEntries(byChannel),
        retest: retestRows,
        expand: expandRows,
      },
      null,
      1,
    ),
  );
  log(`report → ${resolve(OPTS.report)}`);
}

// The prune above is what keeps this at zero; a non-zero count here would mean it regressed.
const orphans = shipped.filter((c) => !playersById.has(c.id));
if (orphans.length > 0) log(`\nBUG: ${orphans.length} clip(s) still reference ids absent from players.json`);
