#!/usr/bin/env node
/**
 * Verify every Deezer source in src/data/packs.json.
 *
 * From Node there is no CORS problem, so we use plain `fetch` (the browser client in
 * src/lib/deezer.ts must use JSONP instead). Requests are rate limited to 8/s — well
 * under Deezer's 50 requests / 5 s per IP.
 *
 * Usage:
 *   node scripts/verify-packs.mjs                 # verify everything, print a table
 *   node scripts/verify-packs.mjs --write         # also update approxSize in packs.json
 *   node scripts/verify-packs.mjs --pack pop-hits # verify a single pack (repeatable)
 *   node scripts/verify-packs.mjs --min 30        # failure threshold (default 30)
 *   node scripts/verify-packs.mjs --quiet         # only print the summary + failures
 *   node scripts/verify-packs.mjs --no-color
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_FILE = path.join(ROOT, 'src', 'data', 'packs.json');

/* --------------------------------------------------------------------- args */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const onlyPacks = argv.reduce((acc, arg, i) => {
  if (arg === '--pack' && argv[i + 1]) acc.push(argv[i + 1]);
  return acc;
}, []);

const WRITE = flag('write');
const QUIET = flag('quiet');
const MIN_PLAYABLE = Number.parseInt(value('min', '30'), 10);

const COLOR = !flag('no-color') && process.stdout.isTTY !== false;
const ESC = String.fromCharCode(27);
const paint = (code, text) => (COLOR ? `${ESC}[${code}m${text}${ESC}[0m` : text);
const green = (t) => paint('32', t);
const red = (t) => paint('31', t);
const yellow = (t) => paint('33', t);

/* ------------------------------------------------------------ rate limiting */

const REQUESTS_PER_SECOND = 8;
const MAX_IN_FLIGHT = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let stamps = [];
let inFlight = 0;
let requestCount = 0;

async function slot() {
  for (;;) {
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < 1000);
    if (stamps.length < REQUESTS_PER_SECOND && inFlight < MAX_IN_FLIGHT) {
      stamps.push(now);
      return;
    }
    await sleep(50);
  }
}

