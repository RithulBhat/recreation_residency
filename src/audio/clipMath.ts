/**
 * Pure timing math for clip playback. No Web Audio in here — everything is unit-testable.
 *
 * Vocabulary
 * - "wall" seconds: what the player hears on the clock. Clip lengths in the game are wall seconds.
 * - "source" seconds: positions/lengths inside the decoded buffer. At playback rate `r` an
 *   AudioBufferSourceNode consumes `r` source-seconds per wall-second, and its
 *   `start(when, offset, duration)` takes *source* seconds — so a 0.2 s clip at 2x needs
 *   `duration = 0.4` to last 0.2 s on the clock.
 */

/** Fade in/out for the shortest clips (≤ 0.25 s). */
export const MIN_FADE = 0.003;
/** Fade in/out for long clips (≥ 3 s). */
export const MAX_FADE = 0.012;
const SHORT_CLIP = 0.25;
const LONG_CLIP = 3;
export const MIN_PITCH = -12;
export const MAX_PITCH = 12;

const finite = (n: number, fallback: number): number => (Number.isFinite(n) ? n : fallback);

/**
 * Clamp a start offset so that `clipLen` seconds fit inside the source.
 * Negative / NaN offsets → 0. Clips longer than the source → 0.
 */
export function clampOffset(offset: number, clipLen: number, sourceDuration: number): number {
  const total = finite(sourceDuration, 0);
  if (total <= 0) return 0;
  const len = Math.max(0, finite(clipLen, 0));
  const maxOffset = Math.max(0, total - len);
  return Math.min(Math.max(0, finite(offset, 0)), maxOffset);
}

/**
 * Fade-in / fade-out length (seconds) for a clip of `clipLen` wall seconds.
 * 3 ms for tiny clips, rising linearly to 12 ms at 3 s and beyond, but never more than a
 * quarter of the clip so the two fades cannot eat more than half of it.
 */
export function fadeFor(clipLen: number): number {
  const len = Math.max(0, finite(clipLen, 0));
  let fade: number;
  if (len <= SHORT_CLIP) fade = MIN_FADE;
  else if (len >= LONG_CLIP) fade = MAX_FADE;
  else fade = MIN_FADE + ((MAX_FADE - MIN_FADE) * (len - SHORT_CLIP)) / (LONG_CLIP - SHORT_CLIP);
  return Math.min(fade, len / 4);
}

/** Pitch modifier is -12..12 semitones. */
export function clampPitch(semitones: number): number {
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, finite(semitones, 0)));
}

/** `AudioBufferSourceNode.detune` is in cents: 100 per semitone. */
export function detuneFor(pitchSemitones: number): number {
  return clampPitch(pitchSemitones) * 100;
}

/**
 * The rate at which the source is actually consumed: speed × 2^(semitones/12).
 * (`playbackRate` and `detune` multiply together inside the node.)
 */
export function effectivePlaybackRate(speed: number, pitch = 0): number {
  const s = finite(speed, 1);
  const base = s > 0 ? s : 1;
  return base * Math.pow(2, clampPitch(pitch) / 12);
}

export interface SourceSpanInput {
  /** requested start, in source seconds (forward orientation, as stored in the round) */
  offset: number;
  /** wall-clock seconds the player should hear */
  duration: number;
  speed: number;
  /** semitones; folded into the rate exactly like the engine's detune does */
  pitch?: number;
  reverse: boolean;
  sourceDuration: number;
}

export interface SourceSpan {
  /** start position (source seconds) in the buffer that will be played — the reversed buffer when `reverse` */
  start: number;
  /** length (source seconds) to hand to `AudioBufferSourceNode.start(when, start, span)` */
  span: number;
  /** wall-clock seconds the clip will actually last (span / rate); shorter than `duration` only if the source is too short */
  wall: number;
}

/**
 * Convert a wall-clock clip request into buffer coordinates.
 * - `span = duration × rate`, clamped to the source length.
 * - Forward: `start` is the clamped offset.
 * - Reverse: the reversed buffer is the source mirrored, so source segment
 *   [offset, offset + span] lives at [sourceDuration − offset − span, sourceDuration − offset].
 */
export function sourceSpanFor(input: SourceSpanInput): SourceSpan {
  const total = Math.max(0, finite(input.sourceDuration, 0));
  const rate = effectivePlaybackRate(input.speed, input.pitch ?? 0);
  const wanted = Math.max(0, finite(input.duration, 0)) * rate;
  const span = Math.min(wanted, total);
  const forwardStart = clampOffset(input.offset, span, total);
  const start = input.reverse ? Math.max(0, total - forwardStart - span) : forwardStart;
  return { start, span, wall: span / rate };
}
