import { describe, expect, it } from 'vitest';
import factsJson from './facts.json';
import teamsJson from './teams.json';
import type { NflTeam } from '@/scout/types';

/**
 * Guards for the CURATED half of the team dataset.
 *
 * `facts.json` is hand-written input; `scripts/sync-nfl.mjs` merges it into `teams.json`, which is
 * what ships. Both are asserted here, so a bad fact fails the suite whether or not a sync has run.
 *
 * The rule that matters most: a team's clue ladder must never contain something the matcher would
 * ACCEPT as the answer. `NflTeam.aliases` is exactly that accepted-guess list, so a fact carrying
 * an alias verbatim ("…nicknamed the Legion of Boom") hands the player the answer on that rung.
 */

// The `as` casts mirror src/data/nfl/index.ts: TS widens imported JSON literals, and these tests
// are what prove the widened data really does satisfy the contract.
const teams = teamsJson as unknown as NflTeam[];

/** The shape of one `facts.json` entry — the curated half of `NflTeam`. */
interface CuratedTeam {
  founded: number;
  superBowls: number[];
  aliases: string[];
  rivals: string[];
  legends: string[];
  facts: string[];
}

const isCuratedTeam = (value: unknown): value is CuratedTeam =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as { facts?: unknown }).facts) &&
  Array.isArray((value as { aliases?: unknown }).aliases);

/** `facts.json` keyed by ESPN abbreviation, with the leading `_comment` string dropped. */
const curated = new Map<string, CuratedTeam>();
for (const [key, value] of Object.entries(factsJson as unknown as Record<string, unknown>)) {
  if (isCuratedTeam(value)) curated.set(key, value);
}

/** Every fact ladder must fill the longest clue ladder Highlight Scout builds. */
const MIN_FACTS = 6;

/**
 * Aliases that are ordinary English words and are never the franchise's nickname: CAR/DEN/MIN/
 * NO/TEN/WSH's short spellings ("car", "den", "min", "no", "ten", "was"). A fact reading "…in only
 * ten games" cannot give the Titans away, so these are exempt from the alias rule. Every alias a
 * player would actually type as the answer — nicknames, cities, fan names — is still forbidden.
 */
const ENGLISH_WORD_ALIASES = new Set(['car', 'den', 'min', 'no', 'ten', 'was']);

/**
 * Case- and punctuation-insensitive form, space-padded so `includes` matches whole words only:
 * "Dawg Pound." → " dawg pound ", which contains " dawg pound " but not " pound of ".
 */
const norm = (text: string): string =>
  ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Everything the matcher would accept as this team's name, normalized and de-duplicated. */
const acceptedGuesses = (team: {
  abbr: string;
  name: string;
  location: string;
  displayName: string;
  aliases: string[];
}): string[] => {
  const out = new Map<string, string>();
  for (const raw of [team.name, team.location, team.displayName, team.abbr, ...team.aliases]) {
    if (ENGLISH_WORD_ALIASES.has(raw.trim().toLowerCase())) continue;
    const key = norm(raw);
    if (key.trim().length > 0) out.set(key, raw);
  }
  return [...out.keys()];
};

const leaksIn = (team: Parameters<typeof acceptedGuesses>[0], facts: string[]): string[] => {
  const needles = acceptedGuesses(team);
  const found: string[] = [];
  for (const fact of facts) {
    const haystack = norm(fact);
    for (const needle of needles) {
      if (haystack.includes(needle)) found.push(`${team.abbr} "${needle.trim()}" → ${fact}`);
    }
  }
  return found;
};

describe('facts.json is a complete, well-formed clue ladder', () => {
  it('covers all 32 franchises in teams.json', () => {
    expect(curated.size).toBe(32);
    for (const t of teams) expect(curated.has(t.abbr), `facts.json missing ${t.abbr}`).toBe(true);
  });

  it('gives every team at least six facts', () => {
    for (const [abbr, t] of curated) {
      expect(t.facts.length, abbr).toBeGreaterThanOrEqual(MIN_FACTS);
      for (const fact of t.facts) {
        expect(fact.trim().length, abbr).toBeGreaterThan(0);
        expect(fact.trim(), abbr).toBe(fact);
      }
      expect(new Set(t.facts).size, `${abbr} repeats a fact`).toBe(t.facts.length);
    }
  });

  it('keeps every curated alias lowercase and unique', () => {
    for (const [abbr, t] of curated) {
      for (const alias of t.aliases) expect(alias, abbr).toBe(alias.toLowerCase());
      expect(new Set(t.aliases).size, abbr).toBe(t.aliases.length);
    }
  });

  it('never leaks an accepted guess into that same team’s own facts', () => {
    const leaks = [...curated.entries()].flatMap(([abbr, t]) =>
      leaksIn({ abbr, name: '', location: '', displayName: '', aliases: t.aliases }, t.facts),
    );
    expect(leaks, `facts.json leaks an accepted guess:\n${leaks.join('\n')}`).toEqual([]);
  });
});

