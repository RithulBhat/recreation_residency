import { useMemo, useState } from 'react';
import { Library, Search, Sliders, X } from 'lucide-react';
import type { Difficulty, GameSettings } from '@/types';
import { PACKS, getPack, searchPacks } from '@/lib/catalog';
import { PRESETS, normalizeSettings } from '@/game/presets';
import { PackGrid } from '../PackGrid';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Input } from '../ui/Input';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Sheet } from '../ui/Sheet';
import { cn } from '../ui/cn';
import { DuelSummary } from './DuelSummary';

/** Same-device modes can't be raced online, so they never show up as a duel preset. */
const DUEL_PRESETS = PRESETS.filter((p) => p.settings.mode !== 'duel' && p.settings.mode !== 'party');

const FEATURED_PACKS = PACKS.filter((p) => p.featured === true).slice(0, 8);

const DIFFICULTIES: ReadonlyArray<{ value: Difficulty; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Med' },
  { value: 'hard', label: 'Hard' },
  { value: 'expert', label: 'Expert' },
];

/** Round counts a duel offers. The screen snaps a stray draft value onto one of these. */
export const DUEL_ROUND_OPTIONS = [5, 10, 15] as const;

export interface DuelConfigPanelProps {
  draft: GameSettings;
  onChange: (next: GameSettings) => void;
  /** The preset whose chip is lit, or null once the host tweaks something. */
  presetId: string | null;
  onPresetPick: (presetId: string) => void;
  /** Locked while the pool is loading or after the config has been sent. */
  disabled?: boolean;
  className?: string;
}

/** Host-only race setup: preset, packs, difficulty, length — with a live summary. */
export function DuelConfigPanel({ draft, onChange, presetId, onPresetPick, disabled, className }: DuelConfigPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');

  const patch = (partial: Partial<GameSettings>): void => onChange(normalizeSettings({ ...draft, ...partial }));

  const togglePack = (id: string): void => {
    const has = draft.packIds.includes(id);
    if (has && draft.packIds.length === 1) return; // a duel needs at least one pack
    patch({ packIds: has ? draft.packIds.filter((p) => p !== id) : [...draft.packIds, id] });
  };

  const results = useMemo(() => (query.trim() ? searchPacks(query).slice(0, 8) : []), [query]);
  /** Selected packs that aren't in the featured row, so they stay visible. */
  const extraSelected = useMemo(
    () => draft.packIds.filter((id) => !FEATURED_PACKS.some((p) => p.id === id)).map((id) => getPack(id) ?? null),
    [draft.packIds],
  );

  const showRounds = draft.mode !== 'blitz' && draft.mode !== 'survival';

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* Presets */}
      <section aria-labelledby="duel-preset-label">
        <h3 id="duel-preset-label" className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          Preset
        </h3>
        <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
          {DUEL_PRESETS.map((p) => (
            <Chip
              key={p.id}
              size="sm"
              selected={presetId === p.id}
              disabled={disabled}
              onClick={() => onPresetPick(p.id)}
              title={p.blurb}
            >
              <span aria-hidden>{p.emoji}</span> {p.name}
            </Chip>
          ))}
        </div>
      </section>

      {/* Packs */}
      <section aria-labelledby="duel-packs-label">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 id="duel-packs-label" className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
            Packs · <span className="text-accent">{draft.packIds.length}</span>
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setSheetOpen(true)} leadingIcon={<Library />} disabled={disabled}>
            More packs
          </Button>
        </div>

        <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
          {FEATURED_PACKS.map((p) => (
            <Chip
              key={p.id}
              size="sm"
              check
              color={p.accent}
              selected={draft.packIds.includes(p.id)}
              disabled={disabled}
              onClick={() => togglePack(p.id)}
            >
              <span aria-hidden>{p.emoji}</span> {p.name}
            </Chip>
          ))}
          {extraSelected.map((p) =>
            p ? (
              <Chip key={p.id} size="sm" check color={p.accent} selected disabled={disabled} onClick={() => togglePack(p.id)}>
                <span aria-hidden>{p.emoji}</span> {p.name}
              </Chip>
            ) : null,
          )}
        </div>

        <div className="mt-2">
          <Input
            type="search"
            size="md"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a pack — 90s, k-pop, disney…"
            aria-label="Find a pack"
            leadingIcon={<Search />}
            disabled={disabled}
            trailing={
              query ? (
                <button
                  type="button"
                  aria-label="Clear pack search"
                  onClick={() => setQuery('')}
                  className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              ) : undefined
            }
          />
          {results.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {results.map((p) => (
                <Chip
                  key={p.id}
                  size="sm"
                  check
                  color={p.accent}
                  selected={draft.packIds.includes(p.id)}
                  disabled={disabled}
                  onClick={() => togglePack(p.id)}
                >
                  <span aria-hidden>{p.emoji}</span> {p.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Difficulty + length */}
      <section className="grid gap-4 sm:grid-cols-2" aria-label="Difficulty and length">
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Difficulty</h3>
          <SegmentedControl<Difficulty>
            size="sm"
            fullWidth
            aria-label="Difficulty"
            value={draft.difficulty}
            disabled={disabled}
            onChange={(difficulty) => patch({ difficulty })}
            options={DIFFICULTIES}
          />
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Rounds</h3>
          {showRounds ? (
            <SegmentedControl<string>
              size="sm"
              fullWidth
              aria-label="Rounds"
              value={String(draft.rounds)}
              disabled={disabled}
              onChange={(v) => patch({ rounds: Number(v) })}
              options={DUEL_ROUND_OPTIONS.map((r) => ({ value: String(r), label: String(r) }))}
            />
          ) : (
            <p className="flex h-9 items-center gap-2 rounded-xl bg-surface px-3 text-xs text-muted">
              <Sliders className="size-3.5 shrink-0" aria-hidden />
              {draft.mode === 'blitz' ? `${draft.blitzDuration}s on the clock` : `${draft.lives} lives, no round limit`}
            </p>
          )}
        </div>
      </section>

      {/* Live summary */}
      <section aria-label="Duel summary">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Both of you will play</h3>
        <DuelSummary settings={draft} />
      </section>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Pick packs"
        description="Mix as many as you like — tracks are pooled and shuffled the same way on both devices."
        width="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">
              <span className="font-mono font-semibold tabular text-fg">{draft.packIds.length}</span> selected
            </span>
            <Button variant="primary" onClick={() => setSheetOpen(false)}>
              Done
            </Button>
          </div>
        }
      >
        <PackGrid
          packs={PACKS}
          selectedIds={draft.packIds}
          onToggle={togglePack}
          hideSummary
          hideExplicit={draft.explicitFilter}
        />
      </Sheet>
    </div>
  );
}
