import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '@/types';
import { getAudioEngine, useAudioEngine } from '@/audio';
import { isPreviewFresh, refreshPreview } from '@/lib/deezer';
import { applyVolumePrefs } from '@/components/play/useGameAudio';

export interface PreviewPlayer {
  /** Track id currently playing (or loading), else null. */
  current: number | null;
  loading: boolean;
  play: (track: Track, offset?: number) => void;
  stop: () => void;
}

/** Plays full previews on the Results screen (round list), refreshing stale urls on demand. */
export function usePreviewPlayer(): PreviewPlayer {
  const engine = getAudioEngine();
  const audio = useAudioEngine();
  const fresh = useRef(new Map<number, Track>());
  const [current, setCurrent] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (audio.state === 'stopped' || audio.state === 'error' || audio.state === 'idle') {
      setCurrent(null);
      setLoading(false);
    } else if (audio.state === 'playing') setLoading(false);
  }, [audio.state]);

  useEffect(() => () => engine.stop(), [engine]);

  const play = useCallback(
    (track: Track, offset = 0) => {
      void engine.unlock();
      applyVolumePrefs();
      setCurrent(track.id);
      setLoading(true);
      const known = fresh.current.get(track.id) ?? track;
      const ready = known.preview && isPreviewFresh(known) ? Promise.resolve(known) : refreshPreview(known);
      ready
        .then((t) => {
          fresh.current.set(track.id, t);
          return engine.playFull(t.preview, offset);
        })
        .catch(() => {
          setCurrent(null);
          setLoading(false);
        });
    },
    [engine],
  );

  const stop = useCallback(() => {
    engine.stop();
    setCurrent(null);
  }, [engine]);

  return { current, loading, play, stop };
}
