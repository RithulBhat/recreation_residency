import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKS, buildPool, getPack } from '@/lib/catalog';
import { PoolError, loadPool } from './startGame';

vi.mock('@/lib/catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/catalog')>();
  return { ...actual, buildPool: vi.fn() };
});

describe('loadPool error copy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never surfaces the technical failure to the player', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const internal = 'Pack "pop-hits": all 2 source(s) failed to resolve';
    vi.mocked(buildPool).mockRejectedValueOnce(new Error(internal));
    const name = getPack('pop-hits')?.name ?? 'pop-hits';

    const err = await loadPool({ packIds: ['pop-hits'] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PoolError);
    const message = (err as PoolError).message;
    expect(message).toBe(`Couldn't load songs for ${name}. Check your connection and try again.`);
    expect(message).not.toContain('source');
    expect(message).not.toContain('pop-hits');
    // the detail is still logged for whoever is debugging
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls[0]?.find((arg) => arg instanceof Error);
    expect(logged).toBeInstanceOf(Error);
    expect((logged as Error).message).toBe(internal);
  });

  it('lists two packs by name and counts the rest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ids = PACKS.slice(0, 3).map((p) => p.id);
    expect(ids).toHaveLength(3);
    const names = ids.map((id) => getPack(id)!.name);

    vi.mocked(buildPool).mockRejectedValueOnce(new Error('boom'));
    const two = await loadPool({ packIds: ids.slice(0, 2) }).catch((e: unknown) => (e as Error).message);
    expect(two).toBe(`Couldn't load songs for ${names[0]} and ${names[1]}. Check your connection and try again.`);

    vi.mocked(buildPool).mockRejectedValueOnce(new Error('boom'));
    const three = await loadPool({ packIds: ids }).catch((e: unknown) => (e as Error).message);
    expect(three).toBe(`Couldn't load songs for ${names[0]} and 2 more. Check your connection and try again.`);
  });
});
