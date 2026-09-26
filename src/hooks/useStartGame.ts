import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PoolError, startGameFromSettings, type LoadedGame } from '@/lib/startGame';
import { useGameStore } from '@/store/gameStore';
import { R } from '@/routes';
import type { GameSettings, GameStatus } from '@/types';

export interface StartOptions {
  /** Navigate to the Songooner play screen once the pool is loaded. Default true. */
  navigate?: boolean;
  /** Skip the "replace the game in progress?" confirmation (autostart / rematch flows). */
  force?: boolean;
}

export interface UseStartGame {
  /**
   * Resolve the pool, start the game and (by default) navigate to Songooner's play screen.
   * Returns null on failure.
   * When a game is still live and `opts.force` is not set, the start waits for the player to
   * confirm (render `<ReplaceGameDialog game={...} />`) and resolves null if they decline.
   */
  start: (settings: Partial<GameSettings>, opts?: StartOptions) => Promise<LoadedGame | null>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  /** A start is waiting for the player to confirm replacing the live game. */
  pending: boolean;
  confirmPending: () => void;
  cancelPending: () => void;
}

/** A game the player could still go back to and finish. */
export function isGameLive(status: GameStatus): boolean {
  return status === 'playing' || status === 'round-over';
}

interface PendingStart {
  settings: Partial<GameSettings>;
  opts?: StartOptions;
  resolve: (loaded: LoadedGame | null) => void;
}

/** Shared "press Start" behaviour for Setup / Packs / Daily / Results. */
export function useStartGame(): UseStartGame {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef<PendingStart | null>(null);

  const run = useCallback(
    async (settings: Partial<GameSettings>, opts?: StartOptions): Promise<LoadedGame | null> => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await startGameFromSettings(settings);
        if (opts?.navigate !== false) navigate(R.songooner.play);
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

  const start = useCallback<UseStartGame['start']>(
    (settings, opts) => {
      if (opts?.force || !isGameLive(useGameStore.getState().state.status)) return run(settings, opts);
      // A newer request supersedes an unanswered one — settle it so nobody awaits forever.
      pendingRef.current?.resolve(null);
      return new Promise<LoadedGame | null>((resolve) => {
        pendingRef.current = { settings, opts, resolve };
        setPending(true);
      });
    },
    [run],
  );

  const confirmPending = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(false);
    if (p) void run(p.settings, p.opts).then(p.resolve);
  }, [run]);

  const cancelPending = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(false);
    p?.resolve(null);
  }, []);

  return { start, loading, error, clearError: () => setError(null), pending, confirmPending, cancelPending };
}
