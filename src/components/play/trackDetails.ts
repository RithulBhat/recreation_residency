/**
 * Track detail cache — release year, bpm and a freshly signed preview — shared by the Play screen
 * and the Results round list. Pack payloads (playlist / chart / artist-top) carry no `release_date`;
 * only `/track/{id}` does, so every round's track is looked up once when the round opens and the
 * answer is remembered here (module-level, so it outlives the hook and the game).
 */

import type { Track } from '@/types';
import { getTrack, isPreviewFresh } from '@/lib/deezer';

const MAX_ENTRIES = 400;
const details = new Map<number, Track>();

/** Merge a `/track` answer over what we already know; the preview only when the lookup returned one. */
export function mergeTrackDetail(known: Track, detail: Track): Track {
  return {
    ...known,
    ...(detail.preview ? { preview: detail.preview, previewFetchedAt: detail.previewFetchedAt } : {}),
    ...(detail.releaseYear !== undefined ? { releaseYear: detail.releaseYear } : {}),
    ...(detail.bpm !== undefined ? { bpm: detail.bpm } : {}),
    album: known.album || detail.album,
    cover: known.cover || detail.cover,
    coverBig: known.coverBig || detail.coverBig,
  };
}

export function rememberTrackDetail(track: Track): void {
  details.delete(track.id);
  details.set(track.id, track);
  while (details.size > MAX_ENTRIES) {
    const oldest = details.keys().next();
    if (oldest.done) break;
    details.delete(oldest.value);
  }
}

/** The track with whatever detail we remember merged in (the track itself when nothing is known). */
export function withTrackDetail(track: Track): Track {
  const known = details.get(track.id);
  return known ? mergeTrackDetail(track, known) : track;
}

export function hasTrackDetail(track: Pick<Track, 'releaseYear'>): boolean {
  return track.releaseYear !== undefined;
}

/**
 * A playable, enriched version of the track: fresh preview url plus release year / bpm. At most
 * one `/track/{id}` round-trip (the Deezer client caches it); when that lookup fails but the
 * preview we hold is still usable, the round goes ahead without the extras.
 */
export async function resolveTrackDetail(track: Track): Promise<Track> {
  const known = withTrackDetail(track);
  const playable = !!known.preview && isPreviewFresh(known);
  if (playable && hasTrackDetail(known)) return known;
  try {
    const detail = await getTrack(track.id, { fresh: !playable });
    const merged = mergeTrackDetail(known, detail);
    rememberTrackDetail(merged);
    return merged;
  } catch (e) {
    if (playable) return known;
    throw e;
  }
}

/** Test seam. */
export function clearTrackDetails(): void {
  details.clear();
}
