import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BroadcastCue } from '@/types';
import {
  BED_LEVEL,
  CUE_SECONDS,
  bedBuffer,
  createBroadcast,
  createBroadcastRig,
  scheduleBed,
  scheduleCue,
} from './broadcast';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeAudioNode,
  FakeAudioParam,
  FakeBiquadFilterNode,
  FakeGainNode,
  FakeScheduledSource,
} from './testUtils/fakeAudioContext';

const CUES: BroadcastCue[] = ['kickoff', 'bigCall', 'turnover', 'halftime'];

/** A context with the two optional nodes the rig uses when the browser has them. */
class FakeDelayNode extends FakeAudioNode {
  readonly delayTime = new FakeAudioParam(0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'delay');
  }
}
class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam(0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'panner');
  }
}
class WideFakeContext extends FakeAudioContext {
  createDelay(): FakeDelayNode {
    return new FakeDelayNode(this);
  }
  createStereoPanner(): FakeStereoPannerNode {
    return new FakeStereoPannerNode(this);
  }
}

/** A context a user gesture has already unlocked. */
function unlocked<T extends FakeAudioContext>(ctx: T): T {
  ctx.state = 'running';
  return ctx;
}

const started = (ctx: FakeAudioContext): FakeScheduledSource[] =>
  ctx.nodes.filter((n): n is FakeScheduledSource => n instanceof FakeScheduledSource && n.startedAt !== null);

/** The one gain feeding the destination — the master bus. */
const busOf = (ctx: FakeAudioContext): FakeGainNode => {
  const buses = ctx.nodes.filter((n): n is FakeGainNode => n instanceof FakeGainNode && n.outputs.has(ctx.destination));
  expect(buses).toHaveLength(1);
  return buses[0];
};

describe('broadcast cues', () => {
  it.each(CUES)('%s schedules voices that reach the destination and end inside its budget', (cue) => {
    const ctx = new FakeAudioContext();
    const rig = createBroadcastRig(ctx.asAudioContext());
    const end = scheduleCue(rig, cue, 0);
    expect(end).toBeCloseTo(CUE_SECONDS[cue]);

    const voices = started(ctx);
    expect(voices.length).toBeGreaterThan(3);
    let last = 0;
    for (const v of voices) {
      expect(v.reaches(ctx.destination)).toBe(true);
      const at = v.startedAt ?? Number.NaN;
      const stop = v.stoppedAt ?? Number.NaN;
      expect(stop).toBeGreaterThan(at);
      expect(at).toBeGreaterThanOrEqual(0);
      last = Math.max(last, stop);
    }
    // Every voice is released by the time the next cue could be scheduled.
    expect(last).toBeLessThanOrEqual(CUE_SECONDS[cue] + 0.1);
  });

  it('kickoff lands its cadence after the stabs, not with them', () => {
    const ctx = new FakeAudioContext();
    const rig = createBroadcastRig(ctx.asAudioContext());
    scheduleCue(rig, 'kickoff', 0);
    const onsets = [...new Set(started(ctx).map((v) => Number((v.startedAt ?? 0).toFixed(3))))].sort((a, b) => a - b);
    // two root stabs, the rising fifth, then the cadence — four distinct attacks
    expect(onsets).toEqual([0, 0.2, 0.4, 0.72, 0.76]);
    // The cadence is the longest thing in the cue: it has to ring, not click.
    const longest = Math.max(...started(ctx).map((v) => (v.stoppedAt ?? 0) - (v.startedAt ?? 0)));
    expect(longest).toBeGreaterThan(0.9);
  });

  it('builds the full stereo + tail graph when the context has the nodes for it', () => {
    const ctx = new WideFakeContext();
    const rig = createBroadcastRig(ctx.asAudioContext());
    scheduleCue(rig, 'kickoff', 0);
    const panners = ctx.nodes.filter((n): n is FakeStereoPannerNode => n instanceof FakeStereoPannerNode);
    expect(panners.map((p) => p.pan.value).sort((a, b) => a - b)).toEqual([-0.4, 0.4]);
    // A delay in a feedback loop, damped, landing on the bus.
    const delays = ctx.nodes.filter((n): n is FakeDelayNode => n instanceof FakeDelayNode);
    expect(delays).toHaveLength(1);
    expect(delays[0].delayTime.value).toBeGreaterThan(0);
    expect(delays[0].reaches(busOf(ctx))).toBe(true);
    expect(rig.left).not.toBe(rig.center);
    expect(rig.right).not.toBe(rig.center);
  });

  it('falls back to a dry mono cue where StereoPanner / Delay are missing', () => {
    const ctx = new FakeAudioContext();
    const rig = createBroadcastRig(ctx.asAudioContext());
    expect(rig.left).toBe(rig.center);
    expect(rig.right).toBe(rig.center);
    scheduleCue(rig, 'bigCall', 0);
    for (const v of started(ctx)) expect(v.reaches(ctx.destination)).toBe(true);
  });
});

