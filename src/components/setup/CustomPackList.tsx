import { Check, Plus, Trash2 } from 'lucide-react';
import type { Pack } from '@/types';
import { formatPackSize } from '@/components/PackCard';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/components/ui/cn';

export interface CustomPackListProps {
  packs: readonly Pack[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  className?: string;
}

/** "Your packs" rows: toggle into the mix, or delete the pack from this device. */
export function CustomPackList({ packs, selectedIds, onToggle, onRemove, className }: CustomPackListProps) {
  if (packs.length === 0) {
    return <p className={cn('text-sm text-muted', className)}>Packs you build appear here and stay on this device.</p>;
  }
  return (
    <ul className={cn('grid gap-2 sm:grid-cols-2', className)} aria-label="Your packs">
      {packs.map((p) => {
        const selected = selectedIds.includes(p.id);
        return (
          <li key={p.id} className="glass flex items-center gap-2 rounded-2xl p-2 pr-1.5">
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${selected ? 'Remove' : 'Add'} ${p.name}`}
              onClick={() => onToggle(p.id)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-xl text-xl leading-none"
                style={{ background: `color-mix(in oklab, ${p.accent} 30%, var(--sg-bg-elevated))` }}
                aria-hidden
              >
                {p.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">{p.name}</span>
                <span className="block truncate text-xs text-muted">
                  {p.tagline}
                  {p.approxSize ? ` · ${formatPackSize(p.approxSize)}` : ''}
                </span>
              </span>
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border transition-colors',
                  selected ? 'border-transparent bg-accent-solid text-accent-fg' : 'border-border-strong text-muted',
                )}
                aria-hidden
              >
                {selected ? <Check className="size-4" strokeWidth={3} /> : <Plus className="size-4" />}
              </span>
            </button>
            <IconButton aria-label={`Delete ${p.name} pack`} icon={<Trash2 />} size="sm" onClick={() => onRemove(p.id)} />
          </li>
        );
      })}
    </ul>
  );
}
