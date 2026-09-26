import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { PoolError, startGameFromSettings, type LoadedGame } from '@/lib/startGame';
import type { GameSettings } from '@/types';

export interface UseStartGame {
  /** Resolve the pool, start the game and (by default) navigate to /play. Returns null on failure. */
  start: (settings: Partial<GameSettings>, opts?: { navigate?: boolean }) => Promise<LoadedGame | null>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

/** Shared "press Start" behaviour for Setup / Packs / Daily / Results. */
export function useStartGame(): UseStartGame {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback<UseStartGame['start']>(
    async (settings, opts) => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await startGameFromSettings(settings);
        if (opts?.navigate !== false) navigate('/play');
        return loaded;
      } catch (e) {
        setError(e instanceof PoolError ? e.message : e instanceof Error ? e.message : 'Something went wrong.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [navigate],
  );

  return { start, loading, error, clearError: () => setError(null) };
}