describe('the bed', () => {
  it('is one seamless loop of non-silent audio, cached per context', () => {
    const ctx = new FakeAudioContext();
    const buffer = bedBuffer(ctx.asAudioContext());
    expect(bedBuffer(ctx.asAudioContext())).toBe(buffer);
    expect(buffer.duration).toBeCloseTo(4.8);
    const data = buffer.getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (const v of data) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    expect(peak).toBeCloseTo(0.8, 2); // normalized, so BED_LEVEL alone sets the level
    expect(Math.sqrt(sum / data.length)).toBeGreaterThan(0.05); // not a silent buffer
    // A seamless loop needs comparable energy at both ends of the buffer.
    const edge = (from: number): number => {
      let s = 0;
      for (let i = from; i < from + 2000; i++) s += data[i] * data[i];
      return Math.sqrt(s / 2000);
    };
    expect(edge(0)).toBeGreaterThan(0.05);
    expect(edge(data.length - 2400)).toBeGreaterThan(0.05);
  });

  it('loops through a lowpass into the bed sub-bus and fades in', () => {
    const ctx = new FakeAudioContext();
    const rig = createBroadcastRig(ctx.asAudioContext());
    const bed = scheduleBed(rig);
    // `scheduleBed` is typed against the real API, so the fake comes back behind that type.
    const source = bed.source as unknown as FakeAudioBufferSourceNode;
    expect(source.loop).toBe(true);
    expect(source.startedAt).toBe(0);
    expect(bed.filter.type).toBe('lowpass');
    expect(source.reaches(ctx.destination)).toBe(true);
    expect((rig.bed.gain as unknown as FakeAudioParam).lastArg('linearRampToValueAtTime')).toBeCloseTo(BED_LEVEL);
  });
});

