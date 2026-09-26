/**
 * Everything audible on the Play screen: preview freshness + preloading, clip playback, the full
 * reveal, volume/sfx prefs, and the sfx/confetti reactions to game events.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState, Track } from '@/types';
import type { VinylState } from '@/components/Vinyl';
import { getAudioEngine, getSfx, useAudioEngine } from '@/audio';
import { currentClipLength, currentRound } from '@/game/selectors';
import { isPreviewFresh } from '@/lib/deezer';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { fireConfetti } from '@/hooks/useConfetti';
import { useGameEvents, type GameEvent } from './gameEvents';
import { createTapGuard } from './tapGuard';
import { resolveTrackDetail, withTrackDetail } from './trackDetails';

export interface GameAudio {
  vinylState: VinylState;
  /** 0..1 through the current clip / reveal */
  progress: number;
  analyser: AnalyserNode | null;
  /** The round's preview is being fetched / re-signed */
  loading: boolean;
  /** The preview could not be played, even after a refresh. `play()` / `hear()` clear it and retry. */
  error: string | null;
  /**
   * The round's track with a fresh preview and its `/track` details (release year, bpm) — null until
   * the lookup answers. The same year/bpm are also written onto the store's round (`patchRoundTrack`).
   */
  resolvedTrack: Track | null;
  /** Play (or replay) the current clip. Call from a click / keydown handler. */
  play: () => void;
  /** Play the full preview from the round's offset (reveal). */
  hear: () => void;
  stop: () => void;
}

export const PREVIEW_FAILED = "Couldn't load this preview";
/** The lost-round auto-play eases in instead of jumping in at full volume. */
export const REVEAL_FADE_MS = 400;

const VOLUME_KEY = 'sg:volume';
const MUTED_KEY = 'sg:muted';

/** Effective 0..1 volume: the header control writes `sg:volume`/`sg:muted`; the settings store is the fallback. */
export function readVolumePref(): number {
  let volume = useSettingsStore.getState().volume;
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = raw === null ? Number.NaN : Number(raw);
    if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
    if (localStorage.getItem(MUTED_KEY) === '1') volume = 0;
  } catch {
    /* storage unavailable */
  }
  return volume;
}

export function applyVolumePrefs(): void {
  const v = readVolumePref();
  const engine = getAudioEngine();
  if (engine.getVolume() !== v) engine.setVolume(v);
  const sfx = getSfx();
  sfx.setVolume(v);
  sfx.setEnabled(useSettingsStore.getState().sfxEnabled && v > 0);
}

function message(e: unknown): string {
  return e instanceof Error && e.message ? e.message : PREVIEW_FAILED;
}

function isString(v: string | null): v is string {
  return typeof v === 'string';
}

/**
 * Write the looked-up metadata (year / bpm — never the preview url) onto the store's round: the
 * reducer only accepts a 'year' hint it can phrase from `round.track`, and Results / stats / share
 * read the round straight from the store. Identity of everything else is preserved, so no game
 * event is derived from this write.
 */
export function patchRoundTrack(gameId: string, roundIndex: number, detail: Track): void {
  useGameStore.setState((store) => {
    const s = store.state;
    const r = s.rounds[roundIndex];
    if (s.id !== gameId || !r || r.track.id !== detail.id) return store;
    const year = detail.releaseYear;
    const bpm = detail.bpm;
    const sameYear = year === undefined || r.track.releaseYear === year;
    const sameBpm = bpm === undefined || r.track.bpm === bpm;
    if (sameYear && sameBpm) return store;
    const rounds = s.rounds.slice();
    rounds[roundIndex] = {
      ...r,
      track: { ...r.track, ...(year !== undefined ? { releaseYear: year } : {}), ...(bpm !== undefined ? { bpm } : {}) },
    };
    return { state: { ...s, rounds } };
  });
}

