/**
 * "Press Start" for Highlight Scout — the Scout twin of `@/hooks/useStartGame`.
 *
 * normalize → load the baked dataset → `buildPool` → hand the subjects to `useScoutStore` →
 * navigate to the play screen. Every run gets a seed (so results can always be turned into a
 * challenge link afterwards) unless the caller supplied one (daily / challenge).
 *
 * A run still in progress is never thrown away silently: unless `force` is set, the start waits
 * for the player to confirm (render `<ScoutReplaceDialog game={...} />`) and resolves null if they
 * decline — the same contract Songooner's lobby uses.
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createRng } from '@/game/rng';
import { loadScoutPool } from '@/scout/data';
import { normalizeScoutSettings } from '@/scout/presets';
import { useScoutStore } from '@/store/scoutStore';
import { R } from '@/routes';
import type { ScoutSettings, ScoutStatus } from '@/scout/types';
import { emptyPoolMessage } from './summary';

export interface StartScoutOptions {
  /** Navigate to `#/scout/play` once the pool is built. Default true. */
  navigate?: boolean;
  /** Skip the "replace the run in progress?" confirmation (autostart / daily / challenge). */
  force?: boolean;
}

export interface UseStartScout {
  /** Resolve the pool and start the run. Returns the settings that were played, or null on failure. */
  start: (input: Partial<ScoutSettings>, opts?: StartScoutOptions) => Promise<ScoutSettings | null>;
  loading: boolean;
  /** Human copy for the inline error, or null. */
  error: string | null;
  /** The settings the last start used, so Retry can repeat it. */
  lastAttempt: ScoutSettings | null;
  clearError: () => void;
  /** A start is waiting for the player to confirm replacing the live run. */
  pending: boolean;
  confirmPending: () => void;
  cancelPending: () => void;
}

const LOAD_FAILED = 'Could not load the NFL dataset. Check your connection and try again.';

/** A run the player could still go back to and finish. */
export function isScoutRunLive(status: ScoutStatus): boolean {
  return status === 'playing' || status === 'round-over';
}

interface PendingStart {
  input: Partial<ScoutSettings>;
  opts?: StartScoutOptions;
  resolve: (settings: ScoutSettings | null) => void;
}

export function useStartScout(): UseStartScout {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<ScoutSettings | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef<PendingStart | null>(null);

  const run = useCallback(
    async (input: Partial<ScoutSettings>, opts?: StartScoutOptions): Promise<ScoutSettings | null> => {
      const reproducible = typeof input.seed === 'string' && input.seed !== '';
      const settings = normalizeScoutSettings({
        ...input,
        seed: reproducible ? input.seed : createRng().id(),
      });
      setLoading(true);
      setError(null);
      setLastAttempt(settings);
      try {
        const subjects = await loadScoutPool(settings);
        if (subjects.length === 0) {
          setError(emptyPoolMessage(settings));
          return null;
        }
        useScoutStore.getState().start(settings, subjects);
        if (opts?.navigate !== false) navigate(R.scout.play);
        return settings;
      } catch {
        setError(LOAD_FAILED);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [navigate],
  );

  const start = useCallback<UseStartScout['start']>(
    (input, opts) => {
      if (opts?.force || !isScoutRunLive(useScoutStore.getState().state.status)) return run(input, opts);
      // A newer request supersedes an unanswered one — settle it so nobody awaits forever.
      pendingRef.current?.resolve(null);
      return new Promise<ScoutSettings | null>((resolve) => {
        pendingRef.current = { input, opts, resolve };
        setPending(true);
      });
    },
    [run],
  );

  const confirmPending = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(false);
    if (p) void run(p.input, p.opts).then(p.resolve);
  }, [run]);

  const cancelPending = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(false);
    p?.resolve(null);
  }, []);

  return {
    start,
    loading,
    error,
    lastAttempt,
    clearError: useCallback(() => setError(null), []),
    pending,
    confirmPending,
    cancelPending,
  };
}
