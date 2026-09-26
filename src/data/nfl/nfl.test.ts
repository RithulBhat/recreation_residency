import { describe, expect, it } from 'vitest';
import highlightsJson from './highlights.json';
import metaJson from './meta.json';
import playersJson from './players.json';
import statlinesJson from './statlines.json';
import teamsJson from './teams.json';
import {
  headshotUrl,
  loadDataset,
  loadHighlights,
  loadMeta,
  loadPlayers,
  loadPlayersById,
  loadStatLines,
  loadTeams,
  loadTeamsById,
  logoUrl,
} from '@/data/nfl';
import type {
  Conference,
  DivisionName,
  HighlightPlay,
  NflPlayer,
  NflTeam,
  PositionGroup,
  StatLine,
} from '@/scout/types';

/**
 * Contract tests for the baked dataset. The JSON is imported directly so the assertions run
 * against exactly what ships; `scripts/verify-nfl.mjs` is the deeper, network-aware sibling.
 */

// The `as` casts mirror src/data/nfl/index.ts: TS widens imported JSON literals, and these
// tests are what prove the widened data really does satisfy the contract.
const teams = teamsJson as unknown as NflTeam[];
const players = playersJson as unknown as NflPlayer[];
const highlights = highlightsJson as unknown as HighlightPlay[];
const statlines = statlinesJson as unknown as StatLine[];

const CONFERENCES: Conference[] = ['AFC', 'NFC'];
const DIVISIONS: DivisionName[] = ['North', 'South', 'East', 'West'];
const GROUPS: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];

const teamIds = new Set(teams.map((t) => t.id));
const teamAbbrs = new Set(teams.map((t) => t.abbr));
const playerIds = new Set(players.map((p) => p.id));

