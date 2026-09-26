import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, reduce } from '@/game/engine';
import { normalizeSettings } from '@/game/presets';
import type { CatalogFilter, GameState, Track } from '@/types';
import { BROAD_POOL_WHEN_FEWER_THAN, useGamePool, useSuggestions } from './useSuggestions';

const buildPool = vi.fn<(filter: CatalogFilter) => Promise<Track[]>>();
vi.mock('@/lib/catalog', async (orig) => ({
  ...(await orig<typeof import('@/lib/catalog')>()),
  buildPool: (filter: CatalogFilter) => buildPool(filter),
}));
vi.mock('@/lib/deezer', async (orig) => ({
  ...(await orig<typeof import('@/lib/deezer')>()),
  searchTracks: () => Promise.resolve([]),
}));

function track(id: number, title: string, artist: string): Track {
  return { id, title, titleFull: title, artist, artistId: id, album: 'A', albumId: id, cover: '', coverBig: '', preview: 'x', previewFetchedAt: 0, duration: 200, rank: 1, explicit: false };
}

function game(size: number, seed: string): GameState {
  const tracks = Array.from({ length: size }, (_, i) => track(i + 1, `Song ${i + 1}`, `Artist ${i + 1}`));
  const settings = normalizeSettings({ mode: 'fixed', clipMode: 'fixed', clipLength: 1, tries: 2, rounds: 2, packIds: ['pop-hits'], seed });
  return reduce(createInitialState(), { type: 'start', settings, tracks, now: 1000 });
}

const BROAD = [track(100, 'Blinding Lights', 'The Weeknd'), track(101, 'Bad Guy', 'Billie Eilish')];

beforeEach(() => {
  buildPool.mockReset();
});

describe('useGamePool', () => {
  it('widens a narrow pool (challenge link / online duel) with the packs at any difficulty, once per game', async () => {
    buildPool.mockResolvedValue(BROAD);
    const state = game(5, 'narrow');
    const { result, rerender } = renderHook(({ s }: { s: GameState }) => useGamePool(s), { initialProps: { s: state } });
    expect(result.current).toHaveLength(5);
    await waitFor(() => expect(result.current).toHaveLength(7));
    expect(buildPool).toHaveBeenCalledTimes(1);
    expect(buildPool).toHaveBeenCalledWith({ packIds: state.settings.packIds, difficulty: 'any', explicitFilter: state.settings.explicitFilter });
    // The game's own tracks (in seeded order) come first, the catalogue after.
    expect([...result.current.slice(0, 5).map((t) => t.id)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(result.current.slice(5).map((t) => t.id)).toEqual([100, 101]);

    // Later states of the same game reuse both the local pool and the catalogue.
    const later = reduce(state, { type: 'skip', now: 2000 });
    rerender({ s: later });
    expect(result.current).toHaveLength(7);
    expect(buildPool).toHaveBeenCalledTimes(1);
  });

  it('leaves a pool that is wide enough alone', async () => {
    buildPool.mockResolvedValue(BROAD);
    const { result } = renderHook(() => useGamePool(game(BROAD_POOL_WHEN_FEWER_THAN, 'wide')));
    expect(result.current).toHaveLength(BROAD_POOL_WHEN_FEWER_THAN);
    await Promise.resolve();
    expect(buildPool).not.toHaveBeenCalled();
  });

  it('ignores a catalogue that fails to load', async () => {
    buildPool.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useGamePool(game(3, 'offline')));
    await waitFor(() => expect(buildPool).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(result.current).toHaveLength(3);
  });
});

describe('useSuggestions', () => {
  it('suggests tracks from the widened pool, not only the answers', async () => {
    buildPool.mockResolvedValue(BROAD);
    const state = game(4, 'suggest');
    const { result } = renderHook(() => {
      const pool = useGamePool(state);
      return useSuggestions('blind', pool);
    });
    expect(result.current.options).toHaveLength(0);
    await waitFor(() => expect(result.current.options.map((t) => t.title)).toEqual(['Blinding Lights']));
  });
});
