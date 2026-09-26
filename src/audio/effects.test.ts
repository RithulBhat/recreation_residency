import { describe, expect, it } from 'vitest';
import type { Modifiers } from '@/types';
import { BITCRUSH, createEffectChain, DEFAULT_MODIFIERS, LOFI, reverseBuffer, staircaseCurve } from './effects';
import {
  FakeAudioContext,
  FakeBiquadFilterNode,
  FakeGainNode,
  FakeWaveShaperNode,
  type FakeAudioNode,
} from './testUtils/fakeAudioContext';

const mods = (over: Partial<Modifiers> = {}): Modifiers => ({ ...DEFAULT_MODIFIERS, ...over });
const asFake = (node: AudioNode): FakeAudioNode => node as unknown as FakeAudioNode;

describe('createEffectChain', () => {
  it('is a single pass-through gain when nothing is enabled', () => {
    const ctx = new FakeAudioContext();
    const chain = createEffectChain(ctx.asAudioContext(), mods());
    expect(chain.input).toBe(chain.output);
    expect(asFake(chain.input)).toBeInstanceOf(FakeGainNode);
    expect((asFake(chain.input) as FakeGainNode).gain.value).toBe(1);
    expect(ctx.nodes.filter((n) => n instanceof FakeBiquadFilterNode)).toHaveLength(0);
    expect(ctx.nodes.filter((n) => n instanceof FakeWaveShaperNode)).toHaveLength(0);
  });

  it('lofi = highpass 180 → lowpass 1100 (Q 1) → makeup gain', () => {
    const ctx = new FakeAudioContext();
    const chain = createEffectChain(ctx.asAudioContext(), mods({ lofi: true }));
    expect(asFake(chain.input).pathKinds()).toEqual(['gain', 'biquad', 'biquad', 'gain']);
    const [hp, lp] = ctx.nodes.filter((n): n is FakeBiquadFilterNode => n instanceof FakeBiquadFilterNode);
    expect(hp.type).toBe('highpass');
    expect(hp.frequency.value).toBe(LOFI.highpassHz);
    expect(lp.type).toBe('lowpass');
    expect(lp.frequency.value).toBe(LOFI.lowpassHz);
    expect(lp.Q.value).toBe(LOFI.lowpassQ);
    expect((asFake(chain.output) as FakeGainNode).gain.value).toBe(LOFI.makeupGain);
    expect(asFake(chain.input).reaches(asFake(chain.output))).toBe(true);
  });

  it('bitcrush = staircase waveshaper → lowpass 4 kHz → trim below unity', () => {
    const ctx = new FakeAudioContext();
    const chain = createEffectChain(ctx.asAudioContext(), mods({ bitcrush: true }));
    expect(asFake(chain.input).pathKinds()).toEqual(['gain', 'waveshaper', 'biquad', 'gain']);
    const shaper = ctx.nodes.find((n): n is FakeWaveShaperNode => n instanceof FakeWaveShaperNode);
    expect(shaper?.curve).not.toBeNull();
    expect(new Set(Array.from(shaper?.curve ?? [])).size).toBeLessThanOrEqual(Math.pow(2, BITCRUSH.bits) + 1);
    expect(shaper?.oversample).toBe('none');
    const lp = ctx.nodes.find((n): n is FakeBiquadFilterNode => n instanceof FakeBiquadFilterNode);
    expect(lp?.type).toBe('lowpass');
    expect(lp?.frequency.value).toBe(BITCRUSH.lowpassHz);
    const trim = asFake(chain.output) as FakeGainNode;
    expect(trim.gain.value).toBe(BITCRUSH.gain);
    expect(trim.gain.value).toBeLessThan(1);
  });

  it('with both enabled the order is lofi then bitcrush', () => {
    const ctx = new FakeAudioContext();
    const chain = createEffectChain(ctx.asAudioContext(), mods({ lofi: true, bitcrush: true }));
    expect(asFake(chain.input).pathKinds()).toEqual(['gain', 'biquad', 'biquad', 'gain', 'waveshaper', 'biquad', 'gain']);
    expect(chain.input).not.toBe(chain.output);
  });

  it('speed / reverse / pitch do not add nodes (they live on the source)', () => {
    const ctx = new FakeAudioContext();
    const chain = createEffectChain(ctx.asAudioContext(), mods({ speed: 2, reverse: true, pitch: 5 }));
    expect(chain.input).toBe(chain.output);
  });
});

describe('staircaseCurve', () => {
  it('quantises to at most 2^bits + 1 levels, spans -1..1 and is monotone + symmetric', () => {
    const curve = staircaseCurve(5, 1024);
    const levels = new Set(Array.from(curve));
    expect(levels.size).toBeLessThanOrEqual(33);
    expect(levels.size).toBeGreaterThan(20);
    expect(curve[0]).toBe(-1);
    expect(curve[curve.length - 1]).toBe(1);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    for (let i = 0; i < curve.length; i++) expect(curve[i]).toBeCloseTo(-curve[curve.length - 1 - i], 6);
  });
  it('fewer bits → fewer levels', () => {
    expect(new Set(Array.from(staircaseCurve(2, 512))).size).toBeLessThan(new Set(Array.from(staircaseCurve(5, 512))).size);
  });
});

describe('reverseBuffer', () => {
  it('reverses every channel and keeps the format', () => {
    const ctx = new FakeAudioContext();
    const buf = ctx.createBuffer(2, 4, 48000);
    buf.getChannelData(0).set([1, 2, 3, 4]);
    buf.getChannelData(1).set([5, 6, 7, 8]);
    const rev = reverseBuffer(ctx.asAudioContext(), buf as unknown as AudioBuffer);
    expect(Array.from(rev.getChannelData(0))).toEqual([4, 3, 2, 1]);
    expect(Array.from(rev.getChannelData(1))).toEqual([8, 7, 6, 5]);
    expect(rev.sampleRate).toBe(48000);
    expect(rev.length).toBe(4);
    expect(rev.numberOfChannels).toBe(2);
    // original untouched
    expect(Array.from(buf.getChannelData(0))).toEqual([1, 2, 3, 4]);
  });

  it('is cached per source buffer', () => {
    const ctx = new FakeAudioContext();
    const a = ctx.createBuffer(1, 3, 48000) as unknown as AudioBuffer;
    const b = ctx.createBuffer(1, 3, 48000) as unknown as AudioBuffer;
    const ra = reverseBuffer(ctx.asAudioContext(), a);
    expect(reverseBuffer(ctx.asAudioContext(), a)).toBe(ra);
    expect(reverseBuffer(ctx.asAudioContext(), b)).not.toBe(ra);
  });
});