async function dz(pathOrUrl, attempts = 4) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.deezer.com${pathOrUrl}`;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await slot();
    inFlight += 1;
    requestCount += 1;
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'songooner-verify-packs/1.0' } });
      const json = await res.json();
      if (json && json.error) {
        const code = Number(json.error.code);
        // 4 = quota exceeded, 700 = service busy → back off and retry.
        if ((code === 4 || code === 700) && attempt < attempts - 1) {
          await sleep(1200 * (attempt + 1));
          continue;
        }
        return { error: `${json.error.type ?? 'Error'} ${code}: ${json.error.message ?? ''}`.trim() };
      }
      return json;
    } catch (err) {
      if (attempt === attempts - 1) return { error: String(err instanceof Error ? err.message : err) };
      await sleep(500 * (attempt + 1));
    } finally {
      inFlight -= 1;
    }
  }
  return { error: 'retries exhausted' };
}

/* ------------------------------------------------------------------ helpers */

/** Mirrors normalizeText() in src/lib/catalog.ts so dedupe counts match the app. */
const normalize = (input) =>
  String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function sourcePath(source) {
  switch (source.kind) {
    case 'playlist': return `/playlist/${source.id}/tracks`;
    case 'chart': return `/chart/${source.genreId}/tracks?limit=100`;
    case 'artist': return `/artist/${source.id}/top?limit=100`;
    case 'album': return `/album/${source.id}/tracks`;
    case 'search': return `/search?q=${encodeURIComponent(source.q)}&limit=100`;
    default: return null;
  }
}

function sourceLabel(source) {
  switch (source.kind) {
    case 'playlist': return `playlist/${source.id}`;
    case 'chart': return `chart/${source.genreId}`;
    case 'artist': return `artist/${source.id}`;
    case 'album': return `album/${source.id}`;
    case 'search': return `search "${source.q}"`;
    default: return `unknown(${JSON.stringify(source)})`;
  }
}

/** Paginate a tracklist endpoint up to `max` rows (100 per page). */
async function fetchTracks(source) {
  const base = sourcePath(source);
  if (base === null) return { error: `unsupported source kind "${source.kind}"`, rows: [] };
  const max = source.kind === 'playlist' ? 300 : 100;
  const rows = [];
  let index = 0;
  while (rows.length < max) {
    const sep = base.includes('?') ? '&' : '?';
    const page = await dz(`${base}${sep}index=${index}&limit=100`);
    if (page.error) return { error: page.error, rows };
    const data = Array.isArray(page.data) ? page.data : [];
    rows.push(...data);
    if (data.length < 100 || !page.next) break;
    index += 100;
  }
  return { rows: rows.slice(0, max) };
}

const playable = (track) =>
  Boolean(track) && track.readable !== false && typeof track.preview === 'string' && track.preview.length > 0;

/* --------------------------------------------------------------------- main */

const packs = JSON.parse(fs.readFileSync(PACKS_FILE, 'utf8'));
const targets = onlyPacks.length > 0 ? packs.filter((p) => onlyPacks.includes(p.id)) : packs;

if (targets.length === 0) {
  console.error(`No packs matched ${onlyPacks.join(', ')}`);
  process.exit(1);
}

console.log(
  `Verifying ${targets.length} pack(s) against api.deezer.com (min ${MIN_PLAYABLE} playable tracks)\n`,
);

const started = Date.now();
const reports = [];
const failures = [];
const seenSources = new Map();

for (const pack of targets) {
  const ids = new Set();
  const keys = new Set();
  const sourceRows = [];
  let hadError = false;

  for (const source of pack.sources) {
    const label = sourceLabel(source);
    const dupOf = seenSources.get(label);
    seenSources.set(label, pack.id);

    const { rows, error } = await fetchTracks(source);
    const ok = rows.filter(playable);
    let added = 0;
    for (const track of ok) {
      const key = `${normalize(track.title_short ?? track.title)}|${normalize(track.artist?.name)}`;
      if (ids.has(track.id) || keys.has(key)) continue;
      ids.add(track.id);
      keys.add(key);
      added += 1;
    }
    if (error) hadError = true;
    sourceRows.push({
      label,
      raw: rows.length,
      playable: ok.length,
      ratio: rows.length > 0 ? ok.length / rows.length : 0,
      added,
      error,
      dupOf: dupOf && dupOf !== pack.id ? dupOf : undefined,
    });
  }

  const size = ids.size;
  const status = size >= MIN_PLAYABLE && !hadError ? 'PASS' : 'FAIL';
  const report = { pack, size, status, sources: sourceRows };
  reports.push(report);
  if (status === 'FAIL') failures.push(report);

  if (!QUIET) {
    const badge = status === 'PASS' ? green('PASS') : red('FAIL');
    const drift = pack.approxSize !== undefined ? size - pack.approxSize : 0;
    const driftText =
      pack.approxSize === undefined ? ' (new)' : drift === 0 ? '' : ` (${drift > 0 ? '+' : ''}${drift})`;
    console.log(
      `${badge} ${pack.id.padEnd(26)} ${String(size).padStart(4)} playable${driftText.padEnd(8)} ${pack.category}`,
    );
    for (const s of sourceRows) {
      const pct = `${Math.round(s.ratio * 100)}%`.padStart(4);
      const note = [
        s.error ? red(s.error) : null,
        s.dupOf ? yellow(`also in ${s.dupOf}`) : null,
        s.playable > 0 && s.added === 0 ? yellow('fully duplicate') : null,
      ]
        .filter(Boolean)
        .join(' · ');
      console.log(
        `       ${s.label.padEnd(24)} ${String(s.playable).padStart(3)}/${String(s.raw).padEnd(3)} previews ${pct}  +${String(s.added).padStart(3)} new ${note}`,
      );
    }
  }
}

/* ------------------------------------------------------------------ summary */

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const passed = reports.length - failures.length;
const sizes = reports.map((r) => r.size).sort((a, b) => a - b);
const allSources = reports.flatMap((r) => r.sources);
const totalRaw = allSources.reduce((a, s) => a + s.raw, 0);
const totalOk = allSources.reduce((a, s) => a + s.playable, 0);
const previewRatio = totalRaw > 0 ? totalOk / totalRaw : 0;
const totalTracks = sizes.reduce((a, b) => a + b, 0);

const byCategory = {};
for (const r of reports) {
  const c = (byCategory[r.pack.category] ??= { packs: 0, tracks: 0, failed: 0 });
  c.packs += 1;
  c.tracks += r.size;
  if (r.status === 'FAIL') c.failed += 1;
}

const rule = '-'.repeat(74);
console.log(`\n${rule}`);
console.log('category      packs   failed   total tracks   avg tracks');
console.log(rule);
for (const [cat, c] of Object.entries(byCategory).sort((a, b) => b[1].packs - a[1].packs)) {
  console.log(
    cat.padEnd(14) +
      String(c.packs).padStart(5) +
      String(c.failed).padStart(9) +
      String(c.tracks).padStart(15) +
      String(Math.round(c.tracks / c.packs)).padStart(13),
  );
}
console.log(rule);
console.log(
  'TOTAL'.padEnd(14) +
    String(reports.length).padStart(5) +
    String(failures.length).padStart(9) +
    String(totalTracks).padStart(15) +
    String(Math.round(totalTracks / (sizes.length || 1))).padStart(13),
);
console.log(rule);
console.log(
  `\n${passed}/${reports.length} passed · ${allSources.length} sources · preview ratio ${(previewRatio * 100).toFixed(1)}%` +
    ` · smallest ${sizes[0] ?? 0} · median ${sizes[Math.floor(sizes.length / 2)] ?? 0} · largest ${sizes[sizes.length - 1] ?? 0}` +
    `\n${requestCount} requests in ${elapsed}s`,
);

if (failures.length > 0) {
  console.log(`\n${red(`FAILURES (${failures.length}) — replace these sources:`)}`);
  for (const f of failures) {
    console.log(`  ${f.pack.id} — ${f.size} playable`);
    for (const s of f.sources.filter((row) => row.error || row.playable < 10)) {
      console.log(`      ${s.label}: ${s.error ?? `only ${s.playable} playable`}`);
    }
  }
}

if (WRITE) {
  const bySize = new Map(reports.map((r) => [r.pack.id, r.size]));
  let changed = 0;
  for (const pack of packs) {
    const size = bySize.get(pack.id);
    if (size === undefined || pack.approxSize === size) continue;
    pack.approxSize = size;
    changed += 1;
  }
  // One pack per line keeps the file diff-friendly.
  fs.writeFileSync(PACKS_FILE, `[\n${packs.map((p) => JSON.stringify(p)).join(',\n')}\n]\n`);
  console.log(`\nWrote approxSize for ${changed} pack(s) -> ${path.relative(ROOT, PACKS_FILE)}`);
}

process.exit(failures.length > 0 ? 1 : 0);
