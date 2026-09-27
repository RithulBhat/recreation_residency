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

// --- fame contract (CLAUDE.md "Difficulty", mirrored by scripts/verify-nfl.mjs) ----------------
const SKILL_GROUPS: PositionGroup[] = ['QB', 'RB', 'WR', 'TE'];
const DEFENSIVE_GROUPS: PositionGroup[] = ['DL', 'LB', 'DB'];
/** EASY difficulty must offer a famous face at every position a fan actually watches. */
const STAR_REQUIRED_GROUPS: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB'];
/** Nobody a general fan cannot name may sit in EASY — by group, or by raw ESPN position. */
const UNGUESSABLE_GROUPS: PositionGroup[] = ['OL', 'ST'];
const UNGUESSABLE_POSITIONS = new Set([
  'OL', 'OT', 'T', 'LT', 'RT', 'OG', 'G', 'LG', 'RG', 'C',
  'PK', 'K', 'P', 'LS', 'H',
]);
/** The longest game Highlight Scout offers; every tier must be able to fill one. */
const ROUNDS_PER_GAME = 20;
type FameTier = 'star' | 'starter' | 'rotation' | 'deepCut';

/** The bands CLAUDE.md documents, as closed inclusive ranges. */
const FAME_BAND_RANGE: Record<FameTier, [number, number]> = {
  star: [80, 100],
  starter: [55, 79],
  rotation: [30, 54],
  deepCut: [1, 29],
};
const tierOfFame = (fame: number): FameTier =>
  fame >= 80 ? 'star' : fame >= 55 ? 'starter' : fame >= 30 ? 'rotation' : 'deepCut';

const ranked = [...players].sort((a, b) => b.fame - a.fame || a.name.localeCompare(b.name));
const top40 = ranked.slice(0, 40);
const byTier: Record<FameTier, NflPlayer[]> = {
  star: players.filter((p) => p.fame >= 80),
  starter: players.filter((p) => p.fame >= 55 && p.fame < 80),
  rotation: players.filter((p) => p.fame >= 30 && p.fame < 55),
  deepCut: players.filter((p) => p.fame < 30),
};
const named = (name: string): NflPlayer | undefined => players.find((p) => p.name === name);

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

  // --- fame criterion 7: the bands CLAUDE.md documents, and a playable game at every difficulty --
  it('spreads fame across all four difficulty tiers', () => {
    for (const p of players) {
      expect(p.fame, p.name).toBeGreaterThanOrEqual(1);
      expect(p.fame, p.name).toBeLessThanOrEqual(100);
      // Every player lands in exactly the band CLAUDE.md documents: star >= 80, starter 55-79,
      // rotation 30-54, deepCut < 30.
      const [lo, hi] = FAME_BAND_RANGE[tierOfFame(p.fame)];
      expect(p.fame, `${p.name} -> ${tierOfFame(p.fame)}`).toBeGreaterThanOrEqual(lo);
      expect(p.fame, `${p.name} -> ${tierOfFame(p.fame)}`).toBeLessThanOrEqual(hi);
    }
    expect(byTier.star.length).toBeGreaterThanOrEqual(60);
    expect(byTier.star.length).toBeLessThanOrEqual(140);
    expect(byTier.starter.length).toBeGreaterThanOrEqual(150);
    expect(byTier.rotation.length).toBeGreaterThanOrEqual(150);
    expect(byTier.deepCut.length).toBeGreaterThan(0);
    expect(byTier.deepCut.length / players.length).toBeLessThan(0.75);
    // A 20-round game has to be playable at every difficulty the setup screen offers.
    for (const [name, rows] of Object.entries(byTier)) {
      expect(rows.length, `${name} tier`).toBeGreaterThanOrEqual(ROUNDS_PER_GAME);
    }
  });
});

/**
 * Fame is a RECOGNISABILITY score — "would a general NFL fan name this face?" — and NOT a measure of
 * statistical volume. These seven criteria are the guard rails, mirrored one-for-one by
 * `scripts/verify-nfl.mjs`, and each names the concrete failure it prevents, because two versions of
 * this field have already been rejected.
 *
 * A volume-ranked score put fifteen quarterbacks in the top twenty-five, no defender and one tight
 * end in the whole `star` tier (the game's EASY difficulty), Jared Goff above Patrick Mahomes and
 * Travis Kelce around 70th. Ranking inside each position group and mapping that onto per-group
 * ceilings then fixed the shape and broke the meaning: the leader of a thin group landed near its
 * ceiling regardless of public profile, so Dallas Goedert (zero Pro Bowls, zero All-Pros), Kevin
 * Byard, Trey McBride, James Cook III, Danielle Hunter, Derek Stingley Jr. and Keenan Allen filled
 * the top 40, while Joe Burrow sat 43rd after turf-toe surgery, Jayden Daniels 248th, Travis Hunter
 * 736th, and only eight quarterbacks reached the top 40 at all.
 *
 * If one of these goes red the score has regressed: fix `scoreFame` in `scripts/sync-nfl.mjs` and
 * regenerate (`NFL_FAME_ONLY=1 npm run nfl:sync`). Do not relax a bound — `scripts/verify-nfl.mjs`
 * asserts the same seven properties and would still catch it.
 */
