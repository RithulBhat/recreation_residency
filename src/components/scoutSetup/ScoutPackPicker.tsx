import { useMemo, useState } from 'react';
import { ChevronDown, Search, Star, X } from 'lucide-react';
import { SCOUT_PACKS } from '@/scout/packs';
import { SCOUT_LIMITS } from '@/scout/presets';
import { useScoutSettingsStore } from '@/store/scoutStore';
import type { ScoutPack } from '@/scout/types';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/components/ui/cn';
import { poolKind, poolLabel } from './summary';

export interface ScoutPackPickerProps {
  /** Subjects each pack contributes at the current difficulty, from the real dataset. */
  counts: Record<string, number> | null;
  /** Exact size of the pool the current settings would deal, or null while the dataset loads. */
  poolSize: number | null;
  loading: boolean;
}

interface Category {
  id: string;
  label: string;
  /** A pack belongs here when it carries any of these tags. Empty = everything. */
  tags: readonly string[];
}

export const SCOUT_PACK_CATEGORIES: readonly Category[] = [
  { id: 'all', label: 'All', tags: [] },
  { id: 'fame', label: 'Fame', tags: ['difficulty'] },
  { id: 'era', label: 'Era & draft', tags: ['experience', 'draft'] },
  { id: 'position', label: 'Position', tags: ['position'] },
  { id: 'division', label: 'Division', tags: ['division'] },
  { id: 'conference', label: 'Conference', tags: ['conference'] },
  { id: 'rosters', label: 'Team rosters', tags: ['team'] },
  { id: 'franchises', label: 'Franchises', tags: ['teams'] },
];

/** How many packs the grid shows before the "show all" expander. */
export const COLLAPSED_PACKS = 10;

function inCategory(pack: ScoutPack, category: Category): boolean {
  if (category.tags.length === 0) return true;
  return category.tags.some((t) => pack.tags.includes(t));
}

function matchesQuery(pack: ScoutPack, q: string): boolean {
  if (q === '') return true;
  const needle = q.toLowerCase();
  return (
    pack.name.toLowerCase().includes(needle) ||
    pack.tagline.toLowerCase().includes(needle) ||
    pack.tags.some((t) => t.includes(needle))
  );
}

