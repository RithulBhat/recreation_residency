#!/usr/bin/env node
/**
 * Bake Higher or Lower content from sources that can actually be cited.
 *
 * Unlike Price Guess, most of this game's content IS verifiable, so it ships `verified: true`
 * with a real `source` and an `asOf` taken from the provider rather than from today's date.
 *
 *   World Bank  api.worldbank.org/v2  — population, GDP, surface area. Sends CORS headers and
 *                                       exposes `lastupdated`, which becomes `asOf`.
 *   ESPN        already baked in src/data/nfl/players.json by scripts/sync-nfl.mjs.
 *   Deezer      api.deezer.com — track popularity and release year. Fetched HERE in Node, where
 *                                CORS does not apply; the browser could never call it directly.
 *
 * restcountries.com is deliberately absent: both v3.1 and the v5 endpoint its own deprecation
 * notice points at return an error payload instead of data. Checked before this was written.
 *
 *   node scripts/sync-hilo.mjs
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/data/hilo');
mkdirSync(OUT, { recursive: true });

const WB = 'https://api.worldbank.org/v2';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'recreation-residency/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** ISO2 -> flag emoji via regional indicator symbols. */
function flag(iso2) {
  if (typeof iso2 !== 'string' || iso2.length !== 2) return '🌍';
  const A = 0x1f1e6;
  const code = iso2.toUpperCase();
  return String.fromCodePoint(A + code.charCodeAt(0) - 65, A + code.charCodeAt(1) - 65);
}

/** Real countries only — World Bank mixes in aggregates like "Africa Eastern and Southern". */
async function realCountries() {
  const out = new Map();
  for (let page = 1; page <= 4; page++) {
    const [meta, rows] = await getJson(`${WB}/country?format=json&per_page=300&page=${page}`);
    for (const c of rows ?? []) {
      if (!c.region || c.region.id === 'NA') continue; // aggregates carry region id 'NA'
      out.set(c.id, { iso3: c.id, iso2: c.iso2Code, name: c.name, region: c.region.value });
    }
    if (page >= (meta?.pages ?? 1)) break;
  }
  return out;
}

async function indicatorPack({ id, name, emoji, tagline, indicator, unit, years, min, blurb }) {
  const countries = await realCountries();
  const values = new Map();
  let asOf = null;

  for (const year of years) {
    for (let page = 1; page <= 4; page++) {
      const [meta, rows] = await getJson(
        `${WB}/country/all/indicator/${indicator}?format=json&per_page=300&page=${page}&date=${year}`,
      );
      if (meta?.lastupdated && !asOf) asOf = meta.lastupdated;
      for (const r of rows ?? []) {
        if (r.value == null || !Number.isFinite(r.value)) continue;
        const c = countries.get(r.countryiso3code);
        if (!c || values.has(c.iso3)) continue;
        values.set(c.iso3, { c, value: r.value, year: r.date });
      }
      if (page >= (meta?.pages ?? 1)) break;
    }
  }

  const items = [...values.values()]
    .filter((v) => v.value >= min)
    .map(({ c, value, year }) => ({
      id: c.iso3.toLowerCase(),
      name: c.name,
      emoji: flag(c.iso2),
      category: c.region,
      value: Math.round(value),
      unit,
      source: `World Bank indicator ${indicator}, ${year}`,
      asOf: asOf ?? new Date().toISOString().slice(0, 10),
      verified: true,
      blurb: blurb(c, year),
    }))
    .sort((a, b) => b.value - a.value);

  return { id, name, emoji, tagline, category: 'countries', unit, items };
}

