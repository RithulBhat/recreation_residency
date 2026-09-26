import { useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { usePrefersReducedMotion } from './useMediaQuery';

export type ConfettiKind = 'win' | 'big' | 'streak';

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

/** Fire confetti without a hook (e.g. from a store). Respects reduced motion. */
export function fireConfetti(kind: ConfettiKind = 'win'): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const colors = readAccentColors();
  const base = { colors, disableForReducedMotion: true, zIndex: 9999 } as const;

  if (kind === 'win') {
    void confetti({ ...base, particleCount: 90, spread: 70, startVelocity: 40, origin: { y: 0.7 }, scalar: 1 });
    return;
  }
  if (kind === 'streak') {
    void confetti({ ...base, particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.8 } });
    void confetti({ ...base, particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.8 } });
    return;
  }
  // big: 2.4s of celebratory bursts from both sides
  const end = Date.now() + 2400;
  const frame = () => {
    void confetti({ ...base, particleCount: 6, angle: 60, spread: 65, origin: { x: 0, y: 0.75 }, startVelocity: 55 });
    void confetti({ ...base, particleCount: 6, angle: 120, spread: 65, origin: { x: 1, y: 0.75 }, startVelocity: 55 });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
  void confetti({
    ...base,
    particleCount: 160,
    spread: 100,
    startVelocity: 50,
    origin: { y: 0.6 },
    shapes: ['circle', 'square', 'star'],
    scalar: 1.2,
  });
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
