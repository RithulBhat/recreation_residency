import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { PlayerConfig } from '@/types';
import { getSfx } from '@/audio';
import { Avatar } from '../ui/Avatar';
import { Portal, useScrollLock } from '../ui/internal';

export interface CountdownOverlayProps {
  /** 3 → 0. 0 renders "GO". */
  seconds: number;
  me: PlayerConfig | null;
  opponent: PlayerConfig | null;
}

/** Full-screen 3-2-1 before both devices start the same seeded game. */
export function CountdownOverlay({ seconds, me, opponent }: CountdownOverlayProps) {
  const reduce = useReducedMotion();
  const lastPlayed = useRef<number | null>(null);
  useScrollLock(true);

  useEffect(() => {
    if (lastPlayed.current === seconds) return;
    lastPlayed.current = seconds;
    try {
      getSfx().play(seconds > 0 ? 'tick' : 'countdown');
    } catch {
      /* no audio context yet (no gesture on this device) — the countdown is still visible */
    }
  }, [seconds]);

  const label = seconds > 0 ? String(seconds) : 'GO';

  // Portalled to <body>: the app shell's nav bars make their own stacking contexts.
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[200] grid place-items-center bg-bg/98 px-6 backdrop-blur-2xl"
        role="status"
        aria-live="assertive"
        data-testid="duel-countdown"
      >
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-4">
            {me && <Avatar emoji={me.emoji} color={me.color} size="lg" name={me.name} />}
            <span className="font-display text-sm font-black uppercase tracking-[0.3em] text-muted">vs</span>
            {opponent && <Avatar emoji={opponent.emoji} color={opponent.color} size="lg" name={opponent.name} />}
          </div>

          <div className="grid h-[38vh] min-h-48 place-items-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={label}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                className="text-gradient font-display text-[40vw] font-black leading-none sm:text-[15rem]"
              >
                {label}
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            {seconds > 0 ? 'Both devices start together' : 'Good luck'}
          </p>
        </div>
      </div>
    </Portal>
  );
}
