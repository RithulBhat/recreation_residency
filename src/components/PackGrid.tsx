import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpDown, Play, Search, Shuffle, SlidersHorizontal, X } from 'lucide-react';
import type { Pack, PackCategory } from '@/types';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from './ui/cn';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { Input } from './ui/Input';
import { Popover } from './ui/Popover';
import { SegmentedControl } from './ui/SegmentedControl';
import { EmptyState } from './ui/EmptyState';
import { PackCard, PACK_CATEGORY_LABEL } from './PackCard';

export type PackSort = 'featured' | 'name' | 'size';

/** Past this many, a FEATURED badge on every card in view stops telling the player anything. */
const MAX_FEATURED_BADGES = 6;

export interface PackGridProps {
  packs: ReadonlyArray<Pack>;
  selectedIds: ReadonlyArray<string>;
  onToggle: (id: string) => void;
  /** Quick-play a single pack */
  onPlay?: (id: string) => void;
  /** Play the current selection (shown in the summary bar) */
  onPlaySelection?: () => void;
  onClearSelection?: () => void;
  /** Pick N random packs */
  onSurprise?: () => void;
  initialQuery?: string;
  /** Hide the sticky "Mix N packs" summary bar */
  hideSummary?: boolean;
  /** Hide explicit-heavy packs */
  hideExplicit?: boolean;
  className?: string;
  /** Number of tag chips to surface. Default 12. */
  maxTags?: number;
  /**
   * Below `sm`, fold the sort control and the tag row into a filter button on the search field so
   * the first cards land inside the first fold. Wider screens keep the inline rows.
   */
  compactFilters?: boolean;
}

const CATEGORY_ORDER: PackCategory[] = ['genre', 'decade', 'region', 'artist', 'vibe', 'soundtrack', 'chart', 'custom'];

