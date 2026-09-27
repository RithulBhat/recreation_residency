import { describe, expect, it } from 'vitest';
import clipsJson from './clips.json';
import playersJson from './players.json';
import teamsJson from './teams.json';
import { isPlayableClip, type PlayerClip } from './index';
import type { NflPlayer, NflTeam } from '@/scout/types';

/**
 * Guards for `clips.json` — the highlight tapes shown on the reveal.
 *
 * The rule this file exists to enforce: **`embeddable` must be a measured boolean, never an
 * assumption.** The first version of this dataset marked all 215 clips embeddable because the
 * YouTube IFrame API fired `onReady` for each one. That test was invalid — `onReady` fires for a
 * domain-restricted video too, because the restriction is only enforced once playback is requested,
 * surfacing as `onError` 150. `scripts/harvest-clips.mjs` now tests it properly (ready → `mute()` →
 * `playVideo()` → poll `getPlayerState()`/`getCurrentTime()` while listening for `onError`).
 *
 * A `false` here is a legitimate, useful value: `WatchTape` renders a blocked clip as a poster plus
 * a working youtube.com link, which beats having no clip at all. So nothing asserts that every clip
 * plays — only that the field is honest, the provenance holds, and coverage has not regressed.
 */

// The `as` casts mirror src/data/nfl/index.ts: TS widens imported JSON literals, and these tests are
// what prove the widened data really does satisfy the contract.
const clips = clipsJson as unknown as PlayerClip[];
const players = playersJson as unknown as NflPlayer[];
const teams = teamsJson as unknown as NflTeam[];

const playersById = new Map(players.map((p) => [p.id, p]));

/** Fame floor for the tiers a clip is expected to exist for (`star` ≥ 80, `starter` 55–79). */
const FAME_FLOOR = 55;

/**
 * Coverage floors, set just under what the harvest actually produced so a future re-harvest that
 * loses ground fails loudly, while an improvement never has to touch this file.
 */
const FLOORS = {
  clips: 490, // measured 510
  playable: 360, // measured 384
  famousWithAny: 440, // measured 452 of 460
  famousWithPlayable: 340, // measured 362 of 460
} as const;

/**
 * The league's own channel almost never lets an embed play: 48 of the 49 "NFL"-channel clips in the
 * dataset are blocked. Exactly one — an NFL-channel Trevon Diggs clip, re-tested five times — really
 * does play, so "no NFL clip plays" would be a false assertion. The guard is the rate instead.
 */
const MAX_LEAGUE_CHANNEL_PLAYABLE_RATE = 0.1;

/**
 * The only channels a clip may come from: the league's own, plus the 32 team channels. Checked here
 * against `teams.json` rather than a hardcoded list, so a renamed franchise cannot silently open the
 * door to a fan-made reupload.
 */
const officialChannels = new Set<string>(['NFL']);
for (const team of teams) {
  officialChannels.add(team.displayName);
  // The Raiders' channel is titled just "Raiders"; `channel` records YouTube's own title verbatim.
  officialChannels.add(team.name);
}

const famous = players.filter((p) => p.fame >= FAME_FLOOR);

describe('clips.json is well-formed', () => {
  it('gives every clip the full contract', () => {
    for (const clip of clips) {
      expect(typeof clip.id, `${clip.id}: id`).toBe('string');
      expect(clip.id.length, 'id is non-empty').toBeGreaterThan(0);
      // An 11-character YouTube id, exactly. A short id is the signature of a hand-typed guess.
      expect(clip.videoId, `${clip.id}: videoId`).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(clip.title.trim(), `${clip.id}: title`).toBe(clip.title);
      expect(clip.title.length, `${clip.id}: title is non-empty`).toBeGreaterThan(0);
      expect(typeof clip.embeddable, `${clip.id}: embeddable must be a real boolean`).toBe('boolean');
    }
  });

  it('holds one clip per player and one player per video', () => {
    expect(new Set(clips.map((c) => c.id)).size, 'a player has two clips').toBe(clips.length);
    expect(new Set(clips.map((c) => c.videoId)).size, 'a video is used twice').toBe(clips.length);
  });

  it('sources every clip from the league or a team channel', () => {
    const rogue = clips.filter((c) => !officialChannels.has(c.channel));
    expect(rogue.map((c) => `${c.id} ${c.videoId} @ ${c.channel}`), 'unofficial channel').toEqual(
      [],
    );
  });

  it('points every clip at a player who exists', () => {
    const orphans = clips.filter((c) => !playersById.has(c.id));
    expect(orphans.map((c) => c.id), 'clip for an id absent from players.json').toEqual([]);
  });

  it('stays sorted by player id, so a re-harvest diffs cleanly', () => {
    const ids = clips.map((c) => Number(c.id));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

describe('embeddable records a measured truth', () => {
  /**
   * The finding that forced the re-certification. If this rate ever climbs, the playability test has
   * started passing clips it should not — which is exactly the bug the old `onReady` check had.
   */
  it('keeps the league channel’s playable rate near zero', () => {
    const league = clips.filter((c) => c.channel === 'NFL');
    expect(league.length, 'no NFL-channel clips to measure').toBeGreaterThan(0);
    const rate = league.filter((c) => c.embeddable).length / league.length;
    expect(rate, `NFL-channel playable rate ${(rate * 100).toFixed(1)}%`).toBeLessThanOrEqual(
      MAX_LEAGUE_CHANNEL_PLAYABLE_RATE,
    );
  });

  /** Playable coverage has to come from the team channels — that is the whole point of the re-harvest. */
  it('sources almost every playable clip from a team channel', () => {
    const playable = clips.filter((c) => c.embeddable);
    const fromTeams = playable.filter((c) => c.channel !== 'NFL').length;
    expect(fromTeams / playable.length).toBeGreaterThan(0.95);
  });

  it('keeps a blocked clip only as a fallback, never over a playable one', () => {
    // One clip per player is the invariant above, so this is really a restatement of intent: a
    // blocked entry means the harvest found nothing playable for that player.
    const blocked = clips.filter((c) => !c.embeddable);
    const playableIds = new Set(clips.filter((c) => c.embeddable).map((c) => c.id));
    expect(blocked.filter((c) => playableIds.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  it('narrows through isPlayableClip', () => {
    const playable = clips.find((c) => c.embeddable);
    const blocked = clips.find((c) => !c.embeddable);
    expect(isPlayableClip(playable)).toBe(true);
    expect(isPlayableClip(blocked)).toBe(false);
    expect(isPlayableClip(undefined)).toBe(false);
  });
});

describe('coverage does not regress', () => {
  it('carries clips for the players the game actually asks about', () => {
    const withAny = famous.filter((p) => clips.some((c) => c.id === p.id)).length;
    expect(clips.length, 'total clips').toBeGreaterThanOrEqual(FLOORS.clips);
    expect(withAny, `players at fame >= ${FAME_FLOOR} with any clip`).toBeGreaterThanOrEqual(
      FLOORS.famousWithAny,
    );
  });

  it('carries PLAYABLE clips for most of them', () => {
    const playable = clips.filter((c) => c.embeddable);
    const playableIds = new Set(playable.map((c) => c.id));
    const withPlayable = famous.filter((p) => playableIds.has(p.id)).length;
    expect(playable.length, 'total playable clips').toBeGreaterThanOrEqual(FLOORS.playable);
    expect(
      withPlayable,
      `players at fame >= ${FAME_FLOOR} with a playable clip`,
    ).toBeGreaterThanOrEqual(FLOORS.famousWithPlayable);
  });
});