describe('Broadcast', () => {
  it('schedules nothing until a user gesture has unlocked the context', () => {
    const ctx = new FakeAudioContext(); // 'suspended'
    const broadcast = createBroadcast(() => ctx.asAudioContext());
    broadcast.play('kickoff');
    expect(ctx.nodes).toHaveLength(1); // only the destination
    expect(ctx.resumeCalls).toBe(0); // and it never resumes one itself

    unlocked(ctx);
    broadcast.play('kickoff');
    expect(started(ctx).length).toBeGreaterThan(0);
  });

  it('does nothing when disabled, or without a context', () => {
    const ctx = unlocked(new FakeAudioContext());
    const broadcast = createBroadcast(() => ctx.asAudioContext());
    broadcast.setEnabled(false);
    expect(broadcast.isEnabled()).toBe(false);
    broadcast.play('bigCall');
    broadcast.startBed();
    expect(ctx.nodes).toHaveLength(1);

    const headless = createBroadcast(() => null);
    expect(() => headless.play('kickoff')).not.toThrow();
    expect(() => headless.startBed()).not.toThrow();
    expect(() => headless.stopBed()).not.toThrow();
    expect(() => headless.duck()).not.toThrow();
  });

  it('routes every cue through one bus at a squared volume, applied live', () => {
    const ctx = unlocked(new FakeAudioContext());
    const broadcast = createBroadcast(() => ctx.asAudioContext());
    broadcast.play('kickoff');
    broadcast.play('halftime');
    const bus = busOf(ctx);
    expect(bus.gain.value).toBeCloseTo(0.8 ** 2 * 0.85); // default volume, trimmed
    broadcast.setVolume(0.5);
    expect(bus.gain.lastArg('setTargetAtTime')).toBeCloseTo(0.25 * 0.85);
    broadcast.setVolume(4);
    expect(bus.gain.lastArg('setTargetAtTime')).toBeCloseTo(0.85);
    broadcast.setVolume(Number.NaN);
    expect(bus.gain.lastArg('setTargetAtTime')).toBe(0);
  });

  it('keeps the bed off until the player opts in, and stops it on demand', () => {
    const ctx = unlocked(new FakeAudioContext());
    const broadcast = createBroadcast(() => ctx.asAudioContext());
    expect(broadcast.isBedEnabled()).toBe(false);
    broadcast.startBed();
    expect(broadcast.isBedRunning()).toBe(false);
    expect(ctx.nodes).toHaveLength(1);

    broadcast.setBedEnabled(true);
    broadcast.startBed();
    expect(broadcast.isBedRunning()).toBe(true);
    const loops = started(ctx).filter((v) => 'loop' in v && v.loop === true);
    expect(loops).toHaveLength(1);
    broadcast.startBed(); // idempotent — never a second layer of pad
    expect(started(ctx).filter((v) => 'loop' in v && v.loop === true)).toHaveLength(1);

    broadcast.stopBed();
    expect(broadcast.isBedRunning()).toBe(false);
    expect(loops[0].stoppedAt).toBeGreaterThan(0);
    const filters = ctx.nodes.filter((n): n is FakeBiquadFilterNode => n instanceof FakeBiquadFilterNode);
    expect(filters.length).toBeGreaterThan(0);
    loops[0].endNow();
    expect(loops[0].outputs.size).toBe(0); // released when it ends
  });

  it('turning the score off takes the bed with it', () => {
    const ctx = unlocked(new FakeAudioContext());
    const broadcast = createBroadcast(() => ctx.asAudioContext());
    broadcast.setBedEnabled(true);
    broadcast.startBed();
    expect(broadcast.isBedRunning()).toBe(true);
    broadcast.setEnabled(false);
    expect(broadcast.isBedRunning()).toBe(false);
    broadcast.setEnabled(true);
    broadcast.setBedEnabled(true);
    broadcast.startBed();
    broadcast.setBedEnabled(false);
    expect(broadcast.isBedRunning()).toBe(false);
  });

  it('ducks the bed under a cue and brings it back', () => {
    const ctx = unlocked(new FakeAudioContext());
    const broadcast = createBroadcast(() => ctx.asAudioContext());
    broadcast.setBedEnabled(true);
    broadcast.startBed();
    const rigBed = ctx.nodes.filter((n): n is FakeGainNode => n instanceof FakeGainNode);
    const bedGain = rigBed.find((g) => g.gain.calls.some((c) => c.method === 'linearRampToValueAtTime'));
    expect(bedGain).toBeDefined();
    const before = bedGain?.gain.calls.length ?? 0;

    broadcast.play('kickoff');
    const targets = (bedGain?.gain.calls ?? []).slice(before).filter((c) => c.method === 'setTargetAtTime');
    expect(targets).toHaveLength(2);
    expect(targets[0].args[0]).toBeCloseTo(BED_LEVEL * 0.22); // down, immediately
    expect(targets[1].args[0]).toBeCloseTo(BED_LEVEL); // back up, after the cue
    expect(targets[1].args[1]).toBeGreaterThan(CUE_SECONDS.kickoff); // ...not before it ends
  });

  it('ducking is a no-op while no bed is playing', () => {
    const ctx = unlocked(new FakeAudioContext());
    const broadcast = createBroadcast(() => ctx.asAudioContext());
    broadcast.play('turnover');
    expect(broadcast.isBedRunning()).toBe(false);
    expect(() => broadcast.duck()).not.toThrow();
  });

  it('rebuilds its bus when the context is replaced', () => {
    let ctx = unlocked(new FakeAudioContext());
    const broadcast = createBroadcast(() => ctx.asAudioContext());
    broadcast.setBedEnabled(true);
    broadcast.startBed();
    broadcast.play('bigCall');
    const first = busOf(ctx);
    expect(first).toBeDefined();

    ctx = unlocked(new FakeAudioContext());
    broadcast.play('bigCall');
    expect(busOf(ctx)).not.toBe(first);
    expect(broadcast.isBedRunning()).toBe(false); // the old bed went with the old context
  });
});

/**
 * The broadcast score belongs to Highlight Scout. Nothing reaches it from Songooner — and the cheapest
 * way to keep that true is to assert WHO is allowed to mention it, so a future import into a Songooner
 * screen fails here rather than playing brass over a song guess.
 */
describe('reach', () => {
  const ALLOWED = new Set([
    'src/audio/broadcast.ts',
    'src/audio/broadcast.test.ts',
    'src/audio/index.ts',
    'src/hooks/useBroadcastScore.ts',
    'src/hooks/useBroadcastScore.test.ts',
    'src/components/scoutSetup/ScoutBroadcastSettings.tsx',
    'src/components/scoutSetup/ScoutRules.tsx',
    'src/components/scoutSetup/index.ts',
    'src/screens/scout/Play.tsx',
    'src/store/scoutStore.ts',
    'src/store/scoutStore.test.ts',
    'src/types/audio.ts',
  ]);

  function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) sources(path, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  it('is named only by Highlight Scout and the audio layer itself', () => {
    const mentions = sources('src')
      .filter((path) => /getBroadcast|useBroadcastScore|audio\/broadcast|ScoutBroadcastSettings|BroadcastCue/.test(readFileSync(path, 'utf8')))
      .filter((path) => !ALLOWED.has(path))
      .sort();
    expect(mentions).toEqual([]);
  });
});