/** Searchable, filterable multi-select over all 40+ Scout packs, with live pool sizes. */
export function ScoutPackPicker({ counts, poolSize, loading }: ScoutPackPickerProps) {
  const settings = useScoutSettingsStore((s) => s.settings);
  const update = useScoutSettingsStore((s) => s.update);
  const pushRecentPack = useScoutSettingsStore((s) => s.pushRecentPack);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [expanded, setExpanded] = useState(false);

  const packIds = settings.packIds;
  const selected = useMemo(
    () => packIds.map((id) => SCOUT_PACKS.find((p) => p.id === id)).filter((p): p is ScoutPack => p !== undefined),
    [packIds],
  );
  const atCap = packIds.length >= SCOUT_LIMITS.packIds.max;

  const active = SCOUT_PACK_CATEGORIES.find((c) => c.id === category) ?? SCOUT_PACK_CATEGORIES[0]!;
  const matching = useMemo(
    () => SCOUT_PACKS.filter((p) => inCategory(p, active) && matchesQuery(p, query)),
    [active, query],
  );
  // 47 packs is a wall on a phone: show a screenful and let the rest open on demand.
  const visible = expanded ? matching : matching.slice(0, COLLAPSED_PACKS);
  const hidden = matching.length - visible.length;

  const toggle = (pack: ScoutPack) => {
    if (packIds.includes(pack.id)) {
      if (packIds.length <= 1) return; // keep at least one
      update({ packIds: packIds.filter((x) => x !== pack.id) });
      return;
    }
    if (atCap) return;
    update({ packIds: [...packIds, pack.id] });
    pushRecentPack(pack.id);
  };

  const kind = poolKind(settings);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ul className="flex flex-wrap items-center gap-2" aria-label="Selected packs">
        {selected.map((p) => (
          <li
            key={p.id}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border pl-2.5 pr-1 text-sm font-semibold text-fg"
            style={{ background: `color-mix(in oklab, ${p.accent} 22%, var(--sg-surface))` }}
          >
            <span aria-hidden>{p.emoji}</span>
            <span className="max-w-[9rem] truncate">{p.name}</span>
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              disabled={selected.length <= 1}
              onClick={() => toggle(p)}
              className="touch-hit-44 grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-surface-strong hover:text-fg disabled:opacity-30"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {selected.length === 0 && <li className="text-sm text-muted">No packs yet — pick at least one.</li>}
      </ul>

      <p className="font-mono text-xs tabular text-muted" aria-live="polite" data-testid="scout-pool-line">
        {loading ? (
          'Counting the pool…'
        ) : poolSize === null ? (
          `${packIds.length} pack${packIds.length === 1 ? '' : 's'} selected`
        ) : (
          <>
            <span className={cn('font-bold', poolSize === 0 ? 'text-danger' : 'text-fg')}>{poolLabel(poolSize, kind)}</span>
            {' in this pool · '}
            {packIds.length} pack{packIds.length === 1 ? '' : 's'}
          </>
        )}
      </p>

      <Input
        type="search"
        aria-label="Search packs"
        placeholder="Search packs — Chiefs, rookies, QB…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setExpanded(false);
        }}
        leadingIcon={<Search />}
      />

      <div
        className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        role="group"
        aria-label="Pack categories"
      >
        {SCOUT_PACK_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            size="sm"
            selected={c.id === category}
            onClick={() => {
              setCategory(c.id);
              setExpanded(false);
            }}
          >
            {c.label}
          </Chip>
        ))}
      </div>

      {atCap && (
        <p className="text-xs font-semibold text-warn" role="status">
          {SCOUT_LIMITS.packIds.max} packs is the cap — remove one to add another.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No pack matches “{query}”.</p>
      ) : (
        <ul className="grid min-w-0 gap-2 sm:grid-cols-2" aria-label="Packs">
          {visible.map((p) => {
            const isSelected = packIds.includes(p.id);
            const count = counts?.[p.id];
            const empty = count === 0;
            return (
              <li key={p.id} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Remove' : 'Add'} ${p.name}`}
                  disabled={!isSelected && atCap}
                  onClick={() => toggle(p)}
                  data-pack={p.id}
                  className={cn(
                    'flex w-full min-w-0 items-start gap-2.5 rounded-2xl border p-2.5 text-left transition-[border-color,box-shadow,background-color] duration-150 active:scale-[0.99] disabled:opacity-40',
                    isSelected
                      ? 'border-transparent ring-2 ring-accent bg-surface-strong'
                      : 'border-border bg-surface hover:border-border-strong',
                  )}
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-xl text-lg leading-none"
                    style={{ background: `color-mix(in oklab, ${p.accent} 30%, var(--sg-bg-elevated))` }}
                    aria-hidden
                  >
                    {p.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-bold text-fg">{p.name}</span>
                      {p.featured && <Star className="size-3 shrink-0 text-warn" aria-label="Featured" />}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-muted">{p.tagline}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    {count === undefined ? (
                      <Skeleton className="h-4 w-8 rounded-full" />
                    ) : (
                      <span
                        className={cn(
                          'block font-mono text-xs font-bold tabular',
                          empty ? 'text-danger' : 'text-fg',
                        )}
                      >
                        {count.toLocaleString()}
                      </span>
                    )}
                    <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wider text-muted">
                      {p.kind === 'team' ? 'clubs' : 'players'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          data-testid="scout-show-all-packs"
          className="touch-hit-44 inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface text-sm font-semibold text-fg transition-colors hover:border-border-strong"
        >
          Show all {matching.length} packs
          <ChevronDown className="size-4" aria-hidden />
        </button>
      )}
      {expanded && matching.length > COLLAPSED_PACKS && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="touch-hit-44 inline-flex h-11 items-center justify-center rounded-2xl text-sm font-semibold text-muted transition-colors hover:text-fg"
        >
          Show fewer
        </button>
      )}

      <p className="text-xs text-muted">
        Counts are live from the synced roster at the difficulty you picked
        {settings.difficulty !== 'any' && <Badge tone="accent" size="sm" className="ml-1.5 align-middle">filtered</Badge>}.
      </p>
    </div>
  );
}
