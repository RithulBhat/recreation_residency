/**
 * Arcade — contracts shared by Price Guess and Higher or Lower.
 *
 * Both new games are driven by the same shape of content: a named thing with one numeric
 * value you either guess (Price Guess) or compare (Higher or Lower). Keeping one schema means
 * a pack written for one game can be played in the other — the crossover packs the build
 * prompt asks for are then free rather than a porting job.
 *
 * ## Provenance is part of the schema, not a comment
 * Every value carries `source`, `asOf` and `verified`. Nothing may claim a precise real-world
 * figure without saying where it came from and when it was true. `verified: false` items are
 * legal, but a pack holding any of them is `approximate` and the UI says so — see
 * `isApproximate`. This is enforced by `validatePack`, not left to authors' discipline.
 */

/** How a value is rendered and what it means. Drives formatting, never arithmetic. */
export type UnitId =
  | 'usd'
  | 'gbp'
  | 'eur'
  | 'people'
  | 'sqkm'
  | 'year'
  | 'pounds'
  | 'inches'
  | 'rank'
  | 'count';

export interface ContentItem {
  /** Unique within a pack. Stable — it goes into share codes and daily seeds. */
  id: string;
  name: string;
  /** Runtime image URL. Must be a CORS-clean host we are allowed to use; else omit. */
  image?: string;
  /** Shown when there is no image. Always set one so a pack never renders blank. */
  emoji?: string;
  category: string;
  /** The number the games rank or guess by. Finite, and `>= 0` for every unit we ship. */
  value: number;
  unit: UnitId;
  /** URL or short citation. Required even when `verified` is false. */
  source: string;
  /** ISO `YYYY-MM-DD` the value was accurate as of. */
  asOf: string;
  /** True only when the value came from a citable dataset, not from judgement. */
  verified: boolean;
  /** One short line of context shown under the name. */
  blurb?: string;
}

export interface ContentPack {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  /** Every item in a pack shares a unit — comparing dollars to people is meaningless. */
  unit: UnitId;
  items: readonly ContentItem[];
}

/** A pack is approximate when any single value in it is unverified. */
export function isApproximate(pack: ContentPack): boolean {
  return pack.items.some((i) => !i.verified);
}

/** Every unverified value in a pack — what the report has to list for fact-checking. */
export function unverifiedItems(pack: ContentPack): readonly ContentItem[] {
  return pack.items.filter((i) => !i.verified);
}