function nflPacks() {
  const players = JSON.parse(readFileSync(join(ROOT, 'src/data/nfl/players.json'), 'utf8'));
  const asOf = '2026-09-26'; // when sync-nfl.mjs last harvested the rosters
  const POS = { QB: '🎯', RB: '🏃', WR: '🙌', TE: '🧱', OL: '🛡️', DL: '💥', LB: '🦾', DB: '🧤', ST: '🦶' };

  const weight = players
    .filter((p) => Number.isFinite(p.weightLb) && p.weightLb > 100 && p.fame >= 20)
    .map((p) => ({
      id: `w-${p.id}`,
      name: p.name,
      emoji: POS[p.group] ?? '🏈',
      category: p.group ?? 'NFL',
      value: p.weightLb,
      unit: 'pounds',
      source: 'ESPN NFL rosters via scripts/sync-nfl.mjs',
      asOf,
      verified: true,
      blurb: `${p.pos}${p.college ? ` · ${p.college}` : ''}`,
    }))
    .slice(0, 400);

  const draft = players
    .filter((p) => p.draft && Number.isFinite(p.draft.pick) && p.draft.pick > 0 && p.fame >= 25)
    .map((p) => ({
      id: `d-${p.id}`,
      name: p.name,
      emoji: POS[p.group] ?? '🏈',
      category: p.group ?? 'NFL',
      value: p.draft.pick,
      unit: 'rank',
      source: 'ESPN NFL athlete records via scripts/sync-nfl.mjs',
      asOf,
      verified: true,
      blurb: `${p.pos} · drafted ${p.draft.year}`,
    }))
    .slice(0, 400);

  return [
    {
      id: 'nfl-weight',
      name: 'NFL Weigh-In',
      emoji: '🏈',
      tagline: 'Which of these two is the heavier man?',
      category: 'nfl',
      unit: 'pounds',
      items: weight,
    },
    {
      id: 'nfl-draft',
      name: 'Draft Position',
      emoji: '📋',
      tagline: 'Who went earlier on draft night? Lower is better.',
      category: 'nfl',
      unit: 'rank',
      items: draft,
    },
  ];
}

async function songsPack() {
  const seen = new Map();
  const charts = [0, 132, 116, 152, 113, 165, 85, 106];
  for (const genreId of charts) {
    try {
      const data = await getJson(`https://api.deezer.com/chart/${genreId}/tracks?limit=100`);
      for (const t of data.data ?? []) {
        if (!t?.id || !Number.isFinite(t.rank) || seen.has(t.id)) continue;
        seen.set(t.id, t);
      }
    } catch {
      /* one chart failing should not lose the pack */
    }
  }
  const asOf = new Date().toISOString().slice(0, 10);
  const items = [...seen.values()].map((t) => ({
    id: `t-${t.id}`,
    name: `${t.title_short ?? t.title} — ${t.artist?.name ?? 'Unknown'}`,
    emoji: '🎵',
    category: 'Music',
    value: t.rank,
    unit: 'rank',
    source: 'Deezer public API (chart popularity, 0–1,000,000)',
    asOf,
    verified: true,
    blurb: t.album?.title ? `From ${t.album.title}` : undefined,
  }));
  return {
    id: 'song-popularity',
    name: 'Chart Heat',
    emoji: '🎧',
    tagline: 'Which track is Deezer playing more?',
    category: 'music',
    unit: 'rank',
    items,
  };
}

const packs = [];
console.log('World Bank: population…');
packs.push(
  await indicatorPack({
    id: 'country-population',
    name: 'How Many Live There',
    emoji: '🌍',
    tagline: 'Which country has more people?',
    indicator: 'SP.POP.TOTL',
    unit: 'people',
    years: [2024, 2023, 2022],
    min: 100_000,
    blurb: (c, y) => `${c.region} · ${y}`,
  }),
);
console.log('World Bank: GDP…');
packs.push(
  await indicatorPack({
    id: 'country-gdp',
    name: 'Size of the Economy',
    emoji: '💵',
    tagline: 'Which country has the bigger GDP?',
    indicator: 'NY.GDP.MKTP.CD',
    unit: 'usd',
    years: [2024, 2023, 2022],
    min: 1_000_000_000,
    blurb: (c, y) => `${c.region} · ${y}`,
  }),
);
console.log('World Bank: surface area…');
packs.push(
  await indicatorPack({
    id: 'country-area',
    name: 'How Big Is It',
    emoji: '🗺️',
    tagline: 'Which country covers more ground?',
    indicator: 'AG.SRF.TOTL.K2',
    unit: 'sqkm',
    years: [2022, 2021, 2020],
    min: 1000,
    blurb: (c, y) => `${c.region} · ${y}`,
  }),
);
console.log('ESPN: NFL…');
packs.push(...nflPacks());
console.log('Deezer: charts…');
packs.push(await songsPack());

for (const pack of packs) {
  writeFileSync(join(OUT, `${pack.id}.json`), JSON.stringify(pack, null, 1) + '\n');
  console.log(`  ${pack.id.padEnd(20)} ${String(pack.items.length).padStart(4)} items  ${pack.unit}`);
}
console.log('\n✓ baked to src/data/hilo');