describe('teams.json satisfies NflTeam', () => {
  it('has all 32 franchises with unique ids and abbreviations', () => {
    expect(teams).toHaveLength(32);
    expect(teamIds.size).toBe(32);
    expect(teamAbbrs.size).toBe(32);
  });

  it('splits into eight divisions of four', () => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      expect(CONFERENCES, t.abbr).toContain(t.conference);
      expect(DIVISIONS, t.abbr).toContain(t.division);
      const key = `${t.conference} ${t.division}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(8);
    for (const [key, n] of counts) expect(n, key).toBe(4);
  });

  it('carries ESPN identity fields', () => {
    for (const t of teams) {
      expect(t.name.length, t.abbr).toBeGreaterThan(0);
      expect(t.location.length, t.abbr).toBeGreaterThan(0);
      expect(t.displayName, t.abbr).toContain(t.name);
      expect(t.venue.length, t.abbr).toBeGreaterThan(0);
      expect(t.color, t.abbr).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.altColor, t.abbr).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.logo, t.abbr).toMatch(/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500/);
    }
  });

  it('carries the curated clue fields', () => {
    for (const t of teams) {
      expect(t.founded, t.abbr).toBeGreaterThan(1890);
      expect(t.founded, t.abbr).toBeLessThanOrEqual(2005);
      expect(t.facts.length, t.abbr).toBeGreaterThanOrEqual(6);
      expect(t.legends.length, t.abbr).toBeGreaterThanOrEqual(4);
      expect(t.aliases.length, t.abbr).toBeGreaterThanOrEqual(3);
      expect(t.rivals.length, t.abbr).toBeGreaterThan(0);
      for (const a of t.aliases) expect(a, t.abbr).toBe(a.toLowerCase());
      for (const r of t.rivals) {
        expect(teamAbbrs, `${t.abbr} rival`).toContain(r);
        expect(r).not.toBe(t.abbr);
      }
      expect(t.aliases, t.abbr).toContain(t.name.toLowerCase());
    }
  });

  it('never names a team inside its own clue ladder', () => {
    for (const t of teams) {
      for (const fact of t.facts) {
        for (const word of [t.name, t.location]) {
          expect(fact.toLowerCase(), `${t.abbr}: ${fact}`).not.toContain(word.toLowerCase());
        }
      }
    }
  });

  it('accounts for every Super Bowl exactly once', () => {
    const won = teams.flatMap((t) => t.superBowls);
    const lastCompleted = metaJson.season - 1;
    expect(won).toHaveLength(lastCompleted - 1966 + 1);
    expect(new Set(won).size).toBe(won.length);
    for (const season of won) {
      expect(season).toBeGreaterThanOrEqual(1966);
      expect(season).toBeLessThanOrEqual(lastCompleted);
    }
  });
});

describe('players.json satisfies NflPlayer', () => {
  it('ships a full league of players with unique ids', () => {
    expect(players.length).toBeGreaterThan(1600);
    expect(playerIds.size).toBe(players.length);
  });

  it('maps every raw position onto a PositionGroup', () => {
    for (const p of players) {
      expect(GROUPS, `${p.name} (${p.pos})`).toContain(p.group);
      expect(p.pos.length, p.name).toBeGreaterThan(0);
    }
  });

  it('gives every player a CORS-enabled headshot matching their id', () => {
    for (const p of players) {
      expect(p.headshot, p.name).toMatch(
        /^https:\/\/a\.espncdn\.com\/i\/headshots\/(?:nfl|college-football)\/players\/full\/\d+\.png$/,
      );
      expect(p.headshot, p.name).toContain(`/${p.id}.png`);
    }
  });

  it('keeps names, teams and measurements coherent', () => {
    for (const p of players) {
      expect(teamIds, p.name).toContain(p.teamId);
      expect(p.name.length, p.id).toBeGreaterThan(0);
      expect(p.last.length, p.id).toBeGreaterThan(0);
      if (p.heightIn !== undefined) expect(p.heightIn, p.name).toBeGreaterThan(55);
      if (p.heightIn !== undefined) expect(p.heightIn, p.name).toBeLessThan(90);
      if (p.weightLb !== undefined) expect(p.weightLb, p.name).toBeGreaterThan(120);
      if (p.weightLb !== undefined) expect(p.weightLb, p.name).toBeLessThan(420);
      if (p.draft) {
        expect(p.draft.round, p.name).toBeGreaterThanOrEqual(1);
        expect(p.draft.round, p.name).toBeLessThanOrEqual(8);
        expect(p.draft.pick, p.name).toBeGreaterThanOrEqual(1);
        expect(p.draft.year, p.name).toBeGreaterThan(1970);
      }
      for (const a of p.aliases ?? []) expect(a, p.name).toBe(a.toLowerCase());
    }
  });

  it('spreads fame across all four difficulty tiers', () => {
    for (const p of players) {
      expect(p.fame, p.name).toBeGreaterThanOrEqual(1);
      expect(p.fame, p.name).toBeLessThanOrEqual(100);
    }
    const star = players.filter((p) => p.fame >= 80);
    const starter = players.filter((p) => p.fame >= 55 && p.fame < 80);
    const rotation = players.filter((p) => p.fame >= 30 && p.fame < 55);
    const deepCut = players.filter((p) => p.fame < 30);
    expect(star.length).toBeGreaterThanOrEqual(20);
    expect(star.length).toBeLessThanOrEqual(140);
    expect(starter.length).toBeGreaterThanOrEqual(150);
    expect(rotation.length).toBeGreaterThanOrEqual(150);
    expect(deepCut.length).toBeGreaterThan(0);
    expect(deepCut.length / players.length).toBeLessThan(0.75);
  });

  it('ranks recognisable positions at the top of the fame list', () => {
    const top = [...players].sort((a, b) => b.fame - a.fame).slice(0, 40);
    const skill = top.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.group));
    expect(skill.length / top.length).toBeGreaterThanOrEqual(0.7);
  });
});

describe('highlights.json satisfies HighlightPlay', () => {
  it('ships enough varied plays', () => {
    expect(highlights.length).toBeGreaterThanOrEqual(1200);
    expect(highlights.length).toBeLessThanOrEqual(2500);
    expect(new Set(highlights.map((h) => h.id)).size).toBe(highlights.length);
    expect(new Set(highlights.map((h) => h.kind)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(highlights.map((h) => h.teamId)).size).toBe(32);
    expect(new Set(highlights.map((h) => h.playerId)).size).toBeGreaterThanOrEqual(400);
  });

  it('references only players and teams that exist', () => {
    for (const h of highlights) {
      expect(playerIds, h.id).toContain(h.playerId);
      expect(teamIds, h.id).toContain(h.teamId);
      expect(teamIds, h.id).toContain(h.oppTeamId);
      expect(h.oppTeamId, h.id).not.toBe(h.teamId);
      for (const other of h.otherPlayerIds) {
        expect(playerIds, h.id).toContain(other);
        expect(other, h.id).not.toBe(h.playerId);
      }
    }
  });

  it('records game context in playable ranges', () => {
    for (const h of highlights) {
      expect(h.quarter, h.id).toBeGreaterThanOrEqual(1);
      expect(h.quarter, h.id).toBeLessThanOrEqual(6);
      expect(h.clock, h.id).toMatch(/^\d{1,2}:\d{2}$/);
      expect(h.week, h.id).toBeGreaterThanOrEqual(1);
      expect(h.week, h.id).toBeLessThanOrEqual(18);
      expect(h.season, h.id).toBeGreaterThan(metaJson.season - 4);
      expect(h.season, h.id).toBeLessThanOrEqual(metaJson.season);
      expect(h.kind.length, h.id).toBeGreaterThan(0);
      expect(h.text.length, h.id).toBeGreaterThan(0);
    }
  });

  it('redacts the answer out of every play', () => {
    const byId = new Map(players.map((p) => [p.id, p]));
    const base = (last: string) => last.replace(/\s+(?:Jr\.?|Sr\.?|I{2,3}|IV|V)$/i, '').trim();
    for (const h of highlights) {
      expect(h.redacted, h.id).toContain('[?]');
      const target = byId.get(h.playerId);
      expect(target, h.id).toBeDefined();
      if (!target) continue;
      const surname = base(target.last);
      if (surname.length < 3) continue;
      // Case-sensitive: the gamebook's own "long"/"short"/"end" are lower case.
      const escaped = surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(
        new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`).test(h.redacted),
        `${h.id} leaks "${surname}": ${h.redacted}`,
      ).toBe(false);
    }
  });
});

