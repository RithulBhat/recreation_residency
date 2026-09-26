import { describe, expect, it, vi } from 'vitest';

const render = vi.hoisted(() => vi.fn());
vi.mock('react-dom/client', () => ({ createRoot: vi.fn(() => ({ render })) }));
vi.mock('./App', () => ({ default: () => null }));

describe('boot (main.tsx)', () => {
  it('registers pack metadata so tag-based achievements (polyglot, decades) can unlock (P2-6)', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const { getPackMeta } = await import('@/store/statsStore');
    expect(getPackMeta().size).toBe(0);
    await import('./main');
    const { PACKS } = await import('@/data/packs');
    expect(getPackMeta().size).toBe(PACKS.length);
    expect(getPackMeta().get(PACKS[0]!.id)).toBe(PACKS[0]);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