export function useGameAudio(): GameAudio {
  const engine = getAudioEngine();
  const audio = useAudioEngine();
  const state = useGameStore((s) => s.state);
  const round = currentRound(state);
  const roundKey = `${state.id}:${round?.index ?? -1}`;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedTrack, setResolvedTrack] = useState<Track | null>(null);
  /** A `play()` is waiting for its preview url; a second tap meanwhile must not dispatch twice. */
  const pendingPlay = useRef(false);
  const tapGuard = useRef(createTapGuard());

  /** Fresh preview url for a track, re-signing it (and fetching its details) when needed. */
  const resolve = useCallback(async (track: Track): Promise<string> => {
    const detailed = await resolveTrackDetail(track);
    if (!detailed.preview) throw new Error('This track has no preview');
    return detailed.preview;
  }, []);

  /** True when `resolve(track)` will answer from memory (no JSONP round-trip). */
  const isResolved = useCallback((track: Track): boolean => {
    const known = withTrackDetail(track);
    return !!known.preview && isPreviewFresh(known);
  }, []);

  // Open the round: look the track up, decode its preview (strictly — a failure is shown right away,
  // not on the first tap), and prefetch the next one in the queue.
  useEffect(() => {
    const s = useGameStore.getState().state;
    const r = currentRound(s);
    if (!r || s.status === 'idle' || s.status === 'finished') return;
    let alive = true;
    engine.stop();
    setError(null);
    setLoading(true);
    setResolvedTrack(null);
    const current = resolveTrackDetail(r.track).then((track) => {
      if (alive) setResolvedTrack(track);
      patchRoundTrack(s.id, r.index, track);
      if (!track.preview) throw new Error('This track has no preview');
      return track.preview;
    });
    current
      .then((url) => engine.preloadStrict(url))
      .then(() => {
        if (alive) setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoading(false);
        setError(e instanceof Error && /no preview/.test(e.message) ? e.message : PREVIEW_FAILED);
      });
    const upcoming = s.queue[0];
    const next = upcoming ? resolveTrackDetail(upcoming).then((t) => t.preview || null) : Promise.resolve<string | null>(null);
    void next.then((url) => (url ? engine.preload(url) : undefined)).catch(() => undefined);
    // Decoded previews are ~10 MB each: keep only this round's and the next one's.
    void Promise.all([current.catch(() => null), next.catch(() => null)]).then((urls) => {
      if (alive) engine.evict(urls.filter(isString));
    });
    return () => {
      alive = false;
    };
  }, [roundKey, engine]);

  // Playback errors from the engine (element fallback refused, decode failure, autoplay blocked, …).
  useEffect(() => {
    if (audio.state === 'error' && audio.error) setError(audio.error);
  }, [audio.state, audio.error]);

  // Sfx on/off follows the settings store; stop everything when the screen goes away.
  const sfxEnabled = useSettingsStore((s) => s.sfxEnabled);
  useEffect(() => {
    applyVolumePrefs();
  }, [sfxEnabled]);
  useEffect(() => () => engine.stop(), [engine]);

  const play = useCallback(() => {
    const s = useGameStore.getState().state;
    const r = currentRound(s);
    if (!r || s.status !== 'playing' || r.status !== 'playing') return;
    void engine.unlock(); // must run synchronously inside the user gesture
    applyVolumePrefs();
    // A second tap / Space right after a play started is a bounce, not a stop (and not a second listen).
    if (tapGuard.current.isRecent()) return;
    if (engine.isPlaying()) {
      engine.stop();
      return;
    }
    if (pendingPlay.current) return;
    tapGuard.current.mark();
    getSfx().play('click');
    setError(null);
    const gameId = s.id;
    const roundIndex = r.index;
    const instant = isResolved(r.track);
    if (!instant) setLoading(true);
    pendingPlay.current = true;
    resolve(r.track).then(
      (url) => {
        pendingPlay.current = false;
        if (!instant) setLoading(false);
        // The engine's `play` (plays-this-try, time-bonus / round-timer clock) is dispatched only now,
        // once the preview is ready: a slow re-sign or a failure must not eat into the bonus window.
        const now = useGameStore.getState().state;
        const cur = currentRound(now);
        if (now.id !== gameId || !cur || cur.index !== roundIndex || now.status !== 'playing' || cur.status !== 'playing') return;
        useGameStore.getState().play();
        const spec = { offset: cur.startOffset, duration: currentClipLength(now), modifiers: now.settings.modifiers };
        engine.playClip({ url, ...spec }).catch((e: unknown) => setError(message(e)));
      },
      (e: unknown) => {
        pendingPlay.current = false;
        if (!instant) setLoading(false);
        setError(message(e));
      },
    );
  }, [engine, resolve, isResolved]);

  const hearWith = useCallback(
    (fadeInMs: number) => {
      const s = useGameStore.getState().state;
      const r = currentRound(s);
      if (!r) return;
      void engine.unlock();
      applyVolumePrefs();
      setError(null);
      resolve(r.track)
        .then((url) => engine.playFull(url, r.startOffset, { fadeInMs }))
        .catch((e: unknown) => setError(message(e)));
    },
    [engine, resolve],
  );
  const hear = useCallback(() => hearWith(0), [hearWith]);

  const stop = useCallback(() => engine.stop(), [engine]);

  // Sfx + confetti reactions.
  useGameEvents((event: GameEvent) => {
    const sfx = getSfx();
    const blitz = event.state.settings.mode === 'blitz';
    switch (event.type) {
      case 'guess': {
        const { guess, round: r } = event;
        if (guess.verdict === 'correct') {
          sfx.play('correct');
          const streak = event.state.players.find((p) => p.id === guess.playerId)?.streak ?? event.state.streak;
          fireConfetti(guess.clipLength <= 0.25 || streak >= 5 ? 'big' : 'win');
        } else if (r.status === 'playing' || blitz) {
          if (guess.verdict === 'partial') sfx.play('partial');
          else if (guess.verdict === 'wrong') sfx.play('wrong');
          else if (guess.verdict === 'skipped') sfx.play('skip');
        }
        break;
      }
      case 'roundOver':
        if (event.round.status === 'lost' && !blitz) {
          sfx.play('reveal');
          hearWith(REVEAL_FADE_MS);
        }
        break;
      case 'buzz':
        sfx.play('buzz');
        break;
      case 'streak':
        sfx.play('streak');
        break;
      case 'finished': {
        const correct = event.state.rounds.some((r) => r.status === 'won');
        sfx.play(correct ? 'fanfare' : 'gameover');
        engine.stop();
        break;
      }
      default:
        break;
    }
  });

  const vinylState: VinylState =
    loading || audio.state === 'loading'
      ? 'loading'
      : audio.state === 'playing'
        ? 'playing'
        : round && round.playsThisTry > 0 && audio.state === 'stopped'
          ? 'done'
          : 'idle';

  return {
    vinylState,
    progress: audio.progress,
    analyser: engine.getAnalyser(),
    loading,
    error,
    resolvedTrack,
    play,
    hear,
    stop,
  };
}

/** True when the state is mid-game and audio controls should be live. */
export function isLiveGame(state: GameState): boolean {
  return state.status === 'playing' || state.status === 'round-over';
}
