/**
 * Choose which form of a spoken guess to submit.
 *
 * Transcript cleanup is lossy ("Stand By Me" → "Stand - Me"), so instead of
 * betting a try on the cleaned text alone we try every form the player could
 * have meant — cleaned, cleaned without the "by" rewrite, and the raw
 * transcript — against the round's track and submit the first one the matcher
 * accepts. Only forms of what was actually said are considered, so this never
 * invents an answer. Pure: `matchGuess` is framework-free.
 */

import type { GuessTarget, Track } from '@/types';
import { matchGuess } from '@/game/match';
import { cleanTranscriptCandidates } from './cleanup';

/** Forms of a spoken guess worth trying, most likely first, deduplicated. */
export function voiceGuessCandidates(cleaned: string, raw: string): string[] {
  const out: string[] = [];
  for (const candidate of [cleaned.trim(), ...cleanTranscriptCandidates(raw), raw.trim()]) {
    if (candidate.length > 0 && !out.includes(candidate)) out.push(candidate);
  }
  return out;
}

/**
 * The text to submit: the first candidate scored `correct`, else the first
 * scored `partial`, else the cleaned transcript (or the raw one if cleanup
 * left nothing).
 */
export function pickVoiceGuess(cleaned: string, raw: string, track: Track, target: GuessTarget): string {
  let partial: string | null = null;
  for (const candidate of voiceGuessCandidates(cleaned, raw)) {
    const { verdict } = matchGuess(candidate, track, target);
    if (verdict === 'correct') return candidate;
    if (verdict === 'partial' && partial === null) partial = candidate;
  }
  return partial ?? (cleaned.trim() || raw.trim());
}
