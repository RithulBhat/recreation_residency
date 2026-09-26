import { motion, useReducedMotion } from 'motion/react';
import { NumberTicker, cn } from '@/components/ui';
import { clipLabel } from './format';
import type { ClubStampData } from './outcome';

export interface ClubStampProps extends ClubStampData {
  className?: string;
}

/**
 * The 0.1 s Club stamp: a foil-ringed badge pressed onto the record's lower-left when a round is won
 * first try at the run's shortest clip. Shockwave, spinning foil, the score counting up, and the
 * lifetime tally when this is not the first.
 */
export function ClubStamp({ clip, score, count, className }: ClubStampProps) {
  const reduce = useReducedMotion();
  const label = clipLabel(clip);
  return (
    <div
      className={cn('pointer-events-none absolute bottom-[3%] left-[1%] aspect-square w-[42%]', className)}
      role="status"
      aria-label={`${label} Club — named it first try at ${label}${count > 1 ? `, ${count} times so far` : ''}`}
      data-testid="club-stamp"
    >
      {/* Shockwave */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full border-2 border-accent-2"
        initial={{ scale: 0.6, opacity: 0.9 }}
        animate={{ scale: reduce ? 1 : 2.4, opacity: 0 }}
        transition={{ duration: reduce ? 0.01 : 0.75, ease: 'easeOut', delay: 0.15 }}
      />
      <motion.div
        className="absolute inset-0"
        initial={reduce ? { opacity: 0 } : { scale: 1.8, opacity: 0, rotate: -2 }}
        animate={{ scale: 1, opacity: 1, rotate: -12 }}
        transition={reduce ? { duration: 0.01 } : { type: 'spring', stiffness: 560, damping: 24, delay: 0.08 }}
      >
        <span aria-hidden className="club-foil absolute inset-0 animate-spin-slow rounded-full shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)]" />
        <span aria-hidden className="absolute inset-[9%] rounded-full bg-[var(--sg-vinyl)] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.22)]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none text-white">
          <span className="font-display text-[8.5cqi] font-black tracking-tight">{label}</span>
          <span className="mt-[1cqi] font-mono text-[3.6cqi] font-bold uppercase tracking-[0.3em]">Club</span>
          <NumberTicker value={score} prefix="+" duration={1100} className="mt-[1.6cqi] text-[4.6cqi] font-bold text-accent-2" />
          {count > 1 && <span className="mt-[1cqi] font-mono text-[3.2cqi] text-white/70">×{count}</span>}
        </div>
      </motion.div>
    </div>
  );
}
