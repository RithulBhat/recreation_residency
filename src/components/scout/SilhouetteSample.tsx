import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Skeleton, cn } from '@/components/ui';
import { loadPlayers } from '@/data/nfl';
import { visualLadder } from '@/scout/stages';
import { SILHOUETTE_MAX } from '@/scout/stages';
import type { NflPlayer } from '@/scout/types';
import { PhotoStage } from './PhotoStage';

export interface SilhouetteSampleProps {
  /** How many famous faces to cycle through. */
  count?: number;
  className?: string;
}

/** One rung every 1.5 s, then the answer for 2.4 s. */
const RUNG_MS = 1500;
const REVEAL_MS = 2400;
const RUNGS = 3;

/**
 * The landing page walks the real ladder, but stops before its last live rung: that one is the
 * full-colour blurred frame, which on a 300 px card is a smudge — the wrong thing to lead with. The
 * shadow does the selling, and the reveal is the real photo either way.
 */
const ladder = visualLadder(RUNGS, 0, SILHOUETTE_MAX * 0.6);

/** Stars only — the sample has to be guessable to sell the game. */
function pickStars(players: readonly NflPlayer[], count: number): NflPlayer[] {
  return players
    .filter((p) => p.fame >= 80 && p.headshot !== '')
    .sort((a, b) => b.fame - a.fame || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, count));
}

/**
 * A live silhouette on the landing page: a real headshot walking up the real reveal ladder, then the
 * answer. It uses {@link PhotoStage}, so what you see here is exactly what the game shows.
 *
 * Under `prefers-reduced-motion` nothing cycles: the frame is shown next to its own reveal instead,
 * which explains the mode without a single moving pixel.
 */
export function SilhouetteSample({ count = 6, className }: SilhouetteSampleProps) {
  const reduce = useReducedMotion();
  const [players, setPlayers] = useState<NflPlayer[]>([]);
  const [step, setStep] = useState(0);
  const [who, setWho] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadPlayers()
      .then((all) => {
        if (alive) setPlayers(pickStars(all, count));
      })
      .catch(() => {
        /* the landing page is fine without the sample */
      });
    return () => {
      alive = false;
    };
  }, [count]);

  useEffect(() => {
    if (reduce || players.length === 0) return;
    const revealed = step >= RUNGS;
    const id = window.setTimeout(() => {
      if (revealed) {
        setWho((w) => (w + 1) % players.length);
        setStep(0);
      } else {
        setStep((s) => s + 1);
      }
    }, revealed ? REVEAL_MS : RUNG_MS);
    return () => window.clearTimeout(id);
  }, [reduce, step, players.length]);

  const player = players[who];
  const subject = useMemo(
    () =>
      player
        ? { kind: 'player' as const, id: player.id, name: player.name, accepted: [], image: player.headshot, player, tier: 'star' as const }
        : null,
    [player],
  );

  if (!subject || !player) {
    return <Skeleton className={cn('aspect-square w-full rounded-4xl', className)} />;
  }

  const revealed = step >= RUNGS;
  const visual = ladder[Math.min(step, RUNGS - 1)] ?? 0;

  if (reduce) {
    return (
      <div className={cn('grid grid-cols-2 gap-3', className)} data-testid="scout-sample">
        <figure className="flex flex-col gap-2">
          <PhotoStage mode="silhouette" src={player.headshot} visual={0} revealed={false} alt={player.name} />
          <figcaption className="text-center text-xs text-muted">What you get</figcaption>
        </figure>
        <figure className="flex flex-col gap-2">
          <PhotoStage mode="silhouette" src={player.headshot} visual={1} revealed alt={player.name} />
          <figcaption className="text-center text-xs font-semibold text-fg">{player.name}</figcaption>
        </figure>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="scout-sample">
      <PhotoStage mode="silhouette" src={player.headshot} visual={visual} revealed={revealed} alt={player.name} />
      <div className="flex h-7 items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={revealed ? `name-${player.id}` : `rung-${step}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className={cn('text-center text-sm', revealed ? 'font-display font-bold text-fg' : 'font-mono text-muted')}
            aria-live="off"
          >
            {revealed ? player.name : 'Who is it?'}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
