import { describe, expect, it, vi } from 'vitest';

const render = vi.hoisted(() => vi.fn());
vi.mock('react-dom/client', () => ({ createRoot: vi.fn(() => ({ render })) }));
vi.mock('./App', () => ({ default: () => null }));

describe('boot (main.tsx)', () => {
  // packs.json + the stats store are loaded after boot (they are ~80 kB and nothing paints with
  // them), so the registration is awaited rather than assumed synchronous.
  it('registers pack metadata so tag-based achievements (polyglot, decades) can unlock (P2-6)', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const { getPackMeta } = await import('@/store/statsStore');
    expect(getPackMeta().size).toBe(0);
    const { packMetaReady } = await import('./main');
    expect(render).toHaveBeenCalledTimes(1); // the app rendered without waiting for the metadata
    await packMetaReady;
    const { PACKS } = await import('@/data/packs');
    expect(getPackMeta().size).toBe(PACKS.length);
    expect(getPackMeta().get(PACKS[0]!.id)).toBe(PACKS[0]);
  });
});
