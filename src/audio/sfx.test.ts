import { describe, expect, it } from 'vitest';
import type { SfxName } from '@/types';
import { createSfx, HOVER_MIN_GAP_MS } from './sfx';
import { FakeAudioContext, FakeGainNode, FakeScheduledSource } from './testUtils/fakeAudioContext';

const NAMES: SfxName[] = [
  'click',
  'hover',
  'correct',
  'partial',
  'wrong',
  'skip',
  'tick',
  'buzz',
  'fanfare',
  'reveal',
  'whoosh',
  'countdown',
  'gameover',
  'streak',
  'needle',
];

const voices = (ctx: FakeAudioContext): FakeScheduledSource[] =>
  ctx.nodes.filter((n): n is FakeScheduledSource => n instanceof FakeScheduledSource && n.startedAt !== null);

describe('sfx', () => {
  it.each(NAMES)('%s schedules voices that reach the destination and stop themselves within 2 s', (name) => {
    const ctx = new FakeAudioContext();
    const sfx = createSfx(() => ctx.asAudioContext());
    sfx.play(name);
    const started = voices(ctx);
    expect(started.length).toBeGreaterThan(0);
    let first = Number.POSITIVE_INFINITY;
    let last = 0;
    for (const v of started) {
      expect(v.reaches(ctx.destination)).toBe(true);
      const at = v.startedAt ?? Number.NaN;
      const stop = v.stoppedAt ?? Number.NaN;
      expect(stop).toBeGreaterThan(at);
      first = Math.min(first, at);
      last = Math.max(last, stop);
    }
    expect(last - first).toBeLessThan(2);
  });

  it('resumes a suspended context so the sound can be heard', () => {
    const ctx = new FakeAudioContext();
    const sfx = createSfx(() => ctx.asAudioContext());
    sfx.play('click');
    expect(ctx.resumeCalls).toBe(1);
    sfx.play('click');
    expect(ctx.resumeCalls).toBe(1); // already running
  });

  it('does nothing when disabled', () => {
    const ctx = new FakeAudioContext();
    const sfx = createSfx(() => ctx.asAudioContext());
    expect(sfx.isEnabled()).toBe(true);
    sfx.setEnabled(false);
    expect(sfx.isEnabled()).toBe(false);
    sfx.play('correct');
    expect(ctx.nodes).toHaveLength(1); // only the destination
    sfx.setEnabled(true);
    sfx.play('correct');
    expect(voices(ctx).length).toBeGreaterThan(0);
  });

  it('does nothing (and does not throw) without a context', () => {
    const sfx = createSfx(() => null);
    expect(() => sfx.play('click')).not.toThrow();
  });

  it('rate-limits hover sounds', () => {
    const ctx = new FakeAudioContext();
    let now = 1000;
    const sfx = createSfx(() => ctx.asAudioContext(), () => now);
    sfx.play('hover');
    const perHover = voices(ctx).length;
    expect(perHover).toBeGreaterThan(0);
    now += HOVER_MIN_GAP_MS - 1;
    sfx.play('hover');
    expect(voices(ctx).length).toBe(perHover);
    now += 1;
    sfx.play('hover');
    expect(voices(ctx).length).toBe(perHover * 2);
    // other sounds are never throttled
    sfx.play('click');
    sfx.play('click');
    expect(voices(ctx).length).toBeGreaterThan(perHover * 2);
  });

  it('routes through one bus with a squared volume, applied live', () => {
    const ctx = new FakeAudioContext();
    const sfx = createSfx(() => ctx.asAudioContext());
    sfx.play('click');
    sfx.play('tick');
    const buses = ctx.nodes.filter((n): n is FakeGainNode => n instanceof FakeGainNode && n.outputs.has(ctx.destination));
    expect(buses).toHaveLength(1);
    expect(buses[0].gain.value).toBeCloseTo(0.64); // default 0.8²
    sfx.setVolume(0.5);
    expect(buses[0].gain.lastArg('setTargetAtTime')).toBeCloseTo(0.25);
    sfx.setVolume(3);
    expect(buses[0].gain.lastArg('setTargetAtTime')).toBe(1);
  });
});
