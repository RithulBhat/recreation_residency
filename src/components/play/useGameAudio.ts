/**
 * Everything audible on the Play screen: preview freshness + preloading, clip playback, the full
 * reveal, volume/sfx prefs, and the sfx/confetti reactions to game events.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState, Track } from '@/types';
import type { VinylState } from '@/components/Vinyl';
import { getAudioEngine, getSfx, useAudioEngine } from '@/audio';
import { currentClipLength, currentRound } from '@/game/selectors';
import { isPreviewFresh, refreshPreview } from '@/lib/deezer';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { fireConfetti } from '@/hooks/useConfetti';
import { useGameEvents, type GameEvent } from './gameEvents';

export interface GameAudio {
  vinylState: VinylState;
  /** 0..1 through the current clip / reveal */
  progress: number;
  analyser: AnalyserNode | null;
  /** The round's preview is being fetched / re-signed */
  loading: boolean;
  /** The preview could not be played, even after a refresh */
  error: string | null;
  /** Play (or replay) the current clip. Call from a click / keydown handler. */
  play: () => void;
  /** Play the full preview from the round's offset (reveal). */
  hear: () => void;
  stop: () => void;
}

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
  return e instanceof Error ? e.message : 'Could not load this preview';
}

export function useGameAudio(): GameAudio {
  const engine = getAudioEngine();
  const audio = useAudioEngine();
  const state = useGameStore((s) => s.state);
  const round = currentRound(state);
  const roundKey = `${state.id}:${round?.index ?? -1}`;
  const fresh = useRef(new Map<number, Track>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fresh preview url for a track, re-signing it when Deezer's signature is about to expire. */
  const resolve = useCallback(async (track: Track): Promise<string> => {
    const known = fresh.current.get(track.id) ?? track;
    if (known.preview && isPreviewFresh(known)) return known.preview;
    const refreshed = await refreshPreview(known);
    if (!refreshed.preview) throw new Error('This track has no preview');
    fresh.current.set(track.id, refreshed);
    return refreshed.preview;
  }, []);

  // Preload the current round's preview (and the next one in the queue) whenever a round opens.
  useEffect(() => {
    const s = useGameStore.getState().state;
    const r = currentRound(s);
    if (!r || s.status === 'idle' || s.status === 'finished') return;
    let alive = true;
    engine.stop();
    setError(null);
    setLoading(true);
    resolve(r.track)
      .then((url) => engine.preload(url))
      .then(() => {
        if (alive) setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoading(false);
        setError(message(e));
      });
    const upcoming = s.queue[0];
    if (upcoming) void resolve(upcoming).then((url) => engine.preload(url)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [roundKey, engine, resolve]);

  // Playback errors from the engine (element fallback refused, decode failure, …).
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
    if (engine.isPlaying()) {
      engine.stop();
      return;
    }
    getSfx().play('click');
    useGameStore.getState().play();
    const spec = { offset: r.startOffset, duration: currentClipLength(s), modifiers: s.settings.modifiers };
    setError(null);
    resolve(r.track)
      .then((url) => engine.playClip({ url, ...spec }))
      .catch((e: unknown) => setError(message(e)));
  }, [engine, resolve]);

  const hear = useCallback(() => {
    const s = useGameStore.getState().state;
    const r = currentRound(s);
    if (!r) return;
    void engine.unlock();
    applyVolumePrefs();
    resolve(r.track)
      .then((url) => engine.playFull(url, r.startOffset))
      .catch((e: unknown) => setError(message(e)));
  }, [engine, resolve]);

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
          hear();
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
    play,
    hear,
    stop,
  };
}

/** True when the state is mid-game and audio controls should be live. */
export function isLiveGame(state: GameState): boolean {
  return state.status === 'playing' || state.status === 'round-over';
}
