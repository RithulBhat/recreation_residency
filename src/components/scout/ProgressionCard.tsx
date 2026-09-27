import { useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { Badge, NumberTicker, ProgressBar, cn, type BadgeTone } from '@/components/ui';
import { fireConfetti } from '@/hooks/useConfetti';
import type { ScoutAchievement, ScoutRarity } from '@/scout/achievements';
import type { RecordScoutGameResult } from '@/store/scoutStatsStore';

export interface ProgressionCardProps {
  result: RecordScoutGameResult | null;
  className?: string;
}

const RARITY_TONE: Record<ScoutRarity, BadgeTone> = {
  common: 'neutral',
  rare: 'accent',
  epic: 'gradient',
  legendary: 'warn',
};

function AchievementCard({ achievement, index }: { achievement: ScoutAchievement; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      className="glass-strong flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl p-3"
      style={{ transformStyle: 'preserve-3d', transformOrigin: 'top center' }}
      initial={reduce ? { opacity: 0 } : { rotateX: -80, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.25 + index * 0.15 }}
      data-testid="scout-achievement"
      data-achievement={achievement.id}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-accent text-2xl shadow-glow" aria-hidden>
        {achievement.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-fg">{achievement.name}</span>
          <Badge tone={RARITY_TONE[achievement.rarity]} size="sm">
            {achievement.rarity}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted">{achievement.description}</p>
      </div>
    </motion.li>
  );
}

/**
 * XP, the rank ladder, a RANK UP moment and the badges this run unlocked — the Scout twin of
 * Songooner's `ProgressionCard`, reading `useScoutStatsStore().recordScoutGame`'s result.
 *
 * A run already folded in (a reload, a second effect pass) comes back `duplicate: true` with no XP and
 * no badges, so the card still shows where the rank stands and says why the number is zero.
 */
export function ProgressionCard({ result, className }: ProgressionCardProps) {
  const reduce = useReducedMotion();
  const rankUp = result !== null && result.rankAfter.level > result.rankBefore.level;
  useEffect(() => {
    if (rankUp) fireConfetti('big');
  }, [rankUp]);
  if (!result) return null;
  const { rankAfter: rank, xpGained, newAchievements } = result;
  const toNext = rank.nextAt !== null ? rank.nextAt - rank.xp : 0;

  return (
    <section
      className={cn('glass relative overflow-hidden rounded-4xl p-5', rankUp && 'glow-lg border-gradient', className)}
      aria-label="Scouting progression"
      data-testid="scout-progression"
    >
      {rankUp && (
        <motion.div
          className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-accent px-4 py-3 text-accent-fg"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          role="status"
          data-testid="scout-rank-up"
        >
          <Sparkles className="size-6 shrink-0" aria-hidden />
          <div>
            <div className="font-display text-lg font-black tracking-wide">RANK UP</div>
            <div className="text-sm font-semibold opacity-90">
              {result.rankBefore.emoji} {result.rankBefore.title} → {rank.emoji} {rank.title}
            </div>
          </div>
        </motion.div>
      )}
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface-strong text-3xl" aria-hidden>
          {rank.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Level {rank.level}</div>
              <div className="truncate font-display text-lg font-bold text-fg" data-testid="scout-rank-title">
                {rank.title}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <NumberTicker
                value={xpGained}
                prefix="+"
                suffix=" XP"
                className="font-display text-lg font-bold text-gradient"
              />
              {result.duplicate && <div className="text-[11px] text-muted">already counted</div>}
            </div>
          </div>
          <ProgressBar value={rank.progress} size="sm" className="mt-2" aria-label="Rank progress" />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-muted tabular">
            <span>{rank.xp.toLocaleString('en-US')} XP</span>
            <span>
              {rank.next ? `${toNext.toLocaleString('en-US')} to ${rank.next.emoji} ${rank.next.title}` : 'Max rank'}
            </span>
          </div>
        </div>
      </div>
      {newAchievements.length > 0 && (
        <div className="mt-5" style={{ perspective: 900 }}>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-accent">
            {newAchievements.length === 1 ? 'Badge unlocked' : `${newAchievements.length} badges unlocked`}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {newAchievements.map((a, i) => (
              <AchievementCard key={a.id} achievement={a} index={i} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