describe('statlines.json satisfies StatLine', () => {
  it('gives famous players 3-6 readable stat pairs', () => {
    expect(statlines.length).toBeGreaterThanOrEqual(150);
    expect(new Set(statlines.map((s) => s.playerId)).size).toBe(statlines.length);
    for (const s of statlines) {
      expect(playerIds, s.playerId).toContain(s.playerId);
      expect(s.stats.length, s.playerId).toBeGreaterThanOrEqual(3);
      expect(s.stats.length, s.playerId).toBeLessThanOrEqual(6);
      expect(s.season, s.playerId).toBeGreaterThan(metaJson.season - 4);
      for (const [label, value] of s.stats) {
        expect(label.length, s.playerId).toBeGreaterThan(0);
        expect(value.length, s.playerId).toBeGreaterThan(0);
      }
    }
  });
});

describe('loader', () => {
  it('resolves every payload to the committed JSON', async () => {
    await expect(loadTeams()).resolves.toHaveLength(teams.length);
    await expect(loadPlayers()).resolves.toHaveLength(players.length);
    await expect(loadHighlights()).resolves.toHaveLength(highlights.length);
    await expect(loadStatLines()).resolves.toHaveLength(statlines.length);
    await expect(loadMeta()).resolves.toMatchObject({ season: metaJson.season });
  });

  it('memoises: repeat calls hand back the very same array', async () => {
    const [a, b] = await Promise.all([loadTeams(), loadTeams()]);
    expect(a).toBe(b);
    expect(await loadPlayers()).toBe(await loadPlayers());
  });

  it('loadDataset composes NflDataset from meta + teams + players', async () => {
    const dataset = await loadDataset();
    expect(dataset.season).toBe(metaJson.season);
    expect(dataset.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dataset.teams).toHaveLength(32);
    expect(dataset.players.length).toBe(players.length);
  });

  it('indexes teams and players by id', async () => {
    const [byTeam, byPlayer] = await Promise.all([loadTeamsById(), loadPlayersById()]);
    expect(byTeam.size).toBe(teams.length);
    expect(byPlayer.size).toBe(players.length);
    expect(byTeam.get(teams[0].id)?.abbr).toBe(teams[0].abbr);
    expect(byPlayer.get(players[0].id)?.name).toBe(players[0].name);
  });

  it('meta counts agree with the payloads', async () => {
    const meta = await loadMeta();
    expect(meta.counts).toEqual({
      teams: teams.length,
      players: players.length,
      highlights: highlights.length,
      statlines: statlines.length,
    });
    expect(meta.seasonsWalked.length).toBeGreaterThan(0);
  });
});

describe('image helpers', () => {
  it('builds the transparent-PNG headshot url', () => {
    expect(headshotUrl('3139477')).toBe(
      'https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png',
    );
  });

  it('builds both logo variants, lowercasing the abbreviation', () => {
    expect(logoUrl('KC')).toBe('https://a.espncdn.com/i/teamlogos/nfl/500/kc.png');
    expect(logoUrl('KC', 'dark')).toBe('https://a.espncdn.com/i/teamlogos/nfl/500-dark/kc.png');
  });

  it('agrees with the baked urls for players that have an NFL headshot', () => {
    for (const p of players.filter((x) => x.headshot.includes('/headshots/nfl/'))) {
      expect(headshotUrl(p.id), p.name).toBe(p.headshot);
    }
  });

  it('agrees with the baked team logos', () => {
    for (const t of teams) expect(logoUrl(t.abbr), t.abbr).toBe(t.logo);
  });
});