describe('teams.json keeps the curated half intact', () => {
  it('has at least six facts per team, merged verbatim from facts.json', () => {
    for (const t of teams) {
      expect(t.facts.length, t.abbr).toBeGreaterThanOrEqual(MIN_FACTS);
      const source = curated.get(t.abbr);
      expect(source, t.abbr).toBeDefined();
      if (!source) continue;
      expect(t.facts, t.abbr).toEqual(source.facts);
      expect(t.founded, t.abbr).toBe(source.founded);
      expect(t.superBowls, t.abbr).toEqual([...source.superBowls].sort((a, b) => a - b));
      expect(t.rivals, t.abbr).toEqual(source.rivals);
      expect(t.legends, t.abbr).toEqual(source.legends);
    }
  });

  it('accepts the curated aliases plus the ESPN identity spellings', () => {
    for (const t of teams) {
      const source = curated.get(t.abbr);
      if (!source) continue;
      const expected = [
        ...new Set([
          ...source.aliases,
          t.name.toLowerCase(),
          t.location.toLowerCase(),
          t.displayName.toLowerCase(),
          t.abbr.toLowerCase(),
        ]),
      ].sort();
      expect(t.aliases, t.abbr).toEqual(expected);
    }
  });

  /**
   * The hard guard. No fact may contain its own team's name, location, abbreviation or any accepted
   * alias — case-insensitively and ignoring punctuation. Fix a failure by REWORDING THE FACT: the
   * alias is a legitimate thing a player would type and must stay in the accepted list.
   */
  it('never names its own team inside its clue ladder', () => {
    const leaks = teams.flatMap((t) => leaksIn(t, t.facts));
    expect(leaks, `a fact hands the player the answer:\n${leaks.join('\n')}`).toEqual([]);
  });
});

/**
 * The venue is a clue too — `stages.ts` pushes `clue('venue', 'Home venue', team.venue)` onto both
 * the teamTrivia and logoZoom ladders — but it comes from ESPN rather than from `facts.json`, so the
 * alias guard above never looked at it. Two answers leaked through that gap:
 *
 *   • the Rams read "Los Angeles Memorial Coliseum", which contains their own location, and
 *   • the Broncos' "Empower Field at Mile High" contains "mile high", which was in their accepted
 *     guess list — so the venue rung handed over a string the matcher scores as correct.
 *
 * Fix a failure here by rewording nothing: either the venue is stale (correct it) or the alias is
 * not really a name for the FRANCHISE (drop it, as "mile high" was dropped).
 */
describe('the venue clue never gives the franchise away', () => {
  it('contains no accepted guess for its own team', () => {
    const leaks = teams.flatMap((t) => leaksIn(t, [t.venue]));
    expect(leaks, `a venue clue hands the player the answer:\n${leaks.join('\n')}`).toEqual([]);
  });

  it('never repeats the team’s own location', () => {
    for (const t of teams) {
      expect(norm(t.venue).includes(norm(t.location)), `${t.abbr} venue names its own city`).toBe(
        false,
      );
    }
  });

  /**
   * ESPN's `franchise.venue.fullName` — what `scripts/sync-nfl.mjs` reads — is the venue the
   * franchise FIRST used in its current city, not the one it plays in now. For the two Los Angeles
   * teams that is six years out of date (verified against Wikipedia's list of current NFL stadiums
   * and confirmed still wrong in the live ESPN response), so a full `npm run nfl:sync` will put the
   * stale names back. This pin is what makes that regression loud instead of silent.
   */
  it('pins the two venues ESPN reports incorrectly', () => {
    const venueOf = (abbr: string): string | undefined => teams.find((t) => t.abbr === abbr)?.venue;
    expect(venueOf('LAR'), 'Rams: ESPN still says Los Angeles Memorial Coliseum').toBe(
      'SoFi Stadium',
    );
    expect(venueOf('LAC'), 'Chargers: ESPN still says Dignity Health Sports Park').toBe(
      'SoFi Stadium',
    );
  });

  it('gives every team a non-empty venue', () => {
    for (const t of teams) expect(t.venue.trim().length, t.abbr).toBeGreaterThan(0);
  });
});
