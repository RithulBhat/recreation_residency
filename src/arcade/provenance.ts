/**
 * Derived provenance — what a game can honestly claim about its own content.
 *
 * The hub shows each game's data source, and whether any of it is estimated rather than sourced.
 * The temptation is to write those strings by hand on the tile. That is exactly the bug that put
 * "7 clue modes" on a game with thirteen: a string that was true when it was written, with
 * nothing tying it to the thing it describes.
 *
 * So every claim here is COMPUTED from the packs themselves. A pack gaining one estimated value
 * flips `approximate` on the front door with no edit anywhere; a pack changing source updates the
 * credit line. Nothing to keep in sync, so nothing to fall out of sync.
 */

import type { ContentPack } from './types';

export interface ProvenanceSummary {
  totalItems: number;
  verifiedItems: number;
  unverifiedItems: number;
  /**
   * True when ANY single value is estimated. Deliberately not a ratio — "mostly sourced" is
   * still not sourced, and a player deciding whether to trust a number wants the honest answer.
   */
  approximate: boolean;
  /** Distinct sources, most-used first, then alphabetically for a stable order. */
  sources: readonly string[];
  /** Oldest and newest `asOf` across all values — how stale the content can be. */
  oldestAsOf: string | null;
  newestAsOf: string | null;
}

export const EMPTY_PROVENANCE: ProvenanceSummary = {
  totalItems: 0,
  verifiedItems: 0,
  unverifiedItems: 0,
  approximate: false,
  sources: [],
  oldestAsOf: null,
  newestAsOf: null,
};

/** Fold a set of packs into one honest summary. */
export function summarizeProvenance(packs: readonly ContentPack[]): ProvenanceSummary {
  const counts = new Map<string, number>();
  let total = 0;
  let unverified = 0;
  let oldest: string | null = null;
  let newest: string | null = null;

  for (const pack of packs) {
    for (const i of pack.items) {
      total++;
      if (!i.verified) unverified++;
      const source = i.source.trim();
      if (source !== '') counts.set(source, (counts.get(source) ?? 0) + 1);
      // ISO dates sort lexicographically, so no parsing is needed
      if (oldest === null || i.asOf < oldest) oldest = i.asOf;
      if (newest === null || i.asOf > newest) newest = i.asOf;
    }
  }

  const sources = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([source]) => source);

  return {
    totalItems: total,
    verifiedItems: total - unverified,
    unverifiedItems: unverified,
    approximate: unverified > 0,
    sources,
    oldestAsOf: oldest,
    newestAsOf: newest,
  };
}

/**
 * The hub's warning line, or `null` when every value is sourced.
 *
 * `noun` is what the game's values are — "Prices", "Populations". Returns `null` rather than an
 * empty string so a caller cannot accidentally render a blank warning.
 */
export function approximateNote(summary: ProvenanceSummary, noun: string): string | null {
  if (!summary.approximate) return null;
  return summary.unverifiedItems === summary.totalItems
    ? `${noun} are approximate`
    : `Some ${noun.toLowerCase()} are approximate`;
}

/**
 * The hub's credit line. Names up to two sources and counts the rest, so a game drawing on five
 * datasets does not push a paragraph onto a card.
 */
export function provenanceLine(summary: ProvenanceSummary, max = 2): string | null {
  const { sources } = summary;
  if (sources.length === 0) return null;
  if (sources.length <= max) return `Data from ${listJoin(sources)}`;
  const rest = sources.length - max;
  // comma-joined here, not "A and B and 2 others" — the double "and" reads as a mistake
  const named = sources.slice(0, max).join(', ');
  return `Data from ${named} and ${rest} other source${rest === 1 ? '' : 's'}`;
}

function listJoin(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
