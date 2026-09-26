import { useEffect, useState } from 'react';
import { loadClipsById, type PlayerClip } from '@/data/nfl';

let cache: ReadonlyMap<string, PlayerClip> | undefined;

/**
 * The verified highlight clips, keyed by ESPN athlete id (215 of them, one per player).
 *
 * `loadClipsById` is itself memoised, so this only ever triggers one chunk fetch; the module-level
 * cache means a second mount has the map on its first render. Returns an empty map until it lands,
 * so a reveal never blocks on it.
 */
export function useScoutClips(): ReadonlyMap<string, PlayerClip> {
  const [clips, setClips] = useState<ReadonlyMap<string, PlayerClip>>(() => cache ?? new Map());
  useEffect(() => {
    if (cache) return;
    let alive = true;
    void loadClipsById()
      .then((map) => {
        cache = map;
        if (alive) setClips(map);
      })
      .catch(() => {
        /* no clips is a perfectly fine reveal — the ESPN link takes over */
      });
    return () => {
      alive = false;
    };
  }, []);
  return clips;
}
