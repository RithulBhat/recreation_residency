import type { GameMode, GameSettings } from '@/types';
import { getPack } from '@/lib/catalog';
import { formatClip } from '../ui/Slider';
import { cn } from '../ui/cn';

export const MODE_LABEL: Record<GameMode, string> = {
  classic: 'Classic ladder',
  fixed: 'Fixed clip',
  blitz: 'Blitz',
  survival: 'Survival',
  duel: 'Duel',
  party: 'Party',
};

const DIFFICULTY_LABEL: Record<GameSettings['difficulty'], string> = {
  any: 'Any',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
  impossible: 'Impossible',
};

export function packLabel(packIds: readonly string[]): string {
  if (packIds.length === 0) return 'No packs';
  const names = packIds.map((id) => getPack(id)?.name ?? id);
  if (names.length <= 2) return names.join(' + ');
  return `${names.slice(0, 2).join(' + ')} +${names.length - 2}`;
}

export function lengthLabel(settings: GameSettings): string {
  if (settings.mode === 'blitz') return `${settings.blitzDuration}s on the clock`;
  if (settings.mode === 'survival') return `${settings.lives} lives`;
  return settings.rounds > 0 ? `${settings.rounds} rounds` : 'Endless';
}

export function clipLabel(settings: GameSettings): string {
  if (settings.clipMode === 'escalating' && settings.stages.length > 0) {
    const first = formatClip(settings.stages[0]);
    const last = formatClip(settings.stages[settings.stages.length - 1]);
    return `${first} → ${last} · ${settings.stages.length} tries`;
  }
  return `${formatClip(settings.clipLength)} · ${settings.tries} ${settings.tries === 1 ? 'try' : 'tries'}`;
}

export interface DuelSummaryProps {
  settings: GameSettings;
  className?: string;
}

/** The agreed race setup, as four facts both players can check at a glance. */
export function DuelSummary({ settings, className }: DuelSummaryProps) {
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Mode', value: MODE_LABEL[settings.mode] },
    { label: 'Packs', value: packLabel(settings.packIds) },
    { label: 'Length', value: lengthLabel(settings) },
    { label: 'Clip', value: clipLabel(settings) },
    { label: 'Difficulty', value: DIFFICULTY_LABEL[settings.difficulty] },
    { label: 'Guess', value: settings.guessTarget === 'both' ? 'Title + artist' : settings.guessTarget === 'artist' ? 'Artist' : 'Title' },
  ];
  return (
    <dl className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)} data-testid="duel-summary">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0 rounded-2xl bg-surface px-3 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{f.label}</dt>
          <dd className="mt-0.5 truncate text-sm font-semibold text-fg" title={f.value}>
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
