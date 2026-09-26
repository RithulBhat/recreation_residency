import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameSettings, GameState, Track } from '@/types';
import { TrackIndex } from '@/game/match';
import { searchTracks } from '@/lib/deezer';
import { buildPool, trackKey } from '@/lib/catalog';

export const REMOTE_DEBOUNCE_MS = 250;
export const REMOTE_MIN_CHARS = 3;
export const REMOTE_WHEN_FEWER_THAN = 3;
export const MAX_SUGGESTIONS = 8;
/**
 * A game pool smaller than this is the answer sheet (a challenge link carries ≤ 60 exact tracks,
 * an online duel's `init` is capped at 60), so the suggestion pool is widened to the packs' catalogue.
 */
export const BROAD_POOL_WHEN_FEWER_THAN = 40;

let broadPool: { id: string; promise: Promise<Track[]> } | null = null;

/** The packs' whole catalogue at every difficulty, resolved once per game id. Failures yield []. */
function loadBroadPool(gameId: string, settings: GameSettings): Promise<Track[]> {
  if (broadPool?.id === gameId) return broadPool.promise;
  const { packIds, explicitFilter } = settings;
  const promise = buildPool({ packIds, difficulty: 'any', explicitFilter }).catch((): Track[] => []);
  broadPool = { id: gameId, promise };
  return promise;
}

function merge(local: readonly Track[], remote: readonly Track[], limit = Number.POSITIVE_INFINITY): Track[] {
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
 * The suggestion pool of a game: its own tracks (played + upcoming), memoized per game id, unioned
 * in the background with the packs' catalogue when the game's pool is too small to hide the answers.
 */
export function useGamePool(state: GameState): Track[] {
  const ref = useRef<{ id: string; pool: Track[] } | null>(null);
  if (!ref.current || ref.current.id !== state.id) {
    ref.current = { id: state.id, pool: [...state.rounds.map((r) => r.track), ...state.queue] };
  }
  const local = ref.current.pool;
  const gameId = state.id;
  const settings = state.settings;
  const narrow = local.length < BROAD_POOL_WHEN_FEWER_THAN;
  const [broad, setBroad] = useState<{ id: string; tracks: Track[] } | null>(null);

  useEffect(() => {
    if (!narrow) return;
    let alive = true;
    void loadBroadPool(gameId, settings).then((tracks) => {
      if (alive && tracks.length > 0) setBroad({ id: gameId, tracks });
    });
    return () => {
      alive = false;
    };
  }, [gameId, settings, narrow]);

  return useMemo(() => (broad && broad.id === gameId ? merge(local, broad.tracks) : local), [local, broad, gameId]);
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
