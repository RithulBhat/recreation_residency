import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles } from 'lucide-react';
import type { Pack, PackCategory } from '@/types';
import { PACKS, PACK_CATEGORIES } from '@/lib/catalog';
import { removeCustomPack } from '@/lib/customPacks';
import { useSettingsStore } from '@/store/settingsStore';
import { useStartGame } from '@/hooks/useStartGame';
import { PackGrid } from '@/components/PackGrid';
import { SectionHeading } from '@/components/SectionHeading';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { CustomPackList, CustomPackTools, PackSelectionBar, useCustomPacks } from '@/components/setup';
import { ReplaceGameDialog } from '@/components/ResumeGame';

type Tab = 'all' | PackCategory;

const TAB_LABEL: Partial<Record<PackCategory, string>> = { region: 'World', custom: 'Your packs' };

/** Full pack browser: category tabs, search + tag chips (inside PackGrid), multi-select, custom packs. */
export default function Packs() {
  const navigate = useNavigate();
  const game = useStartGame();
  const settings = useSettingsStore((s) => s.settings);
  const [tab, setTab] = useState<Tab>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, refresh] = useCustomPacks();

  const all = useMemo<Pack[]>(() => [...custom, ...PACKS], [custom]);
  const counts = useMemo(() => {
    const m = new Map<PackCategory, number>();
    for (const p of all) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [all]);

  // Short labels so all nine tabs fit a desktop row without scrolling; counts live in the blurb line.
  const tabs: TabItem<Tab>[] = [
    { value: 'all', label: 'All', icon: <span aria-hidden>🎧</span> },
    ...PACK_CATEGORIES.map((c) => ({ value: c.id, label: TAB_LABEL[c.id] ?? c.name, icon: <span aria-hidden>{c.emoji}</span> })),
  ];
  const category = PACK_CATEGORIES.find((c) => c.id === tab);
  const shown = useMemo(() => (tab === 'all' ? all : all.filter((p) => p.category === tab)), [all, tab]);
  const shownCount = tab === 'all' ? all.length : (counts.get(tab) ?? 0);
  const selectedPacks = useMemo(() => all.filter((p) => selected.includes(p.id)), [all, selected]);

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const play = (ids: string[]) => void game.start({ ...settings, packIds: ids });
  const addToSetup = () => navigate(`/setup?packs=${selected.map(encodeURIComponent).join(',')}`);
  const surprise = () => {
    const pool = shown.filter((p) => !settings.explicitFilter || !p.explicitHeavy);
    const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, 3).map((p) => p.id);
    setSelected(picks);
  };

  return (
    <div className="flex flex-col gap-6 pb-36 sm:gap-8">
      <SectionHeading
        as="h1"
        eyebrow="Pack browser"
        title={
          <span id="packs-title">
            {PACKS.length} packs. <span className="text-gradient">Thousands of songs.</span>
          </span>
        }
        description="Every pack is verified against Deezer, so every song plays. Tap cards to mix them, or hit play on one to start instantly."
        size="lg"
        action={
          <div className="hidden sm:block">
            <Button variant="secondary" size="sm" leadingIcon={<Sparkles />} onClick={() => setTab('custom')}>
              Build your own
            </Button>
          </div>
        }
      />

      <Tabs<Tab> tabs={tabs} value={tab} onChange={setTab} aria-label="Pack categories" idPrefix="packs" />

      {tab === 'custom' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card padding="md" className="flex flex-col gap-4">
            <SectionHeading
              size="sm"
              eyebrow={category ? `${category.emoji} ${category.name}` : 'Your packs'}
              title="Build a pack from anything on Deezer"
              description="Any artist's top tracks, a playlist or album link, or a plain search phrase. Packs stay on this device."
            />
            <CustomPackTools onAdd={() => refresh()} />
          </Card>
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Your packs · {custom.length}</h3>
            <CustomPackList
              packs={custom}
              selectedIds={selected}
              onToggle={toggle}
              onRemove={(id) => {
                removeCustomPack(id);
                setSelected((prev) => prev.filter((x) => x !== id));
                refresh();
              }}
            />
          </div>
        </div>
      ) : (
        <>
          {category && (
            <p className="-mt-2 text-sm text-muted" data-testid="category-blurb">
              <span aria-hidden>{category.emoji}</span> {category.blurb} —{' '}
              <span className="font-mono font-semibold tabular text-fg">{shownCount}</span> pack{shownCount === 1 ? '' : 's'}.
            </p>
          )}
          <div className="[&_[aria-label=Categories]]:hidden">
            <PackGrid
              key={tab}
              packs={shown}
              selectedIds={selected}
              onToggle={toggle}
              onPlay={(id) => play([id])}
              onSurprise={surprise}
              hideSummary
              hideExplicit={settings.explicitFilter}
            />
          </div>
          <Card padding="md" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-display text-base font-bold text-fg">Can't find it?</div>
              <p className="text-sm text-muted">Build a pack from any artist, a Deezer playlist link or a search phrase.</p>
            </div>
            <Button variant="secondary" leadingIcon={<Sparkles />} onClick={() => setTab('custom')}>
              Build your own
            </Button>
          </Card>
        </>
      )}

      <PackSelectionBar
        selected={selectedPacks}
        loading={game.loading}
        error={game.error}
        onPlay={() => play(selected)}
        onAddToSetup={addToSetup}
        onClear={() => setSelected([])}
        onRetry={() => {
          game.clearError();
          if (selected.length) play(selected);
        }}
      />
      <ReplaceGameDialog game={game} />
    </div>
  );
}
