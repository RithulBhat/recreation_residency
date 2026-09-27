/**
 * What the residency actually holds.
 *
 * Every number here is read out of the real data files — never estimated — but it is spelled as a
 * constant rather than imported, because the hub is the front door: `packs.json` is 57 kB and
 * `players.json` is 800 kB, and neither may sit in the chunk that paints first. `counts.test.ts`
 * loads the real JSON and fails the build if any of these drifts, so the constants cannot go stale.
 */

/** `src/data/packs.json`.length */
export const SONGOONER_PACK_COUNT = 220;

/**
 * Σ `approxSize` over `src/data/packs.json`, floored to the nearest thousand so the label reads
 * "37,000+" and stays true as pack sources shift.
 */
export const SONGOONER_TRACK_FLOOR = 37000;

/** `src/data/nfl/meta.json` → `counts.players` (`players.json`.length). */
export const SCOUT_PLAYER_COUNT = 2507;

/** `src/data/nfl/meta.json` → `counts.teams`. */
export const SCOUT_TEAM_COUNT = 32;

/** `src/data/nfl/meta.json` → `counts.highlights` (real scoring plays, names redacted in play). */
export const SCOUT_PLAY_COUNT = 1700;

/**
 * `src/data/nfl/clips.json`.length — one official highlight video per player, every one
 * provenance-checked to the league or a team channel. 384 of them are additionally measured to
 * PLAY in an embed (`PlayerClip.embeddable`); the rest still open on YouTube from the reveal.
 */
export const SCOUT_CLIP_COUNT = 510;

/**
 * `SCOUT_MODES.length` — the puzzle types Highlight Scout can ask. The hub shipped "7 clue modes"
 * for a game with thirteen, because the string was written when there were seven and nothing tied
 * it to the source. `counts.test.ts` now pins it.
 */
export const SCOUT_MODE_COUNT = 13;

/** `SCOUT_FORMATS.length` — how a whole run is shaped (standard, blitz, survival, gauntlet, duel, party). */
export const SCOUT_FORMAT_COUNT = 6;

/** `sg:stats` — the key `src/store/statsStore.ts` persists under. Asserted in `useLastVisit.test.ts`. */
export const STATS_KEY = 'sg:stats';
