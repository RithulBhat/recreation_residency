/**
 * Hints: text for each HintKind, availability per round, and the cover-art blur amount.
 */

import type { GameSettings, HintKind, Round, Track } from '@/types';
import { normalizeLoose, normalizeTitle } from './normalize';

export const HINT_KINDS: readonly HintKind[] = ['year', 'artistInitials', 'coverPeek', 'firstLetter', 'album'];

export const HINT_LABELS: Record<HintKind, string> = {
  year: 'Release year',
  artistInitials: 'Artist initials',
  coverPeek: 'Cover peek',
  firstLetter: 'First letter',
  album: 'Album',
};

/** Max hints per round: min(3, tries − 1); 0 when hints are disabled. */
export function maxHints(settings: Pick<GameSettings, 'hintsEnabled' | 'tries'>): number {
  if (!settings.hintsEnabled) return 0;
  return Math.min(3, Math.max(0, settings.tries - 1));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .filter(Boolean)
    .map((c) => `${c}.`)
    .join(' ');
}

/** "Blinding Lights" → "B_______ ______" */
export function titleShape(title: string): string {
  const clean = normalizeTitle(title);
  const words = clean.split(' ').filter(Boolean);
  return words
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + '_'.repeat(Math.max(0, w.length - 1)) : '_'.repeat(w.length)))
    .join(' ');
}

/** Hint text for the track, or null when that hint cannot be given (missing data / would spoil). */
export function hintText(kind: HintKind, track: Track): string | null {
  switch (kind) {
    case 'year':
      return typeof track.releaseYear === 'number' && track.releaseYear > 0 ? `Released in ${track.releaseYear}` : null;
    case 'artistInitials': {
      const ini = initials(track.artist);
      return ini ? `Artist initials: ${ini}` : null;
    }
    case 'coverPeek':
      return track.cover || track.coverBig ? 'Cover peek unlocked' : null;
    case 'firstLetter': {
      const shape = titleShape(track.title || track.titleFull);
      return shape ? `Title: ${shape}` : null;
    }
    case 'album': {
      const album = track.album?.trim();
      if (!album) return null;
      const looseAlbum = normalizeLoose(album);
      const looseTitle = normalizeLoose(track.title || track.titleFull);
      // a single (album name == title) would give the answer away
      if (looseTitle.length >= 3 && looseAlbum.includes(looseTitle)) return null;
      if (looseAlbum.length >= 3 && looseTitle.includes(looseAlbum)) return null;
      return `From the album "${album}"`;
    }
    default:
      return null;
  }
}

/** Hints that can still be requested for this round (not used, available for the track, budget left). */
export function availableHints(settings: GameSettings, round: Round): HintKind[] {
  if (round.status !== 'playing') return [];
  if (round.hintsUsed.length >= maxHints(settings)) return [];
  return HINT_KINDS.filter((k) => !round.hintsUsed.includes(k) && hintText(k, round.track) !== null);
}

/**
 * Cover blur amount 0..1: 1 at try 0, reveals progressively as tries are consumed,
 * a cover-peek hint cuts it hard, 0 once the round is over.
 */
export function coverBlur(round: Round, settings: Pick<GameSettings, 'tries'>): number {
  if (round.status !== 'playing') return 0;
  const tries = Math.max(1, settings.tries);
  const progress = Math.min(1, Math.max(0, round.tryIndex) / tries);
  let blur = 1 - 0.5 * progress;
  if (round.hintsUsed.includes('coverPeek')) blur *= 0.35;
  return Math.round(Math.min(1, Math.max(0.1, blur)) * 100) / 100;
}
