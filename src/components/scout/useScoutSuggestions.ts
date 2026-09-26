import { useEffect, useMemo, useState } from 'react';
import { loadDataset } from '@/data/nfl';
import { suggestSubjects } from '@/scout/names';
import { buildPlayerSubject, buildTeamSubject } from '@/scout/subjects';
import type { ScoutSubject, SubjectKind } from '@/scout/types';

/** One pool per kind, built once per session. `SubjectIndex` then caches on the array identity. */
const pools = new Map<SubjectKind, ScoutSubject[]>();
let pending: Promise<void> | undefined;

/** Build both pools from the baked dataset. Exported for the DEV handle and the tests. */
export async function loadSuggestionPools(): Promise<void> {
  if (pools.size === 2) return;
  pending ??= loadDataset()
    .then((data) => {
      const teams = new Map(data.teams.map((t) => [t.id, t]));
      pools.set(
        'player',
        data.players.map((p) => buildPlayerSubject(p, teams.get(p.teamId))),
      );
      pools.set('team', data.teams.map(buildTeamSubject));
    })
    .catch((err: unknown) => {
      pending = undefined;
      throw err;
    });
  return pending;
}

export function suggestionPool(kind: SubjectKind): ScoutSubject[] {
  return pools.get(kind) ?? [];
}

export interface ScoutSuggestions {
  options: ScoutSubject[];
  loading: boolean;
  /** The whole searchable pool of this kind — also what the near-miss wording is judged against. */
  pool: ScoutSubject[];
}

/**
 * Autocomplete over the WHOLE league (every player, or all 32 franchises) — never over the run's
 * queue, which would hand the player the answer sheet. The index is built once per pool array
 * identity by `suggestSubjects`, so thousands of subjects stay inside a keystroke's budget.
 */
export function useScoutSuggestions(kind: SubjectKind, query: string, limit = 8): ScoutSuggestions {
  const [ready, setReady] = useState(() => pools.has(kind));

  useEffect(() => {
    if (pools.has(kind)) {
      setReady(true);
      return;
    }
    let alive = true;
    void loadSuggestionPools()
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => {
        // Free text still works without suggestions.
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  const pool = ready ? suggestionPool(kind) : [];
  const q = query.trim();
  const options = useMemo(() => (q.length === 0 || pool.length === 0 ? [] : suggestSubjects(q, pool, limit)), [q, pool, limit]);

  return { options, loading: !ready, pool };
}
