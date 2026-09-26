/**
 * Web Audio playback engine for Songooner.
 *
 * - Lazy AudioContext with `unlock()` for autoplay policies (resume + silent buffer, auto-resume on focus).
 * - LRU cache of decoded previews (fetch with CORS → decodeAudioData) with in-flight dedupe.
 * - Sample-accurate clip playback: source → effect chain → clip gain (fade envelope) → master → analyser.
 * - HTMLAudioElement fallback when a preview cannot be fetched/decoded (no CORS, codec error).
 */
import type { AudioEngine, AudioStateEvent, ClipSpec } from '@/types';
import { clampOffset, detuneFor, effectivePlaybackRate, fadeFor, sourceSpanFor } from './clipMath';
import { createEffectChain, DEFAULT_MODIFIERS, reverseBuffer } from './effects';

export type AudioBackend = 'webaudio' | 'element';

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponseLike>;

export interface AudioEngineOptions {
  /** AudioContext factory (tests inject a fake). Return null when Web Audio is unavailable. */
  createContext?: () => AudioContext | null;
  /** fetch used for previews. Defaults to `globalThis.fetch`, looked up per call so test stubs work. */
  fetchFn?: FetchLike;
  /** Factory for the HTMLAudioElement used by the fallback path. */
  createElement?: () => HTMLAudioElement;
  /** Max decoded buffers kept in memory. */
  cacheSize?: number;
}

export interface PlayFullOptions {
  /** Ramp the reveal in over this many ms (a lost-round auto-play jumping in at full volume is harsh). */
  fadeInMs?: number;
}

export interface SongoonerAudioEngine extends AudioEngine {
  /**
   * Like `preload`, but REJECTS when the preview cannot be fetched/decoded — so a round can show
   * "couldn't load" before the player taps. The url is still marked for the element fallback.
   */
  preloadStrict(url: string): Promise<void>;
  playFull(url: string, offset?: number, opts?: PlayFullOptions): Promise<void>;
  /** Which path the most recent playback used. */
  getBackend(): AudioBackend;
  /** Last emitted state event (what `onState` subscribers would have seen). */
  getState(): AudioStateEvent;
  /** Shared context (created lazily; null when Web Audio is unavailable). Used by the sfx synth. */
  getContext(): AudioContext | null;
}

/**
 * Decoded buffers kept in memory — a 30 s stereo preview at 48 kHz is ~11.5 MB of float samples, so
 * this is a hard ceiling of ~46 MB; the Play screen additionally evicts everything but the current
 * and next round on every round change.
 */
export const DEFAULT_CACHE_SIZE = 4;
/**
 * Error message when playback was requested before any user gesture unlocked audio (an iOS
 * auto-reveal): scheduling a source on a suspended context would report "playing" at 0 % forever.
 */
export const AUTOPLAY_BLOCKED = 'Audio needs a tap to start';
/** Clips are scheduled this far ahead of `currentTime` so the gain automation and the source start share a render quantum. */
const SCHEDULE_LEAD = 0.015;
/** Fade applied when a clip is stopped mid-way (avoids a click). */
const STOP_FADE = 0.008;
/** After a fetch/decode failure a url stays on the element path for this long before Web Audio is retried. */
const FAILURE_TTL_MS = 60_000;
/** Shortest wall-clock clip we will schedule. */
const MIN_WALL = 0.02;
/** `AudioContext.resume()` can hang forever outside a user gesture; never wait longer than this. */
const RESUME_TIMEOUT_MS = 400;

