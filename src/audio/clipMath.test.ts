import { describe, expect, it } from 'vitest';
import {
  clampOffset,
  clampPitch,
  detuneFor,
  effectivePlaybackRate,
  fadeFor,
  sourceSpanFor,
  MAX_FADE,
  MIN_FADE,
} from './clipMath';

describe('clampOffset', () => {
  it('keeps an offset that fits', () => {
    expect(clampOffset(5, 2, 30)).toBe(5);
  });
  it('allows the clip to end exactly at the source end', () => {
    expect(clampOffset(28, 2, 30)).toBe(28);
  });
  it('pulls the offset back so the whole clip fits', () => {
    expect(clampOffset(29.5, 2, 30)).toBe(28);
    expect(clampOffset(100, 0.1, 30)).toBeCloseTo(29.9);
  });
  it('clamps negative offsets to 0', () => {
    expect(clampOffset(-3, 1, 30)).toBe(0);
  });
  it('returns 0 when the clip is longer than the source', () => {
    expect(clampOffset(10, 40, 30)).toBe(0);
  });
  it('returns 0 for an empty or unknown source', () => {
    expect(clampOffset(5, 1, 0)).toBe(0);
    expect(clampOffset(5, 1, Number.NaN)).toBe(0);
    expect(clampOffset(5, 1, -1)).toBe(0);
  });
  it('treats NaN offset / length as 0', () => {
    expect(clampOffset(Number.NaN, 1, 30)).toBe(0);
    expect(clampOffset(5, Number.NaN, 30)).toBe(5);
  });
});

describe('fadeFor', () => {
  it('is 3 ms for clips up to 0.25 s', () => {
    expect(fadeFor(0.1)).toBe(MIN_FADE);
    expect(fadeFor(0.25)).toBe(MIN_FADE);
  });
  it('is 12 ms for clips of 3 s and longer', () => {
    expect(fadeFor(3)).toBe(MAX_FADE);
    expect(fadeFor(10)).toBe(MAX_FADE);
    expect(fadeFor(30)).toBe(MAX_FADE);
  });
  it('grows monotonically in between', () => {
    const a = fadeFor(0.5);
    const b = fadeFor(1);
    const c = fadeFor(2);
    expect(a).toBeGreaterThan(MIN_FADE);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThan(MAX_FADE);
  });
  it('never exceeds a quarter of the clip', () => {
    expect(fadeFor(0.008)).toBe(0.002);
    expect(fadeFor(0)).toBe(0);
    expect(fadeFor(Number.NaN)).toBe(0);
  });
});

describe('detuneFor / clampPitch', () => {
  it('is 100 cents per semitone', () => {
    expect(detuneFor(7)).toBe(700);
    expect(detuneFor(-5)).toBe(-500);
    expect(detuneFor(0)).toBe(0);
  });
  it('clamps to ±12 semitones', () => {
    expect(detuneFor(24)).toBe(1200);
    expect(detuneFor(-30)).toBe(-1200);
    expect(clampPitch(Number.NaN)).toBe(0);
  });
});

describe('effectivePlaybackRate', () => {
  it('equals the speed when pitch is 0', () => {
    expect(effectivePlaybackRate(1.5)).toBe(1.5);
    expect(effectivePlaybackRate(0.5, 0)).toBe(0.5);
  });
  it('doubles for an octave up, halves for an octave down', () => {
    expect(effectivePlaybackRate(1, 12)).toBeCloseTo(2, 10);
    expect(effectivePlaybackRate(1, -12)).toBeCloseTo(0.5, 10);
  });
  it('multiplies speed and pitch', () => {
    expect(effectivePlaybackRate(2, -12)).toBeCloseTo(1, 10);
    expect(effectivePlaybackRate(2, 7)).toBeCloseTo(2 * Math.pow(2, 7 / 12), 10);
  });
  it('falls back to 1 for a bad speed', () => {
    expect(effectivePlaybackRate(0)).toBe(1);
    expect(effectivePlaybackRate(-2)).toBe(1);
    expect(effectivePlaybackRate(Number.NaN)).toBe(1);
  });
});

describe('sourceSpanFor', () => {
  const base = { offset: 5, duration: 0.2, speed: 1, reverse: false, sourceDuration: 30 };

  it('forward at 1x: start = offset, span = duration', () => {
    expect(sourceSpanFor(base)).toEqual({ start: 5, span: 0.2, wall: 0.2 });
  });
  it('speed 2 consumes twice the source for the same wall time', () => {
    const r = sourceSpanFor({ ...base, speed: 2 });
    expect(r.span).toBeCloseTo(0.4);
    expect(r.wall).toBeCloseTo(0.2);
    expect(r.start).toBe(5);
  });
  it('speed 0.5 consumes half', () => {
    const r = sourceSpanFor({ ...base, speed: 0.5 });
    expect(r.span).toBeCloseTo(0.1);
    expect(r.wall).toBeCloseTo(0.2);
  });
  it('pitch folds into the span exactly like detune does at playback', () => {
    const r = sourceSpanFor({ ...base, pitch: 12 });
    expect(r.span).toBeCloseTo(0.4);
    expect(r.wall).toBeCloseTo(0.2);
    const q = sourceSpanFor({ ...base, speed: 2, pitch: -12 });
    expect(q.span).toBeCloseTo(0.2);
  });
  it('reverse maps the segment into the reversed buffer', () => {
    // source [5, 7] lives at [30 - 5 - 2, 30 - 5] = [23, 25] in the mirrored buffer
    const r = sourceSpanFor({ ...base, duration: 2, reverse: true });
    expect(r.start).toBeCloseTo(23);
    expect(r.span).toBe(2);
    expect(r.wall).toBe(2);
  });
  it('reverse + speed 2', () => {
    const r = sourceSpanFor({ ...base, offset: 10, duration: 1, speed: 2, reverse: true });
    expect(r.span).toBe(2);
    expect(r.start).toBeCloseTo(18);
    expect(r.wall).toBe(1);
  });
  it('reverse of the very start plays the end of the reversed buffer', () => {
    const r = sourceSpanFor({ ...base, offset: 0, duration: 1, reverse: true });
    expect(r.start).toBeCloseTo(29);
  });
  it('clamps the offset so the span fits (forward and reverse)', () => {
    const fwd = sourceSpanFor({ ...base, offset: 29.9, duration: 1 });
    expect(fwd.start).toBeCloseTo(29);
    expect(fwd.span).toBe(1);
    const rev = sourceSpanFor({ ...base, offset: 29.9, duration: 1, reverse: true });
    expect(rev.start).toBeCloseTo(0);
    expect(rev.span).toBe(1);
  });
  it('clamps the span to the source length', () => {
    const r = sourceSpanFor({ ...base, duration: 40 });
    expect(r).toEqual({ start: 0, span: 30, wall: 30 });
  });
  it('wall is shorter than requested only when the source runs out', () => {
    const r = sourceSpanFor({ ...base, duration: 40, speed: 2 });
    expect(r.span).toBe(30);
    expect(r.wall).toBe(15);
  });
  it('handles an empty source', () => {
    expect(sourceSpanFor({ ...base, sourceDuration: 0 })).toEqual({ start: 0, span: 0, wall: 0 });
  });
});
