import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, Track } from '@/types';
import { TrackIndex } from '@/game/match';
import { searchTracks } from '@/lib/deezer';
import { trackKey } from '@/lib/catalog';

export const REMOTE_DEBOUNCE_MS = 250;
export const REMOTE_MIN_CHARS = 3;
export const REMOTE_WHEN_FEWER_THAN = 3;
export const MAX_SUGGESTIONS = 8;

/** The whole pool of a game (played + upcoming), memoized per game id. */
export function useGamePool(state: GameState): Track[] {
  const ref = useRef<{ id: string; pool: Track[] } | null>(null);
  if (!ref.current || ref.current.id !== state.id) {
    ref.current = { id: state.id, pool: [...state.rounds.map((r) => r.track), ...state.queue] };
  }
  return ref.current.pool;
}

function merge(local: readonly Track[], remote: readonly Track[], limit: number): Track[] {
  const out: Track[] = [];
  const ids = new Set<number>();
  const keys = new Set<string>();
  for (const t of [...local, ...remote]) {
    const key = trackKey(t);
    if (ids.has(t.id) || keys.has(key)) continue;
    ids.add(t.id);
    keys.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Autocomplete over the game pool, topped up from Deezer search (debounced, stale results
 * dropped) when the pool has fewer than three hits for a query of three or more characters —
 * so any song in the world can be guessed.
 */
export function useSuggestions(query: string, pool: readonly Track[]): { options: Track[]; loading: boolean } {
  const index = useMemo(() => new TrackIndex().build(pool), [pool]);
  const q = query.trim();
  const local = useMemo(() => (q ? index.search(q, MAX_SUGGESTIONS) : []), [index, q]);
  const [remote, setRemote] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const wantRemote = q.length >= REMOTE_MIN_CHARS && local.length < REMOTE_WHEN_FEWER_THAN;

  useEffect(() => {
    if (!wantRemote) {
      setLoading(false);
      if (q.length < REMOTE_MIN_CHARS) setRemote([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const id = window.setTimeout(() => {
      searchTracks(q, MAX_SUGGESTIONS)
        .then((tracks) => {
          if (!alive) return;
          setRemote(tracks);
          setLoading(false);
        })
        .catch(() => {
          if (alive) setLoading(false);
        });
    }, REMOTE_DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [q, wantRemote]);

  const options = useMemo(() => merge(local, wantRemote ? remote : [], MAX_SUGGESTIONS), [local, remote, wantRemote]);
  return { options, loading: loading && options.length < REMOTE_WHEN_FEWER_THAN };
}
