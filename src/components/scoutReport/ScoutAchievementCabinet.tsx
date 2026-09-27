import { useMemo, useState } from 'react';
import { Lock, Trophy } from 'lucide-react';
import { SCOUT_ACHIEVEMENTS, SCOUT_RARITIES, type ScoutAchievement } from '@/scout/achievements';
import type { ScoutAchievementUnlock } from '@/scout/scoutStats';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { TabPanel, Tabs, type TabItem } from '@/components/ui/Tabs';
import { cn } from '@/components/ui/cn';
import { SCOUT_RARITY_LABEL, SCOUT_RARITY_TONE } from './format';

export interface ScoutAchievementCabinetProps {
  /** The persisted unlock log. */
  unlocks: readonly ScoutAchievementUnlock[];
  className?: string;
}

type Filter = 'all' | 'unlocked' | 'locked';

function unlockDate(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return 'Unlocked';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function Tile({ achievement, at }: { achievement: ScoutAchievement; at: number | undefined }) {
  const unlocked = at !== undefined;
  const veiled = !unlocked && achievement.hidden === true;
  return (
    <li
      className={cn(
        'relative flex flex-col gap-1 overflow-hidden rounded-3xl p-3',
        unlocked ? 'glass ring-1 ring-accent/30' : 'border border-border bg-surface/40',
      )}
      data-testid="scout-achievement"
      data-unlocked={unlocked ? 'yes' : 'no'}
    >
      {unlocked && (
        <span
          className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-accent opacity-20 blur-2xl"
          aria-hidden
        />
      )}
      <div className="relative flex items-start justify-between gap-2">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-2xl text-lg leading-none',
            unlocked ? 'bg-gradient-accent shadow-glow' : 'bg-surface-strong opacity-50 grayscale',
          )}
          aria-hidden
        >
          {veiled ? '❔' : achievement.emoji}
        </span>
        <Badge
          tone={unlocked ? SCOUT_RARITY_TONE[achievement.rarity] : 'neutral'}
          size="sm"
          className={cn(!unlocked && 'opacity-70')}
        >
          {SCOUT_RARITY_LABEL[achievement.rarity]}
        </Badge>
      </div>
      <h4 className={cn('relative font-display text-sm font-bold leading-tight', unlocked ? 'text-fg' : 'text-fg/60')}>
        {veiled ? '???' : achievement.name}
      </h4>
      <p className={cn('relative line-clamp-2 text-xs leading-snug', unlocked ? 'text-muted' : 'text-muted/70')}>
        {veiled ? 'Hidden — you’ll know it when you hit it.' : achievement.description}
      </p>
      <p className="relative mt-auto pt-1 font-mono text-[10px] tabular">
        {unlocked ? (
          <span className="text-accent">{unlockDate(at)}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted/70">
            <Lock className="size-3" aria-hidden />
            Locked
          </span>
        )}
      </p>
    </li>
  );
}

/**
 * All 47 Scout badges, unlocked and locked, with rarity and a progress count.
 *
 * The full roster renders on an empty ledger too — a locked cabinet is the best advertisement the
 * page has for playing another run.
 */
export function ScoutAchievementCabinet({ unlocks, className }: ScoutAchievementCabinetProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const unlockedAt = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of unlocks) {
      const prev = map.get(u.id);
      if (prev === undefined || u.at < prev) map.set(u.id, u.at);
    }
    return map;
  }, [unlocks]);

  const total = SCOUT_ACHIEVEMENTS.length;
  const unlockedCount = SCOUT_ACHIEVEMENTS.reduce((n, a) => n + (unlockedAt.has(a.id) ? 1 : 0), 0);

  const shown = SCOUT_ACHIEVEMENTS.filter((a) => {
    if (filter === 'unlocked') return unlockedAt.has(a.id);
    if (filter === 'locked') return !unlockedAt.has(a.id);
    return true;
  });

  const tabs: ReadonlyArray<TabItem<Filter>> = [
    { value: 'all', label: 'All', count: total },
    { value: 'unlocked', label: 'Unlocked', count: unlockedCount },
    { value: 'locked', label: 'Locked', count: total - unlockedCount },
  ];

  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="scout-achievements">
      <div className="glass flex flex-wrap items-center gap-3 rounded-3xl px-4 py-3 sm:gap-5">
        <div className="flex items-baseline gap-1.5">
          <Trophy className="size-4 self-center text-accent" aria-hidden />
          <span className="font-mono text-2xl font-semibold tabular text-gradient">{unlockedCount}</span>
          <span className="font-mono text-sm tabular text-muted">/ {total}</span>
        </div>
        <ProgressBar
          className="min-w-32 flex-1"
          value={total > 0 ? unlockedCount / total : 0}
          size="sm"
          label="Badges unlocked"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {SCOUT_RARITIES.map((rarity) => {
            const of = SCOUT_ACHIEVEMENTS.filter((a) => a.rarity === rarity);
            const got = of.filter((a) => unlockedAt.has(a.id)).length;
            return (
              <Badge key={rarity} tone={got > 0 ? SCOUT_RARITY_TONE[rarity] : 'neutral'} size="sm">
                {SCOUT_RARITY_LABEL[rarity]} {got}/{of.length}
              </Badge>
            );
          })}
        </div>
      </div>

      <Tabs tabs={tabs} value={filter} onChange={setFilter} aria-label="Badge filter" idPrefix="scout-achv" />

      <TabPanel value={filter} active={filter} idPrefix="scout-achv">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Nothing here yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((a) => (
              <Tile key={a.id} achievement={a} at={unlockedAt.get(a.id)} />
            ))}
          </ul>
        )}
      </TabPanel>
    </div>
  );
}