describe('players.json fame ranks recognisability, not stat volume', () => {
  // Keyed by ESPN athlete id, not by name: two rostered players are called Justin Jefferson (the
  // Vikings receiver and a 2026 rookie linebacker) and only one of them is a household name.
  const byId = new Map(players.map((p) => [p.id, p]));
  const top40Ids = new Set(top40.map((p) => p.id));
  const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));
  /** Resolves a named player, or undefined once he leaves the league (verify-nfl.mjs reports it). */
  const withId = (id: string, name: string): NflPlayer | undefined => {
    const p = byId.get(id);
    if (p) expect(p.name, `id ${id}`).toBe(name);
    return p;
  };
  const where = (p: NflPlayer): string => `${p.name} — fame ${p.fame}, #${rankOf.get(p.id)}`;

  // --- criterion 1 ------------------------------------------------------------------------------
  it('puts 12 to 18 quarterbacks in the top 40', () => {
    // Quarterback is the most famous position in the sport. The first rebuild answered a
    // quarterback-heavy top 25 with per-position ceilings and over-corrected to eight.
    const qbs = top40.filter((p) => p.group === 'QB');
    expect(qbs.length, qbs.map((p) => p.name).join(', ')).toBeGreaterThanOrEqual(12);
    expect(qbs.length, qbs.map((p) => p.name).join(', ')).toBeLessThanOrEqual(18);
  });

  // --- criterion 2 ------------------------------------------------------------------------------
  it('puts at least four defenders and two tight ends in the top 40', () => {
    const defenders = top40.filter((p) => DEFENSIVE_GROUPS.includes(p.group));
    const tightEnds = top40.filter((p) => p.group === 'TE');
    expect(defenders.length, defenders.map((p) => p.name).join(', ')).toBeGreaterThanOrEqual(4);
    expect(tightEnds.length, tightEnds.map((p) => p.name).join(', ')).toBeGreaterThanOrEqual(2);
  });

  it('keeps the top 40 mostly skill players without making it offense-only', () => {
    const skill = top40.filter((p) => SKILL_GROUPS.includes(p.group));
    const share = skill.length / top40.length;
    expect(share).toBeGreaterThanOrEqual(0.55);
    expect(share).toBeLessThanOrEqual(0.9);
    expect(SKILL_GROUPS).toContain(ranked[0].group);
  });

  // --- criterion 3 ------------------------------------------------------------------------------
  it('puts every household name inside the top 40', () => {
    const required: Array<[string, string]> = [
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
    const missing = required
      .map(([id, name]) => withId(id, name))
      .filter((p): p is NflPlayer => p !== undefined && !top40Ids.has(p.id));
    expect(missing.map(where)).toEqual([]);
  });

  // --- criterion 4 ------------------------------------------------------------------------------
  it('puts draft pedigree and rookie narrative in the star tier', () => {
    // Every one of these ranked outside the top 100 under a production-driven score: an Offensive
    // Rookie of the Year who lost a season to injury, a Heisman-winning second overall pick, a
    // record-setting tight end, a number one overall pick, a franchise quarterback and a five-time
    // Pro Bowl edge rusher. All six are EASY-mode famous.
    const required: Array<[string, string]> = [
      ['4426348', 'Jayden Daniels'],
      ['4685415', 'Travis Hunter'],
      ['4432665', 'Brock Bowers'],
      ['4431611', 'Caleb Williams'],
      ['4038941', 'Justin Herbert'],
      ['3916655', 'Maxx Crosby'],
    ];
    const short = required
      .map(([id, name]) => withId(id, name))
      .filter((p): p is NflPlayer => p !== undefined && p.fame < 80);
    expect(short.map(where)).toEqual([]);
  });

  // --- criterion 5 ------------------------------------------------------------------------------
  it('keeps statistical production out of the top 40', () => {
    // Fantasy-relevant or film-room respected, not household names. A leaderboard-driven score put
    // all seven in the top 40 and made one round in five unwinnable for EASY mode's own audience.
    // They may be star-tier famous; they are not among the forty most recognisable faces alive.
    const excluded: Array<[string, string]> = [
      ['2574056', 'Kevin Byard'],
      ['3121023', 'Dallas Goedert'],
      ['4426434', 'Derek Stingley Jr.'],
      ['4379399', 'James Cook III'],
      ['2976560', 'Danielle Hunter'],
      ['4361307', 'Trey McBride'],
      ['15818', 'Keenan Allen'],
    ];
    const intruders = excluded
      .map(([id, name]) => withId(id, name))
      .filter((p): p is NflPlayer => p !== undefined && top40Ids.has(p.id));
    expect(intruders.map(where)).toEqual([]);
  });

  it('ranks sustained excellence above one loud season', () => {
    const mahomes = named('Patrick Mahomes');
    if (!mahomes) return; // He left the league; verify-nfl.mjs reports the skip loudly.
    for (const rival of ['Sam Darnold', 'Baker Mayfield', 'Jared Goff', 'Matthew Stafford']) {
      const other = named(rival);
      if (!other) continue;
      expect(mahomes.fame, `${mahomes.name} ${mahomes.fame} vs ${rival} ${other.fame}`).toBeGreaterThan(
        other.fame,
      );
    }
  });

  // --- criterion 6 ------------------------------------------------------------------------------
  it('holds 60 to 140 players in the star tier, covering every watchable position', () => {
    expect(byTier.star.length).toBeGreaterThanOrEqual(60);
    expect(byTier.star.length).toBeLessThanOrEqual(140);
    const groups = [...new Set(byTier.star.map((p) => p.group))];
    for (const g of STAR_REQUIRED_GROUPS) expect(groups, `no ${g} in the star tier`).toContain(g);
  });

  it('never puts a lineman, kicker, punter or long snapper in the star tier', () => {
    const wrong = byTier.star.filter(
      (p) => UNGUESSABLE_GROUPS.includes(p.group) || UNGUESSABLE_POSITIONS.has(p.pos.toUpperCase()),
    );
    expect(wrong.map((p) => `${p.name} (${p.pos}) ${p.fame}`)).toEqual([]);
  });

  it('gives each position group its own recognisability ceiling', () => {
    // The best quarterback in the league reads as more famous than the best guard — that gap is why
    // the score caps fame per position group and per raw ESPN position.
    const bestOf = (group: PositionGroup): number =>
      Math.max(0, ...players.filter((p) => p.group === group).map((p) => p.fame));
    expect(bestOf('QB')).toBeGreaterThan(bestOf('OL'));
    expect(bestOf('DL')).toBeGreaterThan(bestOf('OL'));
    expect(bestOf('TE')).toBeGreaterThan(bestOf('ST'));
    for (const g of STAR_REQUIRED_GROUPS) expect(bestOf(g), g).toBeGreaterThanOrEqual(80);
    for (const g of UNGUESSABLE_GROUPS) expect(bestOf(g), g).toBeLessThan(80);
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

  /**
   * Never the season being played. `meta.season` is ESPN's CURRENT season, whose numbers move every
   * Sunday: three two-game 2026 lines once shipped beside 296 finished ones under the same "Season:
   * 2026" label, the first Stat Sheet round drawn being Deshaun Watson's 443 passing yards — read as a
   * full season, and therefore unguessable. `StatLine` has no games-played field and no partial flag,
   * so the round cannot caveat itself; exclusion is the only honest option.
   */
  it('never ships a season that is still being played', () => {
    const live = statlines.filter((s) => s.season >= metaJson.season);
    expect(live.map((s) => `${s.playerId} season ${s.season}`)).toEqual([]);
  });

  /**
   * And no fragment of a finished season either. The same harm can come from a completed year, so
   * `sync-nfl.mjs` requires `general.gamesPlayed >= 8` of a 17-game season — what a player sizes the
   * production up against. Before that gate, 27 of the 2025 lines came from two to seven games:
   * Anthony Richardson's read "Pass yds 9", Drew Lock's "Pass yds 15", Zach Wilson's "Pass yds 32",
   * and Jayden Daniels (fame 92) showed 1,262 passing yards.
   *
   * `StatLine` carries no games-played field, so the gate itself cannot be re-checked here. What CAN
   * be checked is its signature on the quarterbacks, the position whose season is a single big number:
   * a fragment shows a three-figure passing total, a season does not. (No floor is asserted on the
   * other groups — a blocking tight end really can catch one ball across a full season.)
   */
  it('never ships a quarterback fragment', () => {
    const groupOf = new Map(players.map((p) => [p.id, p.group]));
    const light = statlines
      .filter((s) => groupOf.get(s.playerId) === 'QB')
      .map((s) => ({ s, yards: Number((s.stats.find(([l]) => l === 'Pass yds')?.[1] ?? '0').replace(/,/g, '')) }))
      .filter(({ yards }) => yards > 0 && yards < 150)
      .map(({ s, yards }) => `${s.playerId} season ${s.season}: ${yards} passing yards`);
    expect(light).toEqual([]);
  });

  /**
   * StatLine has to be playable at every difficulty the lobby offers a pool for. `STATLINE_TOP` slices
   * the roster by fame, and at 300 it stopped at fame 62 — inside the `starter` band — so ROTATION
   * (fame 30-54) had no Stat Sheet subject at all. `deepCut` is knowingly empty; see `sync-nfl.mjs`.
   */
  it('covers the star, starter and rotation tiers', () => {
    const fameOf = new Map(players.map((p) => [p.id, p.fame]));
    const inTier = (lo: number, hi: number): number =>
      statlines.filter((s) => {
        const fame = fameOf.get(s.playerId) ?? 0;
        return fame >= lo && fame <= hi;
      }).length;
    expect(inTier(80, 100), 'star').toBeGreaterThanOrEqual(ROUNDS_PER_GAME);
    expect(inTier(55, 79), 'starter').toBeGreaterThanOrEqual(ROUNDS_PER_GAME);
    expect(inTier(30, 54), 'rotation').toBeGreaterThanOrEqual(ROUNDS_PER_GAME);
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