interface Playback {
  done: boolean;
  progress: number;
  resolve: () => void;
  stopProgress: () => void;
  /** silence + release nodes / element */
  teardown: () => void;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

const noop = (): void => undefined;

function defaultCreateContext(): AudioContext | null {
  const g = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: 'interactive' });
  } catch {
    try {
      return new Ctor(); // ancient webkitAudioContext rejects options
    } catch {
      return null;
    }
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message;
  return 'unknown audio error';
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * decodeAudioData is promise-based on modern browsers but callback-only on old Safari.
 * Pass both; whichever settles first wins.
 */
function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    let settled = false;
    const ok = (buffer: AudioBuffer): void => {
      if (settled) return;
      settled = true;
      resolve(buffer);
    };
    const fail = (e: unknown): void => {
      if (settled) return;
      settled = true;
      reject(new Error(`Could not decode audio: ${errorMessage(e)}`));
    };
    try {
      const maybe: unknown = ctx.decodeAudioData(data, ok, fail);
      if (maybe && typeof (maybe as PromiseLike<AudioBuffer>).then === 'function') {
        (maybe as PromiseLike<AudioBuffer>).then(ok, fail);
      }
    } catch (e) {
      fail(e);
    }
  });
}

/** iOS needs an actual (silent) buffer started inside the gesture before it will output anything. */
function playSilentBuffer(ctx: AudioContext): void {
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* not fatal */
  }
}

function setPreservesPitch(el: HTMLAudioElement, on: boolean): void {
  const target = el as HTMLAudioElement & { webkitPreservesPitch?: boolean };
  try {
    if ('preservesPitch' in target) target.preservesPitch = on;
    if ('webkitPreservesPitch' in target) target.webkitPreservesPitch = on;
  } catch {
    /* read-only on some engines */
  }
}

