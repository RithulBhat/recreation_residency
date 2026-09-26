import { useCallback, useMemo, useState } from 'react';
import { Library, Sparkles } from 'lucide-react';
import type { Pack } from '@/types';
import { PACKS } from '@/lib/catalog';
import { customPacks, removeCustomPack } from '@/lib/customPacks';
import { PackGrid } from '@/components/PackGrid';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { CustomPackList } from './CustomPackList';
import { CustomPackTools } from './CustomPackTools';

type View = 'browse' | 'custom';

export interface PackMixerProps {
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  /** A freshly built custom pack — callers usually select it. */
  onAdded?: (pack: Pack) => void;
  hideExplicit?: boolean;
  /** Which tab to open first. Default 'browse'. */
  initialView?: View;
}

/** Re-read the custom pack registry; returns a bump function to refresh after add/remove. */
export function useCustomPacks(): [Pack[], () => void] {
  const [version, setVersion] = useState(0);
  const packs = useMemo(() => customPacks(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return [packs, refresh];
}

/** The body of the "Mix packs" sheet: browse the catalog or build your own. */
export function PackMixer({ selectedIds, onToggle, onAdded, hideExplicit = false, initialView = 'browse' }: PackMixerProps) {
  const [view, setView] = useState<View>(initialView);
  const [custom, refresh] = useCustomPacks();

  const allPacks = useMemo(() => [...custom, ...PACKS], [custom]);

  const onAdd = (pack: Pack) => {
    refresh();
    onAdded?.(pack);
  };

  const onRemove = (id: string) => {
    removeCustomPack(id);
    if (selectedIds.includes(id)) onToggle(id);
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl<View>
        aria-label="Pack source"
        size="sm"
        fullWidth
        value={view}
        onChange={setView}
        options={[
          { value: 'browse', label: `Browse ${PACKS.length} packs`, icon: <Library /> },
          { value: 'custom', label: custom.length > 0 ? `Your packs · ${custom.length}` : 'Build your own', icon: <Sparkles /> },
        ]}
      />

      {view === 'browse' ? (
        <PackGrid packs={allPacks} selectedIds={selectedIds} onToggle={onToggle} hideSummary hideExplicit={hideExplicit} maxTags={10} />
      ) : (
        <div className="flex flex-col gap-5">
          <CustomPackTools onAdd={onAdd} />
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Your packs</h3>
            <CustomPackList packs={custom} selectedIds={selectedIds} onToggle={onToggle} onRemove={onRemove} />
          </div>
        </div>
      )}
    </div>
  );
}
