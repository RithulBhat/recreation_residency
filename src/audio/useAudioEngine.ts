import { useCallback, useEffect, useState } from 'react';
import type { AudioPlayState, AudioStateEvent, ClipSpec } from '@/types';
import { getAudioEngine, type AudioBackend } from './engine';

export interface UseAudioEngine {
  state: AudioPlayState;
  /** 0..1 through the current clip (updates every animation frame while playing) */
  progress: number;
  error?: string;
  isPlaying: boolean;
  backend: AudioBackend;
  play: (spec: ClipSpec) => Promise<void>;
  playFull: (url: string, offset?: number) => Promise<void>;
  stop: () => void;
  unlock: () => Promise<void>;
  volume: number;
  setVolume: (v: number) => void;
}

/** React binding for the singleton engine. Subscribes to state events for the component's lifetime. */
export function useAudioEngine(): UseAudioEngine {
  const engine = getAudioEngine();
  const [event, setEvent] = useState<AudioStateEvent>(() => engine.getState());
  const [volume, setVolumeState] = useState<number>(() => engine.getVolume());

  useEffect(() => {
    const unsubscribe = engine.onState(setEvent);
    setEvent(engine.getState()); // catch anything emitted between render and subscription
    return unsubscribe;
  }, [engine]);

  const play = useCallback((spec: ClipSpec) => engine.playClip(spec), [engine]);
  const playFull = useCallback((url: string, offset?: number) => engine.playFull(url, offset), [engine]);
  const stop = useCallback(() => engine.stop(), [engine]);
  const unlock = useCallback(() => engine.unlock(), [engine]);
  const setVolume = useCallback(
    (v: number) => {
      engine.setVolume(v);
      setVolumeState(engine.getVolume());
    },
    [engine],
  );

  return {
    state: event.state,
    progress: event.progress,
    error: event.error,
    isPlaying: event.state === 'playing',
    backend: engine.getBackend(),
    play,
    playFull,
    stop,
    unlock,
    volume,
    setVolume,
  };
}