export function PackGrid({
  packs,
  selectedIds,
  onToggle,
  onPlay,
  onPlaySelection,
  onClearSelection,
  onSurprise,
  initialQuery = '',
  hideSummary = false,
  hideExplicit = false,
  className,
  maxTags = 12,
  compactFilters = false,
}: PackGridProps) {
  const reduce = useReducedMotion();
  const narrow = useMediaQuery('(max-width: 639px)');
  const compact = compactFilters && narrow;
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<'all' | PackCategory>('all');
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<PackSort>('featured');

  const base = useMemo(() => (hideExplicit ? packs.filter((p) => !p.explicitHeavy) : packs), [packs, hideExplicit]);

  const categories = useMemo(() => {
    const counts = new Map<PackCategory, number>();
    for (const p of base) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return CATEGORY_ORDER.filter((c) => counts.has(c)).map((c) => ({ id: c, count: counts.get(c) ?? 0 }));
  }, [base]);

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    const pool = category === 'all' ? base : base.filter((p) => p.category === category);
    for (const p of pool) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, maxTags)
      .map(([tag, count]) => ({ tag, count }));
  }, [base, category, maxTags]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = base.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (tags.length && !tags.some((t) => p.tags.includes(t))) return false;
      if (q) {
        const hay = `${p.name} ${p.tagline} ${p.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'size') list = [...list].sort((a, b) => (b.approxSize ?? 0) - (a.approxSize ?? 0));
    else list = [...list].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    return list;
  }, [base, category, tags, query, sort]);

  /** The first few featured packs in display order wear the badge; the rest go without. */
  const badged = useMemo(
    () => new Set(filtered.filter((p) => p.featured).slice(0, MAX_FEATURED_BADGES).map((p) => p.id)),
    [filtered],
  );

  const selected = useMemo(() => base.filter((p) => selectedIds.includes(p.id)), [base, selectedIds]);
  const totalSongs = selected.reduce((n, p) => n + (p.approxSize ?? 0), 0);

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const hasFilters = query.trim() !== '' || category !== 'all' || tags.length > 0;
  const activeFilters = (sort === 'featured' ? 0 : 1) + tags.length;

  const sortControl = (
    <SegmentedControl<PackSort>
      size="sm"
      aria-label="Sort packs"
      value={sort}
      onChange={setSort}
      options={[
        { value: 'featured', label: 'Featured' },
        { value: 'name', label: 'A–Z' },
        { value: 'size', label: 'Biggest' },
      ]}
    />
  );

  const tagChips =
    topTags.length > 0 ? (
      <div
        className={cn(
          compact ? 'flex flex-wrap gap-1.5' : 'scrollbar-none -mx-4 -my-1.5 flex gap-1.5 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:px-0',
        )}
        role="group"
        aria-label="Tags"
      >
        {topTags.map((t) => (
          <Chip key={t.tag} size="sm" selected={tags.includes(t.tag)} onClick={() => toggleTag(t.tag)} className="capitalize" check>
            {t.tag}
          </Chip>
        ))}
        {tags.length > 0 && (
          <button type="button" onClick={() => setTags([])} className="h-8 shrink-0 px-2 text-xs font-semibold text-muted hover:text-fg">
            Clear tags
          </button>
        )}
      </div>
    ) : null;

  const clearButton = query ? (
    <button
      type="button"
      aria-label="Clear search"
      onClick={() => setQuery('')}
      className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
    >
      <X className="size-4" />
    </button>
  ) : null;

  const filterButton = compact ? (
    <Popover
      aria-label="Sort and filter"
      align="end"
      width={300}
      trigger={
        <button
          type="button"
          aria-label={activeFilters > 0 ? `Sort and filter, ${activeFilters} active` : 'Sort and filter'}
          className={cn(
            'touch-hit-44 relative grid size-9 place-items-center rounded-lg transition-colors',
            activeFilters > 0 ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface hover:text-fg',
          )}
          data-testid="pack-filters"
        >
          <SlidersHorizontal className="size-4" />
          {activeFilters > 0 && (
            <span
              className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-accent-solid font-mono text-[10px] font-bold leading-none text-accent-fg"
              aria-hidden
            >
              {activeFilters}
            </span>
          )}
        </button>
      }
    >
      <div className="flex flex-col gap-3 p-1.5">
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Sort</div>
          {sortControl}
        </div>
        {tagChips && (
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Tags</div>
            {tagChips}
          </div>
        )}
      </div>
    </Popover>
  ) : null;

  return (
    <div className={cn('relative', className)}>
      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search packs, tags, vibes…"
            leadingIcon={<Search />}
            aria-label="Search packs"
            containerClassName="flex-1"
            // The Input's trailing slot only reserves `pr-2`; keep typed text clear of the buttons.
            style={compact ? { paddingRight: query ? '5.25rem' : '3rem' } : undefined}
            trailing={
              clearButton || filterButton ? (
                <span className="flex items-center gap-0.5">
                  {clearButton}
                  {filterButton}
                </span>
              ) : undefined
            }
          />
          {!compact && (
            <div className="flex items-center gap-2">
              <ArrowUpDown className="size-4 shrink-0 text-muted" aria-hidden />
              {sortControl}
            </div>
          )}
        </div>

        <div className="scrollbar-none -mx-4 -my-1.5 flex gap-2 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Categories">
          <Chip size="sm" selected={category === 'all'} onClick={() => setCategory('all')} count={base.length}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} size="sm" selected={category === c.id} onClick={() => setCategory(c.id)} count={c.count}>
              {PACK_CATEGORY_LABEL[c.id]}s
            </Chip>
          ))}
        </div>

        {!compact && tagChips}
      </div>

      {/* Grid */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>
          <span className="font-mono font-semibold tabular text-fg">{filtered.length}</span> pack{filtered.length === 1 ? '' : 's'}
          {hasFilters && ' match'}
        </span>
        {onSurprise && (
          <button type="button" onClick={onSurprise} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
            <Shuffle className="size-3.5" /> Surprise me
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No packs match"
          description="Try a different search or clear the filters."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery('');
                setCategory('all');
                setTags([]);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className={cn('mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', !hideSummary && selected.length > 0 && 'pb-24')}>
          {filtered.map((p) => (
            <PackCard key={p.id} pack={p} selected={selectedIds.includes(p.id)} showFeatured={badged.has(p.id)} onToggle={onToggle} onPlay={onPlay} />
          ))}
        </div>
      )}

      {/* Summary bar */}
      {!hideSummary && (
        <AnimatePresence>
          {selected.length > 0 && (
            <motion.div
              key="summary"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              className="pointer-events-none sticky inset-x-0 z-30 flex justify-center px-2"
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
            >
              <div className="glass-strong pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-full bg-bg-elevated/96 py-2 pl-4 pr-2 shadow-xl">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-fg">
                    Mix {selected.length} pack{selected.length === 1 ? '' : 's'}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {totalSongs > 0 ? `~${totalSongs.toLocaleString()} songs · ` : ''}
                    {selected.map((p) => p.emoji).join(' ')}
                  </div>
                </div>
                {onClearSelection && (
                  <button type="button" onClick={onClearSelection} className="hidden h-9 px-2 text-xs font-semibold text-muted hover:text-fg sm:block">
                    Clear
                  </button>
                )}
                {onPlaySelection && (
                  <Button size="md" pill leadingIcon={<Play className="fill-current" />} onClick={onPlaySelection}>
                    Play
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