class EngineImpl implements SongoonerAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private contextUnavailable = false;
  private unlocked = false;
  private unlockPromise: Promise<void> | null = null;
  private hooksInstalled = false;

  private readonly cache = new Map<string, AudioBuffer>();
  private readonly inflight = new Map<string, Promise<AudioBuffer>>();
  private readonly failedAt = new Map<string, number>();
  private readonly elementDurations = new Map<string, number>();
  private readonly cacheSize: number;

  private readonly listeners = new Set<(e: AudioStateEvent) => void>();
  private last: AudioStateEvent = { state: 'idle', progress: 0 };
  private current: Playback | null = null;
  private currentElement: HTMLAudioElement | null = null;
  /** Bumped on every play()/stop(); a play that awaited a load checks it before touching the graph. */
  private generation = 0;
  private volume = 1;
  private backend: AudioBackend = 'webaudio';

  constructor(private readonly opts: AudioEngineOptions = {}) {
    this.cacheSize = Math.max(1, Math.floor(opts.cacheSize ?? DEFAULT_CACHE_SIZE));
  }

  // ---------------------------------------------------------------- context

  getContext(): AudioContext | null {
    return this.ensureContext();
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx;
    if (this.contextUnavailable) return null;
    const ctx = (this.opts.createContext ?? defaultCreateContext)();
    if (!ctx) {
      this.contextUnavailable = true;
      return null;
    }
    const master = ctx.createGain();
    master.gain.value = this.volume * this.volume;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    // master → analyser → destination: the analyser sees exactly what the player hears (music only, sfx bypass it).
    master.connect(analyser);
    analyser.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.analyser = analyser;
    this.installResumeHooks();
    return ctx;
  }

  /** Resolves true when the context is running afterwards. A running context counts as unlocked. */
  private async tryResume(ctx: AudioContext, timeoutMs = RESUME_TIMEOUT_MS): Promise<boolean> {
    // 'interrupted' (iOS, not in the TS union) also needs a resume.
    if ((ctx.state as string) !== 'running') {
      try {
        await Promise.race([ctx.resume(), delay(timeoutMs)]);
      } catch {
        /* closed context or refused resume */
      }
    }
    const running = (ctx.state as string) === 'running';
    if (running) this.unlocked = true;
    return running;
  }

  unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve();
    if (this.unlocked && (ctx.state as string) === 'running') return Promise.resolve();
    if (this.unlockPromise) return this.unlockPromise;
    // Both calls must happen synchronously while we are still inside the user gesture.
    playSilentBuffer(ctx);
    const p = this.tryResume(ctx, 500)
      .then((running) => {
        if (running) this.unlocked = true;
      })
      .finally(() => {
        this.unlockPromise = null;
      });
    this.unlockPromise = p;
    return p;
  }

  private installResumeHooks(): void {
    if (this.hooksInstalled || typeof document === 'undefined' || typeof window === 'undefined') return;
    this.hooksInstalled = true;
    const resumeIfNeeded = (): void => {
      const ctx = this.ctx;
      if (!ctx || !this.unlocked || document.visibilityState !== 'visible') return;
      const state = ctx.state as string;
      if (state === 'suspended' || state === 'interrupted') ctx.resume().catch(noop);
    };
    document.addEventListener('visibilitychange', resumeIfNeeded);
    window.addEventListener('focus', resumeIfNeeded);
  }

  // ---------------------------------------------------------------- cache

  private touch(url: string): AudioBuffer | undefined {
    const hit = this.cache.get(url);
    if (hit) {
      // Map preserves insertion order; re-inserting moves the entry to the "most recent" end.
      this.cache.delete(url);
      this.cache.set(url, hit);
    }
    return hit;
  }

  private remember(url: string, buffer: AudioBuffer): void {
    this.cache.delete(url);
    this.cache.set(url, buffer);
    while (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
  }

  private recentlyFailed(url: string): boolean {
    const at = this.failedAt.get(url);
    if (at === undefined) return false;
    if (Date.now() - at < FAILURE_TTL_MS) return true;
    this.failedAt.delete(url);
    return false;
  }

  private loadBuffer(url: string): Promise<AudioBuffer> {
    const hit = this.touch(url);
    if (hit) return Promise.resolve(hit);
    const pending = this.inflight.get(url);
    if (pending) return pending;
    const ctx = this.ensureContext();
    if (!ctx) return Promise.reject(new Error('Web Audio is not available in this browser'));

    const task = (async (): Promise<AudioBuffer> => {
      const fetchFn: FetchLike | undefined = this.opts.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
      if (!fetchFn) throw new Error('fetch is not available');
      const res = await fetchFn(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`Preview request failed (HTTP ${res.status})`);
      const data = await res.arrayBuffer();
      const buffer = await decode(ctx, data);
      this.remember(url, buffer);
      this.failedAt.delete(url);
      return buffer;
    })();
    this.inflight.set(url, task);
    const clear = (): void => {
      this.inflight.delete(url);
    };
    void task.then(clear, clear);
    return task;
  }

  preload(url: string): Promise<void> {
    if (!url) return Promise.resolve();
    // Never rejects: a prefetch failure just marks the url so playClip goes straight to the element path.
    return this.loadBuffer(url).then(noop, () => {
      this.failedAt.set(url, Date.now());
    });
  }

  preloadStrict(url: string): Promise<void> {
    if (!url) return Promise.reject(new Error('This track has no preview'));
    return this.loadBuffer(url).then(noop, (e: unknown) => {
      this.failedAt.set(url, Date.now());
      throw e instanceof Error ? e : new Error(errorMessage(e));
    });
  }

  getDuration(url: string): number | null {
    return this.cache.get(url)?.duration ?? this.elementDurations.get(url) ?? null;
  }

  evict(keep: string[] = []): void {
    const keepSet = new Set(keep);
    for (const url of Array.from(this.cache.keys())) if (!keepSet.has(url)) this.cache.delete(url);
    for (const url of Array.from(this.failedAt.keys())) if (!keepSet.has(url)) this.failedAt.delete(url);
  }

  // ---------------------------------------------------------------- state

  onState(cb: (e: AudioStateEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  getState(): AudioStateEvent {
    return this.last;
  }

  getBackend(): AudioBackend {
    return this.backend;
  }

  isPlaying(): boolean {
    return this.current !== null && this.last.state === 'playing';
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private emit(e: AudioStateEvent): void {
    this.last = e;
    for (const cb of this.listeners) {
      try {
        cb(e);
      } catch {
        /* a broken listener must not break playback */
      }
    }
  }

  // ---------------------------------------------------------------- volume

  setVolume(v: number): void {
    const level = clamp01(v);
    this.volume = level;
    const gain = level * level; // perceptual: a slider at 50 % should sound about half as loud
    if (this.master && this.ctx) {
      const g = this.master.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(gain, t, 0.015); // short smoothing so dragging the slider doesn't zipper
    }
    if (this.currentElement) this.currentElement.volume = gain;
  }

  getVolume(): number {
    return this.volume;
  }

  // ---------------------------------------------------------------- playback

  playClip(spec: ClipSpec): Promise<void> {
    return this.play(spec, false, 0);
  }

  playFull(url: string, offset = 0, opts: PlayFullOptions = {}): Promise<void> {
    const fadeIn = Math.max(0, Number.isFinite(opts.fadeInMs) ? (opts.fadeInMs ?? 0) / 1000 : 0);
    return this.play({ url, offset, duration: Number.POSITIVE_INFINITY }, true, fadeIn);
  }

  stop(): void {
    this.generation++; // cancels a play() that is still loading
    const playback = this.current;
    if (playback) {
      this.finish(playback);
      return;
    }
    if (this.last.state === 'loading') this.emit({ state: 'stopped', progress: 0 });
  }

  /** `fadeIn` (seconds) lengthens the attack of the envelope; 0 keeps the click-free minimum. */
  private async play(spec: ClipSpec, full: boolean, fadeIn: number): Promise<void> {
    this.stop();
    const gen = ++this.generation;
    this.emit({ state: 'loading', progress: 0 });

    let buffer: AudioBuffer | null = null;
    let failure = '';
    if (this.recentlyFailed(spec.url)) {
      failure = 'Web Audio decode failed recently';
    } else {
      try {
        buffer = await this.loadBuffer(spec.url);
      } catch (e) {
        failure = errorMessage(e);
        this.failedAt.set(spec.url, Date.now());
      }
    }
    if (gen !== this.generation) return; // stop() or a newer play() won while we were loading

    const ctx = this.ensureContext();
    if (buffer && ctx && this.master) {
      const running = await this.tryResume(ctx);
      if (gen !== this.generation) return;
      if (!running && !this.unlocked) {
        // No gesture has ever unlocked this context (e.g. the auto-reveal on iOS): a scheduled source
        // would sit silently "playing" at 0 % until the next tap. Say so instead; the tap retries.
        this.emit({ state: 'error', progress: 0, error: AUTOPLAY_BLOCKED });
        throw new Error(AUTOPLAY_BLOCKED);
      }
      return this.playWebAudio(gen, ctx, this.master, buffer, spec, full, fadeIn);
    }
    return this.playElement(gen, spec, full, failure, fadeIn);
  }

  private finish(playback: Playback, progress = playback.progress): void {
    if (playback.done) return;
    playback.done = true;
    playback.stopProgress();
    playback.teardown();
    if (this.current === playback) this.current = null;
    this.emit({ state: 'stopped', progress });
    playback.resolve();
  }

  /** Emits `playing` with fresh progress every animation frame until the playback is done. */
  private startProgressLoop(playback: Playback, read: () => number): () => void {
    const hasRaf = typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function';
    let rafId = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    const tick = (): void => {
      if (!active || playback.done) return;
      playback.progress = clamp01(read());
      this.emit({ state: 'playing', progress: playback.progress });
      schedule();
    };
    const schedule = (): void => {
      if (hasRaf) rafId = requestAnimationFrame(tick);
      else timer = setTimeout(tick, 16);
    };
    schedule();
    return () => {
      active = false;
      if (hasRaf) cancelAnimationFrame(rafId);
      else if (timer) clearTimeout(timer);
    };
  }

  private playWebAudio(
    gen: number,
    ctx: AudioContext,
    master: GainNode,
    buffer: AudioBuffer,
    spec: ClipSpec,
    full: boolean,
    fadeIn: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const mods = spec.modifiers ?? DEFAULT_MODIFIERS;
      const sourceDuration = buffer.duration;
      // "full" (reveal) = the rest of the preview from the offset; otherwise the requested wall-clock length.
      const duration = full ? sourceDuration - clampOffset(spec.offset, 0, sourceDuration) : spec.duration;
      const { start, span, wall } = sourceSpanFor({
        offset: spec.offset,
        duration,
        speed: mods.speed,
        pitch: mods.pitch,
        reverse: mods.reverse,
        sourceDuration,
      });
      if (!(wall >= MIN_WALL)) {
        this.emit({ state: 'stopped', progress: 1 });
        resolve();
        return;
      }

      const src = ctx.createBufferSource();
      src.buffer = mods.reverse ? reverseBuffer(ctx, buffer) : buffer;
      // Speed goes on playbackRate and pitch on detune (cents); the node multiplies them into one
      // effective rate — the same rate sourceSpanFor() used to turn wall seconds into `span`.
      src.playbackRate.value = mods.speed;
      const detune: AudioParam | undefined = src.detune;
      if (detune) detune.value = detuneFor(mods.pitch);
      else src.playbackRate.value = effectivePlaybackRate(mods.speed, mods.pitch); // very old WebKit

      const chain = createEffectChain(ctx, mods);
      const clipGain = ctx.createGain();
      clipGain.gain.value = 0;
      src.connect(chain.input);
      chain.output.connect(clipGain);
      clipGain.connect(master);

      // Scheduling. Everything is anchored to t0, a few ms in the future, so the envelope and the
      // source start land in the same render quantum (an automation event in the past is applied
      // late → audible click). start(when, offset, duration) takes *source* seconds for offset and
      // duration, so we pass `span`; at the effective rate it lasts exactly `wall` seconds and the
      // node fires `onended` at t1. The fade-out ramp ends at the same instant.
      const t0 = ctx.currentTime + SCHEDULE_LEAD;
      const t1 = t0 + wall;
      const fade = fadeFor(wall);
      // A requested fade-in (the reveal) may be longer than the click-free minimum, never past the midpoint.
      const attack = Math.min(Math.max(fade, fadeIn), wall / 2);
      const g = clipGain.gain;
      g.setValueAtTime(0, t0);
      g.linearRampToValueAtTime(1, t0 + attack);
      g.setValueAtTime(1, t1 - fade);
      g.linearRampToValueAtTime(0, t1);
      src.start(t0, start, span);

      const playback: Playback = {
        done: false,
        progress: 0,
        resolve,
        stopProgress: noop,
        teardown: () => {
          src.onended = null;
          const t = ctx.currentTime;
          try {
            if (t < t1) {
              // Stopped early: replace the remaining envelope with a short ramp to silence, then stop.
              g.cancelScheduledValues(t);
              g.setValueAtTime(g.value, t);
              g.linearRampToValueAtTime(0, t + STOP_FADE);
              src.stop(t + STOP_FADE + 0.002);
            }
          } catch {
            /* already stopped */
          }
          setTimeout(() => {
            try {
              src.disconnect();
              chain.output.disconnect();
              clipGain.disconnect();
            } catch {
              /* already released */
            }
          }, (STOP_FADE + 0.05) * 1000);
        },
      };
      playback.stopProgress = this.startProgressLoop(playback, () => (ctx.currentTime - t0) / wall);
      src.onended = () => {
        if (this.current === playback) this.finish(playback, 1);
      };
      this.current = playback;
      this.backend = 'webaudio';
      if (gen === this.generation) this.emit({ state: 'playing', progress: 0 });
    });
  }

  /**
   * Fallback when the preview could not be fetched/decoded: a plain <audio> element (no CORS needed).
   * No effects, no reverse; speed/pitch collapse into playbackRate. Clip length is enforced with a timer.
   */
  private playElement(gen: number, spec: ClipSpec, full: boolean, reason: string, fadeIn: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let el: HTMLAudioElement;
      try {
        el = (this.opts.createElement ?? (() => new Audio()))();
      } catch (e) {
        const message = `Could not load audio: ${reason || errorMessage(e)}`;
        this.emit({ state: 'error', progress: 0, error: message });
        reject(new Error(message));
        return;
      }

      const mods = spec.modifiers ?? DEFAULT_MODIFIERS;
      const rate = effectivePlaybackRate(mods.speed, mods.pitch);
      const offset = Math.max(0, Number.isFinite(spec.offset) ? spec.offset : 0);
      const wall = full ? Number.POSITIVE_INFINITY : Math.max(MIN_WALL, spec.duration);
      let timer: ReturnType<typeof setTimeout> | null = null;
      let ramp: ReturnType<typeof setInterval> | null = null;
      let startedAt = 0;

      const playback: Playback = {
        done: false,
        progress: 0,
        resolve,
        stopProgress: noop,
        teardown: () => {
          if (timer) clearTimeout(timer);
          if (ramp) clearInterval(ramp);
          el.onended = null;
          el.onerror = null;
          el.onloadedmetadata = null;
          try {
            el.pause();
          } catch {
            /* ignore */
          }
          if (this.currentElement === el) this.currentElement = null;
        },
      };
      const fail = (message: string): void => {
        if (playback.done) return;
        playback.done = true;
        playback.stopProgress();
        playback.teardown();
        if (this.current === playback) this.current = null;
        this.emit({ state: 'error', progress: 0, error: message });
        reject(new Error(message));
      };

      el.preload = 'auto';
      el.volume = fadeIn > 0 ? 0 : this.volume * this.volume;
      setPreservesPitch(el, false); // let playbackRate shift pitch, like the Web Audio path
      try {
        el.playbackRate = rate;
      } catch {
        /* out of range on some engines */
      }
      el.onloadedmetadata = () => {
        if (Number.isFinite(el.duration) && el.duration > 0) this.elementDurations.set(spec.url, el.duration);
      };
      el.onerror = () => fail(`Could not load audio${reason ? ` (${reason})` : ''}`);
      el.onended = () => this.finish(playback, 1);
      el.src = spec.url;
      try {
        el.currentTime = offset; // queued as the initial position if metadata hasn't arrived yet
      } catch {
        /* old Safari throws before metadata; we re-seek below */
      }
      this.current = playback;
      this.currentElement = el;

      let started: Promise<void>;
      try {
        started = Promise.resolve(el.play());
      } catch (e) {
        fail(`Playback failed: ${errorMessage(e)}`);
        return;
      }
      started.then(
        () => {
          if (playback.done || gen !== this.generation) return;
          try {
            if (Math.abs(el.currentTime - offset) > 0.5) el.currentTime = offset;
          } catch {
            /* ignore */
          }
          startedAt = now();
          this.backend = 'element';
          if (fadeIn > 0) {
            // No gain automation on an element: step the volume up until the fade is over.
            ramp = setInterval(() => {
              const k = Math.min(1, (now() - startedAt) / 1000 / fadeIn);
              el.volume = this.volume * this.volume * k;
              if (k >= 1 && ramp) {
                clearInterval(ramp);
                ramp = null;
              }
            }, 32);
          }
          if (Number.isFinite(wall)) timer = setTimeout(() => this.finish(playback, 1), wall * 1000);
          playback.stopProgress = this.startProgressLoop(playback, () =>
            Number.isFinite(wall)
              ? (now() - startedAt) / 1000 / wall
              : (el.currentTime - offset) / Math.max(0.1, (Number.isFinite(el.duration) ? el.duration : 30) - offset),
          );
          this.emit({ state: 'playing', progress: 0 });
        },
        (e: unknown) => fail(`Playback blocked or failed: ${errorMessage(e)}`),
      );
    });
  }
}

export function createAudioEngine(opts?: AudioEngineOptions): SongoonerAudioEngine {
  return new EngineImpl(opts);
}

let singleton: SongoonerAudioEngine | null = null;

/** The app-wide engine. One AudioContext per page; sfx share it. */
export function getAudioEngine(): SongoonerAudioEngine {
  singleton ??= createAudioEngine();
  return singleton;
}
