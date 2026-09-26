import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioStateEvent, ClipSpec } from '@/types';
import { AUTOPLAY_BLOCKED, createAudioEngine, DEFAULT_CACHE_SIZE, type FetchLike } from './engine';
import { DEFAULT_MODIFIERS } from './effects';
import {
  FakeAnalyserNode,
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeGainNode,
  type FakeAudioNode,
} from './testUtils/fakeAudioContext';

const url = (i: number): string => `https://cdnt-preview.dzcdn.net/${i}.mp3?hdnea=x`;
const okResponse = { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
const okFetch = () => vi.fn<FetchLike>(async () => okResponse);

function setup(over: { fetchFn?: FetchLike; ctx?: FakeAudioContext } = {}) {
  const ctx = over.ctx ?? new FakeAudioContext();
  const fetchFn = over.fetchFn ?? okFetch();
  const engine = createAudioEngine({ createContext: () => ctx.asAudioContext(), fetchFn });
  const events: AudioStateEvent[] = [];
  engine.onState((e) => events.push(e));
  /** distinct consecutive states, e.g. ['loading', 'playing', 'stopped'] */
  const states = (): string[] => events.map((e) => e.state).filter((s, i, arr) => i === 0 || arr[i - 1] !== s);
  return { ctx, engine, events, states, fetchFn };
}

const waitForSource = (ctx: FakeAudioContext): Promise<void> =>
  vi.waitFor(() => {
    expect(ctx.liveSources.length).toBeGreaterThan(0);
  });

/** src → chain input → … → clip gain: the gain node feeding the master. */
function clipGainOf(src: FakeAudioBufferSourceNode, master: FakeAudioNode): FakeGainNode {
  let node: FakeAudioNode = src;
  for (let i = 0; i < 16; i++) {
    const next = node.outputs.values().next().value;
    if (!next) break;
    if (next === master) return node as FakeGainNode;
    node = next;
  }
  throw new Error('clip gain not found');
}

function masterOf(ctx: FakeAudioContext): FakeGainNode {
  const master = ctx.nodes.find(
    (n): n is FakeGainNode => n instanceof FakeGainNode && Array.from(n.outputs).some((o) => o instanceof FakeAnalyserNode),
  );
  if (!master) throw new Error('master gain not found');
  return master;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('buffer cache', () => {
  it('preload fetches with CORS, decodes once and dedupes in-flight requests', async () => {
    const { engine, ctx, fetchFn } = setup();
    await Promise.all([engine.preload(url(1)), engine.preload(url(1)), engine.preload(url(1))]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(url(1), expect.objectContaining({ mode: 'cors' }));
    expect(ctx.decodeCalls).toBe(1);
    expect(engine.getDuration(url(1))).toBe(30);
    await engine.preload(url(1));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('supports callback-style decodeAudioData (old Safari)', async () => {
    const ctx = new FakeAudioContext();
    ctx.decodeStyle = 'callback';
    const { engine } = setup({ ctx });
    await engine.preload(url(1));
    expect(engine.getDuration(url(1))).toBe(30);
  });

  it(`keeps at most ${DEFAULT_CACHE_SIZE} buffers, evicting the least recently used`, async () => {
    const { engine, fetchFn } = setup();
    for (let i = 1; i <= DEFAULT_CACHE_SIZE; i++) await engine.preload(url(i));
    for (let i = 1; i <= DEFAULT_CACHE_SIZE; i++) expect(engine.getDuration(url(i))).toBe(30);
    await engine.preload(url(1)); // touch → url(1) becomes most recent
    await engine.preload(url(DEFAULT_CACHE_SIZE + 1));
    expect(engine.getDuration(url(2))).toBeNull(); // oldest untouched entry went
    expect(engine.getDuration(url(1))).toBe(30);
    expect(engine.getDuration(url(DEFAULT_CACHE_SIZE + 1))).toBe(30);
    expect(fetchFn).toHaveBeenCalledTimes(DEFAULT_CACHE_SIZE + 1);
  });

  it('evict(keep) frees everything except the listed urls', async () => {
    const { engine } = setup();
    await engine.preload(url(1));
    await engine.preload(url(2));
    await engine.preload(url(3));
    engine.evict([url(2)]);
    expect(engine.getDuration(url(1))).toBeNull();
    expect(engine.getDuration(url(2))).toBe(30);
    expect(engine.getDuration(url(3))).toBeNull();
    engine.evict();
    expect(engine.getDuration(url(2))).toBeNull();
  });

  it('preload never rejects; a failed url simply has no duration', async () => {
    const { engine } = setup({ fetchFn: vi.fn<FetchLike>(async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) })) });
    await expect(engine.preload(url(1))).resolves.toBeUndefined();
    expect(engine.getDuration(url(1))).toBeNull();
  });
});

describe('unlock', () => {
  it('creates the graph, resumes, plays a silent buffer, and is idempotent', async () => {
    const { engine, ctx } = setup();
    expect(engine.getAnalyser()).toBeNull();
    await engine.unlock();
    expect(ctx.state).toBe('running');
    expect(ctx.resumeCalls).toBe(1);
    const silent = ctx.nodes.find(
      (n): n is FakeAudioBufferSourceNode => n instanceof FakeAudioBufferSourceNode && n.buffer?.length === 1 && n.startedAt !== null,
    );
    expect(silent).toBeDefined();
    const analyser = engine.getAnalyser() as unknown as FakeAnalyserNode;
    expect(analyser.fftSize).toBe(256);
    expect(analyser.smoothingTimeConstant).toBe(0.8);
    expect(analyser.reaches(ctx.destination)).toBe(true);
    expect(masterOf(ctx).reaches(ctx.destination)).toBe(true);
    await engine.unlock();
    await engine.unlock();
    expect(ctx.resumeCalls).toBe(1);
  });

  it('resolves immediately when Web Audio is unavailable', async () => {
    const engine = createAudioEngine({ createContext: () => null });
    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(engine.getAnalyser()).toBeNull();
  });
});

describe('playClip (Web Audio path)', () => {
  const spec: ClipSpec = { url: url(1), offset: 5, duration: 0.1 };

  it('schedules a sample-accurate clip with fades and resolves on onended', async () => {
    const { engine, ctx, states } = setup();
    const done = engine.playClip(spec);
    expect(engine.getState().state).toBe('loading');
    await waitForSource(ctx);
    const [src] = ctx.liveSources;
    expect(src.startOffset).toBe(5);
    expect(src.startDuration).toBeCloseTo(0.1);
    expect(src.startedAt ?? -1).toBeGreaterThan(ctx.currentTime); // scheduled slightly ahead
    expect(src.playbackRate.value).toBe(1);
    expect(src.detune.value).toBe(0);

    const t0 = src.startedAt ?? 0;
    const g = clipGainOf(src, masterOf(ctx)).gain;
    expect(g.calls.map((c) => c.method)).toEqual([
      'setValueAtTime',
      'linearRampToValueAtTime',
      'setValueAtTime',
      'linearRampToValueAtTime',
    ]);
    expect(g.calls[0].args).toEqual([0, t0]);
    expect(g.calls[1].args[0]).toBe(1);
    expect(g.calls[1].args[1]).toBeCloseTo(t0 + 0.003, 6); // 3 ms fade for a 0.1 s clip
    expect(g.calls[2].args[1]).toBeCloseTo(t0 + 0.1 - 0.003, 6);
    expect(g.calls[3].args).toEqual([0, expect.closeTo(t0 + 0.1, 6)]);

    expect(engine.isPlaying()).toBe(true);
    expect(engine.getState().state).toBe('playing');
    src.endNow();
    await done;
    expect(engine.isPlaying()).toBe(false);
    expect(engine.getState()).toEqual({ state: 'stopped', progress: 1 });
    expect(engine.getBackend()).toBe('webaudio');
    expect(states()).toEqual(['loading', 'playing', 'stopped']);
  });

  it('stop() resolves the pending promise (never rejects) and fades the source out', async () => {
    const { engine, ctx } = setup();
    const done = engine.playClip({ ...spec, duration: 5 });
    await waitForSource(ctx);
    const [src] = ctx.liveSources;
    engine.stop();
    await expect(done).resolves.toBeUndefined();
    expect(src.stoppedAt).not.toBeNull();
    expect(engine.getState().state).toBe('stopped');
    expect(engine.isPlaying()).toBe(false);
    // a late onended from the old source is ignored
    src.endNow();
    expect(engine.getState().state).toBe('stopped');
  });

  it('a new play() supersedes the previous one', async () => {
    const { engine, ctx } = setup();
    const first = engine.playClip({ ...spec, duration: 5 });
    await waitForSource(ctx);
    const [src1] = ctx.liveSources;
    const second = engine.playClip({ ...spec, url: url(2), duration: 5 });
    await expect(first).resolves.toBeUndefined();
    await vi.waitFor(() => {
      expect(ctx.liveSources.length).toBe(2);
    });
    expect(src1.stoppedAt).not.toBeNull();
    expect(engine.isPlaying()).toBe(true);
    ctx.endAllSources();
    await second;
  });

  it('stop() while still loading cancels the play', async () => {
    let release: (() => void) | undefined;
    const fetchFn = vi.fn<FetchLike>(
      () =>
        new Promise((resolve) => {
          release = () => resolve(okResponse);
        }),
    );
    const { engine, ctx, states } = setup({ fetchFn });
    const done = engine.playClip(spec);
    await vi.waitFor(() => expect(release).toBeDefined());
    engine.stop();
    release?.();
    await expect(done).resolves.toBeUndefined();
    expect(ctx.liveSources).toHaveLength(0);
    expect(states()).toEqual(['loading', 'stopped']);
  });

  it('playFull plays the remainder of the preview from the offset with no modifiers', async () => {
    const { engine, ctx } = setup();
    const done = engine.playFull(url(1), 10);
    await waitForSource(ctx);
    const [src] = ctx.liveSources;
    expect(src.startOffset).toBe(10);
    expect(src.startDuration).toBeCloseTo(20);
    expect(src.playbackRate.value).toBe(1);
    src.endNow();
    await done;
  });

  it('reverse plays the mirrored span from a reversed copy of the buffer', async () => {
    const { engine, ctx } = setup();
    await engine.preload(url(1));
    const done = engine.playClip({ url: url(1), offset: 5, duration: 2, modifiers: { ...DEFAULT_MODIFIERS, reverse: true } });
    await waitForSource(ctx);
    const [src] = ctx.liveSources;
    expect(src.startOffset).toBeCloseTo(23);
    expect(src.startDuration).toBe(2);
    expect(src.buffer?.duration).toBe(30);
    // reversed copy, not the cached decode
    expect(ctx.nodes.length).toBeGreaterThan(0);
    src.endNow();
    await done;
  });

  it('speed 2 keeps the wall-clock length by doubling the source span', async () => {
    const { engine, ctx } = setup();
    const done = engine.playClip({ ...spec, duration: 0.2, modifiers: { ...DEFAULT_MODIFIERS, speed: 2 } });
    await waitForSource(ctx);
    const [src] = ctx.liveSources;
    expect(src.playbackRate.value).toBe(2);
    expect(src.startDuration).toBeCloseTo(0.4);
    const g = clipGainOf(src, masterOf(ctx)).gain;
    expect(g.calls[3].args[1]).toBeCloseTo((src.startedAt ?? 0) + 0.2, 6); // envelope ends after 0.2 wall seconds
    src.endNow();
    await done;
  });

  it('pitch uses detune (cents) and lengthens the span accordingly', async () => {
    const { engine, ctx } = setup();
    const done = engine.playClip({ ...spec, duration: 1, modifiers: { ...DEFAULT_MODIFIERS, pitch: 12 } });
    await waitForSource(ctx);
    const [src] = ctx.liveSources;
    expect(src.detune.value).toBe(1200);
    expect(src.playbackRate.value).toBe(1);
    expect(src.startDuration).toBeCloseTo(2);
    src.endNow();
    await done;
  });

  it('lofi + bitcrush insert the effect chain between the source and the clip gain', async () => {
    const { engine, ctx } = setup();
    const done = engine.playClip({ ...spec, modifiers: { ...DEFAULT_MODIFIERS, lofi: true, bitcrush: true } });
    await waitForSource(ctx);
    const [src] = ctx.liveSources;
    const kinds = src.pathKinds();
    expect(kinds).toContain('biquad');
    expect(kinds).toContain('waveshaper');
    expect(kinds).toContain('analyser');
    expect(kinds[kinds.length - 1]).toBe('destination');
    src.endNow();
    await done;
  });

  it('clamps an offset too close to the end', async () => {
    const { engine, ctx } = setup();
    const done = engine.playClip({ ...spec, offset: 29.95, duration: 0.1 });
    await waitForSource(ctx);
    expect(ctx.liveSources[0].startOffset).toBeCloseTo(29.9);
    ctx.endAllSources();
    await done;
  });
});

describe('volume', () => {
  it('applies a squared (perceptual) curve to the master gain and clamps to 0..1', async () => {
    const { engine, ctx } = setup();
    await engine.unlock();
    engine.setVolume(0.5);
    expect(engine.getVolume()).toBe(0.5);
    expect(masterOf(ctx).gain.lastArg('setTargetAtTime')).toBeCloseTo(0.25);
    engine.setVolume(2);
    expect(engine.getVolume()).toBe(1);
    engine.setVolume(-1);
    expect(engine.getVolume()).toBe(0);
    engine.setVolume(Number.NaN);
    expect(engine.getVolume()).toBe(0);
  });

  it('remembers the volume set before the context exists', () => {
    const { engine, ctx } = setup();
    engine.setVolume(0.3);
    engine.getContext();
    expect(masterOf(ctx).gain.value).toBeCloseTo(0.09);
  });
});

describe('element fallback', () => {
  function mockMedia(playImpl: () => Promise<void> = () => Promise.resolve()) {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(playImpl);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    return { play, pause };
  }

  it('falls back to an <audio> element when the CORS fetch fails', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);
    const { play, pause } = mockMedia();
    const ctx = new FakeAudioContext();
    const engine = createAudioEngine({ createContext: () => ctx.asAudioContext() });
    const events: AudioStateEvent[] = [];
    engine.onState((e) => events.push(e));

    await engine.playClip({ url: url(1), offset: 3, duration: 0.05, modifiers: { ...DEFAULT_MODIFIERS, speed: 2 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalled();
    expect(engine.getBackend()).toBe('element');
    const el = play.mock.contexts[0] as HTMLAudioElement;
    expect(el.src).toBe(url(1));
    expect(el.currentTime).toBe(3);
    expect(el.playbackRate).toBe(2);
    expect(ctx.liveSources).toHaveLength(0);
    expect(events.map((e) => e.state)).toContain('playing');
    expect(engine.getState()).toEqual({ state: 'stopped', progress: 1 });
    expect(engine.isPlaying()).toBe(false);
  });

  it('goes straight to the element for a url that recently failed', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);
    const { play } = mockMedia();
    const engine = createAudioEngine({ createContext: () => new FakeAudioContext().asAudioContext() });
    await engine.playClip({ url: url(1), offset: 0, duration: 0.05 });
    await engine.playClip({ url: url(1), offset: 0, duration: 0.05 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(2);
  });

  // The element backend can apply no effects, so the "recently failed" window has to be short and
  // must end the moment the network is demonstrably back — otherwise reverse/speed/pitch/lo-fi are
  // silently dropped for the whole window after a single CDN blip.
  it('retries Web Audio ~8 s after a failure, not a minute later', async () => {
    let now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let offline = true;
    const fetchFn = vi.fn<FetchLike>(async () => {
      if (offline) throw new TypeError('Failed to fetch');
      return okResponse;
    });
    mockMedia();
    const ctx = new FakeAudioContext();
    const engine = createAudioEngine({ createContext: () => ctx.asAudioContext(), fetchFn });

    await engine.playClip({ url: url(1), offset: 0, duration: 0.05 });
    expect(engine.getBackend()).toBe('element');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Inside the window the url stays on the element path (no refetch storm while the CDN is down).
    offline = false;
    now += 7_000;
    await engine.playClip({ url: url(1), offset: 0, duration: 0.05 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(engine.getBackend()).toBe('element');

    // Just past it, Web Audio (and therefore the effect chain) is tried again.
    now += 2_000;
    const done = engine.playClip({ url: url(1), offset: 0, duration: 0.05 });
    await waitForSource(ctx);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(engine.getBackend()).toBe('webaudio');
    ctx.endAllSources();
    await done;
  });

  it('any successful fetch+decode clears every failure mark, so effects come back at once', async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now); // the TTL never expires on its own here
    const offline = new Set([url(1), url(2)]);
    const fetchFn = vi.fn<FetchLike>(async (u) => {
      if (offline.has(u)) throw new TypeError('Failed to fetch');
      return okResponse;
    });
    mockMedia();
    const ctx = new FakeAudioContext();
    const engine = createAudioEngine({ createContext: () => ctx.asAudioContext(), fetchFn });

    await engine.playClip({ url: url(1), offset: 0, duration: 0.05 });
    await engine.playClip({ url: url(2), offset: 0, duration: 0.05 });
    expect(engine.getBackend()).toBe('element');

    // The CDN is back: the next round's preload succeeds, which un-marks the urls that had failed.
    offline.clear();
    await expect(engine.preloadStrict(url(3))).resolves.toBeUndefined();

    const done = engine.playClip({ url: url(1), offset: 0, duration: 0.05 });
    await waitForSource(ctx);
    expect(engine.getBackend()).toBe('webaudio');
    ctx.endAllSources();
    await done;
    // url(2) recovered with it — the mark is cleared for every url, not just the one that succeeded.
    const again = engine.playClip({ url: url(2), offset: 0, duration: 0.05 });
    await waitForSource(ctx);
    expect(engine.getBackend()).toBe('webaudio');
    ctx.endAllSources();
    await again;
  });

  it('falls back on a decode error and rejects with a clear message when the element fails too', async () => {
    const ctx = new FakeAudioContext();
    ctx.decodeError = new Error('bad mp3');
    mockMedia(() => Promise.reject(new DOMException('play() failed', 'NotAllowedError')));
    const { engine } = setup({ ctx });
    await expect(engine.playClip({ url: url(1), offset: 0, duration: 1 })).rejects.toThrow(/blocked or failed/i);
    expect(engine.getState().state).toBe('error');
    expect(engine.getState().error).toMatch(/play\(\) failed/);
    expect(engine.isPlaying()).toBe(false);
  });

  it('stop() during element playback resolves and pauses', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const { pause } = mockMedia();
    const engine = createAudioEngine({ createContext: () => new FakeAudioContext().asAudioContext() });
    const done = engine.playClip({ url: url(1), offset: 0, duration: 5 });
    await vi.waitFor(() => {
      expect(engine.getState().state).toBe('playing');
    });
    expect(engine.isPlaying()).toBe(true);
    engine.stop();
    await expect(done).resolves.toBeUndefined();
    expect(pause).toHaveBeenCalled();
    expect(engine.getState().state).toBe('stopped');
  });

  it('uses the element path when Web Audio does not exist at all', async () => {
    const { play } = mockMedia();
    const engine = createAudioEngine({ createContext: () => null });
    await engine.playClip({ url: url(1), offset: 1, duration: 0.05 });
    expect(play).toHaveBeenCalledTimes(1);
    expect(engine.getBackend()).toBe('element');
  });
});

describe('autoplay policy', () => {
  it('reports AUTOPLAY_BLOCKED instead of a silent "playing" when no gesture ever unlocked the context', async () => {
    const ctx = new FakeAudioContext();
    // resume() is a no-op outside a user gesture on iOS: the context stays suspended.
    ctx.resume = () => {
      ctx.resumeCalls++;
      return Promise.resolve();
    };
    const { engine, states } = setup({ ctx });
    await expect(engine.playFull(url(1), 0)).rejects.toThrow(AUTOPLAY_BLOCKED);
    expect(engine.getState()).toEqual({ state: 'error', progress: 0, error: AUTOPLAY_BLOCKED });
    expect(engine.isPlaying()).toBe(false);
    expect(ctx.liveSources).toHaveLength(0);
    expect(states()).toEqual(['loading', 'error']);
  });

  it('once a gesture unlocked the context, a later suspended (interrupted) context is scheduled as before', async () => {
    const ctx = new FakeAudioContext();
    const { engine } = setup({ ctx });
    await engine.unlock(); // the gesture
    ctx.state = 'suspended'; // e.g. a phone call interrupted the context; it resumes on its own later
    ctx.resume = () => Promise.resolve();
    const done = engine.playFull(url(1), 0);
    await waitForSource(ctx);
    expect(engine.getState().state).toBe('playing');
    ctx.endAllSources();
    await done;
  });

  it('a context observed running counts as unlocked even without unlock()', async () => {
    const ctx = new FakeAudioContext();
    ctx.state = 'running'; // desktop browsers create a running context once the page was interacted with
    const { engine } = setup({ ctx });
    const done = engine.playClip({ url: url(1), offset: 0, duration: 1 });
    await waitForSource(ctx);
    ctx.state = 'suspended';
    ctx.resume = () => Promise.resolve();
    ctx.endAllSources();
    await done;
    const again = engine.playClip({ url: url(1), offset: 0, duration: 1 });
    await waitForSource(ctx);
    ctx.endAllSources();
    await expect(again).resolves.toBeUndefined();
  });
});

describe('preloadStrict + reveal fade-in', () => {
  it('preloadStrict rejects on a failed fetch (preload never does) and marks the url as failed', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => {
      throw new Error('offline');
    });
    const { engine } = setup({ fetchFn });
    await expect(engine.preloadStrict(url(1))).rejects.toThrow('offline');
    await expect(engine.preload(url(1))).resolves.toBeUndefined();
    expect(engine.getDuration(url(1))).toBeNull();
    await expect(engine.preloadStrict('')).rejects.toThrow(/no preview/);
  });

  it('preloadStrict resolves once the buffer is decoded', async () => {
    const { engine, fetchFn } = setup();
    await expect(engine.preloadStrict(url(1))).resolves.toBeUndefined();
    expect(engine.getDuration(url(1))).toBe(30);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('playFull({ fadeInMs }) lengthens the attack of the envelope; clips keep the click-free minimum', async () => {
    const { engine, ctx } = setup();
    const done = engine.playFull(url(1), 10, { fadeInMs: 400 });
    await waitForSource(ctx);
    const [src] = ctx.liveSources;
    const t0 = src.startedAt ?? 0;
    const g = clipGainOf(src, masterOf(ctx)).gain;
    expect(g.calls[0].args).toEqual([0, t0]);
    expect(g.calls[1].args[0]).toBe(1);
    expect(g.calls[1].args[1]).toBeCloseTo(t0 + 0.4, 6);
    src.endNow();
    await done;

    const clip = engine.playClip({ url: url(1), offset: 0, duration: 0.1 });
    await waitForSource(ctx);
    const src2 = ctx.liveSources[ctx.liveSources.length - 1];
    const g2 = clipGainOf(src2, masterOf(ctx)).gain;
    expect(g2.calls[1].args[1]).toBeCloseTo((src2.startedAt ?? 0) + 0.003, 6);
    src2.endNow();
    await clip;
  });
});
