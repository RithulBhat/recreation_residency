import { useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { usePrefersReducedMotion } from './useMediaQuery';

export type ConfettiKind = 'win' | 'big' | 'streak';

/** Below this viewport width a `win` burst is trimmed so it never fills the whole screen. */
export const NARROW_VIEWPORT = 480;
export const WIN_PARTICLES = 90;
export const WIN_PARTICLES_NARROW = 60;

/**
 * `big` is one burst from the score ring (top third of the screen) that falls away from it, plus
 * 900 ms of light side sparks — enough to feel like a moment, never enough to hide the result.
 */
export const BIG_BURST = {
  particleCount: 70,
  spread: 80,
  startVelocity: 45,
  origin: { x: 0.5, y: 0.32 },
  scalar: 0.8,
} as const;
export const BIG_LOOP_MS = 900;
const BIG_LOOP_INTERVAL_MS = 120;

function readAccentColors(): string[] {
  if (typeof document === 'undefined') return ['#a855f7', '#22d3ee', '#f472b6'];
  const cs = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return [
    pick('--sg-accent', '#a855f7'),
    pick('--sg-accent-2', '#22d3ee'),
    pick('--sg-accent-3', '#f472b6'),
    pick('--sg-success', '#34d399'),
    pick('--sg-warn', '#fbbf24'),
  ];
}

function viewportWidth(): number {
  return typeof window === 'undefined' ? 1024 : window.innerWidth;
}

/** Particles for a `win` burst on the current viewport. */
export function winParticleCount(width: number = viewportWidth()): number {
  return width < NARROW_VIEWPORT ? WIN_PARTICLES_NARROW : WIN_PARTICLES;
}

function nextFrame(cb: (now: number) => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);
  else setTimeout(() => cb(Date.now()), 16);
}

/** Fire confetti without a hook (e.g. from a store). Respects reduced motion. */
export function fireConfetti(kind: ConfettiKind = 'win'): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const colors = readAccentColors();
  const base = { colors, disableForReducedMotion: true, zIndex: 9999 } as const;

  if (kind === 'win') {
    void confetti({ ...base, particleCount: winParticleCount(), spread: 70, startVelocity: 40, origin: { y: 0.7 }, scalar: 1 });
    return;
  }
  if (kind === 'streak') {
    void confetti({ ...base, particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.8 } });
    void confetti({ ...base, particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.8 } });
    return;
  }
  void confetti({ ...base, ...BIG_BURST, shapes: ['circle', 'square', 'star'] });
  const end = Date.now() + BIG_LOOP_MS;
  let last = 0;
  const frame = (now: number) => {
    if (now - last >= BIG_LOOP_INTERVAL_MS) {
      last = now;
      void confetti({ ...base, particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, startVelocity: 50, scalar: 0.8 });
      void confetti({ ...base, particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, startVelocity: 50, scalar: 0.8 });
    }
    if (Date.now() < end) nextFrame(frame);
  };
  nextFrame(frame);
}

export function useConfetti(): { fire: (kind?: ConfettiKind) => void; reduced: boolean } {
  const reduced = usePrefersReducedMotion();
  const fire = useCallback(
    (kind: ConfettiKind = 'win') => {
      if (reduced) return;
      fireConfetti(kind);
    },
    [reduced],
  );
  return useMemo(() => ({ fire, reduced }), [fire, reduced]);
}
