import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import confetti from 'canvas-confetti';
import { BIG_BURST, BIG_LOOP_MS, WIN_PARTICLES, WIN_PARTICLES_NARROW, fireConfetti, winParticleCount } from './useConfetti';

vi.mock('canvas-confetti', () => ({ default: vi.fn(() => Promise.resolve(null)) }));

const mocked = vi.mocked(confetti);

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

describe('fireConfetti', () => {
  beforeEach(() => {
    mocked.mockClear();
    setWidth(1024);
    Reflect.deleteProperty(window, 'matchMedia');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('caps a win burst on narrow viewports', () => {
    expect(winParticleCount(1024)).toBe(WIN_PARTICLES);
    expect(winParticleCount(479)).toBe(WIN_PARTICLES_NARROW);
    fireConfetti('win');
    expect(mocked.mock.calls[0]?.[0]).toMatchObject({ particleCount: 90 });
    mocked.mockClear();
    setWidth(390);
    fireConfetti('win');
    expect(mocked.mock.calls[0]?.[0]).toMatchObject({ particleCount: 60 });
  });

  it('bursts once from the score ring and keeps the side sparks under a second', () => {
    // A setTimeout-backed frame so the fake clock drives the loop deterministically.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16));
    vi.useFakeTimers();
    fireConfetti('big');
    expect(mocked.mock.calls[0]?.[0]).toMatchObject({ particleCount: 70, spread: 80, scalar: 0.8, origin: { x: 0.5, y: 0.32 } });
    expect(mocked.mock.calls[0]?.[0]).toMatchObject(BIG_BURST);
    vi.advanceTimersByTime(BIG_LOOP_MS + 200);
    const during = mocked.mock.calls.length;
    expect(during).toBeGreaterThan(1);
    expect(during).toBeLessThanOrEqual(1 + 2 * Math.ceil(BIG_LOOP_MS / 120) + 2);
    vi.advanceTimersByTime(2000);
    expect(mocked.mock.calls.length).toBe(during);
    for (const [opts] of mocked.mock.calls.slice(1)) expect(opts?.particleCount).toBeLessThanOrEqual(4);
  });

  it('stays quiet under reduced motion', () => {
    Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: true }), configurable: true, writable: true });
    fireConfetti('big');
    fireConfetti('win');
    expect(mocked).not.toHaveBeenCalled();
  });
});
