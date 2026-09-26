/**
 * Catalog contracts — packs (curated song collections) and tracks.
 * Audio + metadata come from Deezer's public API (JSONP, no key) and its preview CDN.
 */

export type PackCategory =
  | 'genre'
  | 'decade'
  | 'region'
  | 'artist'
  | 'vibe'
  | 'soundtrack'
  | 'chart'
  | 'custom';

export type PackSource =
  | { kind: 'playlist'; id: number } // Deezer playlist → /playlist/{id}/tracks
  | { kind: 'chart'; genreId: number } // Deezer chart → /chart/{genreId}/tracks (0 = all)
  | { kind: 'artist'; id: number } // Deezer artist top tracks → /artist/{id}/top
  | { kind: 'album'; id: number } // Deezer album → /album/{id}/tracks
  | { kind: 'search'; q: string }; // Deezer track search → /search?q=

export interface Pack {
  /** URL-safe slug, unique. e.g. 'pop-hits' */
  id: string;
  name: string;
  emoji: string;
  /** One short line, shown on the card. */
  tagline: string;
  category: PackCategory;
  /** Free-form tags for filtering: 'pop', '2010s', 'english', 'hindi', 'party', ... */
  tags: string[];
  /** Accent hex color for gradients (e.g. '#a855f7'). */
  accent: string;
  sources: PackSource[];
  /** Verified approximate number of playable tracks (with previews). */
  approxSize?: number;
  featured?: boolean;
  /** Mostly explicit content — hidden when the explicit filter is on. */
  explicitHeavy?: boolean;
}

export interface Track {
  /** Deezer track id */
  id: number;
  /** Clean title without version suffix (Deezer title_short) */
  title: string;
  /** Full title incl. version, e.g. "Blinding Lights (Remix)" */
  titleFull: string;
  /** Primary artist name */
  artist: string;
  artistId: number;
  album: string;
  albumId: number;
  /** 250x250 cover url */
  cover: string;
  /** 500x500 cover url */
  coverBig: string;
  /** 30s MP3 preview url. Expires (~24h) — see `previewFetchedAt`. Empty string if none. */
  preview: string;
  previewFetchedAt: number;
  /** Full-track duration in seconds (not the preview) */
  duration: number;
  /** Deezer popularity rank (higher = more popular) */
  rank: number;
  explicit: boolean;
  /** Only present after a detail lookup (/track/{id}) */
  releaseYear?: number;
  bpm?: number;
  /** Pack this track was drawn from (set by the catalog resolver) */
  packId?: string;
}

/** Difficulty tiers are derived from `rank` percentile within the selected pool. */
export type Difficulty = 'any' | 'easy' | 'medium' | 'hard' | 'expert' | 'impossible';

export interface ArtistSummary {
  id: number;
  name: string;
  picture: string;
  fans: number;
}

export interface PlaylistSummary {
  id: number;
  title: string;
  picture: string;
  trackCount: number;
  author: string;
}

export interface CatalogFilter {
  packIds: string[];
  difficulty: Difficulty;
  explicitFilter: boolean;
}
