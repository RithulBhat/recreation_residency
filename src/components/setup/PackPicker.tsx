import { useMemo, useState } from 'react';
import { Library, X } from 'lucide-react';
import type { Pack } from '@/types';
import { getPack } from '@/lib/catalog';
import { loadCustomPacks } from '@/lib/customPacks';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/components/ui/cn';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useSettingsStore } from '@/store/settingsStore';
import { PackMixer } from './PackMixer';
import { poolEstimate } from './summary';

/** Resolve pack ids to packs (custom ones included), dropping unknown ids. */
export function resolvePacks(ids: readonly string[]): Pack[] {
  loadCustomPacks();
  return ids.map((id) => getPack(id)).filter((p): p is Pack => p !== undefined);
}

/** Selected packs as removable chips + the "Mix packs" sheet / inline panel. */
export function PackPicker() {
  const packIds = useSettingsStore((s) => s.settings.packIds);
  const explicitFilter = useSettingsStore((s) => s.settings.explicitFilter);
  const update = useSettingsStore((s) => s.update);
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const packs = useMemo(() => resolvePacks(packIds), [packIds]);
  const songs = poolEstimate(packs.map((p) => p.approxSize));

  const toggle = (id: string) => {
    if (packIds.includes(id)) {
      if (packIds.length <= 1) return; // keep at least one
      update({ packIds: packIds.filter((x) => x !== id) });
    } else {
      update({ packIds: [...packIds, id] });
    }
  };
  const select = (id: string) => {
    if (!packIds.includes(id)) update({ packIds: [...packIds, id] });
  };

  const mixer = (
    <PackMixer selectedIds={packIds} onToggle={toggle} onAdded={(p) => select(p.id)} hideExplicit={explicitFilter} />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="list" aria-label="Selected packs">
        {packs.map((p) => (
          <span
            key={p.id}
            role="listitem"
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border pl-2.5 pr-1 text-sm font-semibold text-fg"
            style={{ background: `color-mix(in oklab, ${p.accent} 22%, var(--sg-surface))` }}
          >
            <span aria-hidden>{p.emoji}</span>
            <span className="max-w-[10rem] truncate">{p.name}</span>
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              disabled={packs.length <= 1}
              onClick={() => toggle(p.id)}
              className="touch-hit-44 grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-black/20 hover:text-fg disabled:opacity-30"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        {packs.length === 0 && <span className="text-sm text-muted">No packs yet — add at least one.</span>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs tabular text-muted" aria-live="polite">
          {packs.length} pack{packs.length === 1 ? '' : 's'}
          {songs > 0 && (
            <>
              {' · '}
              <span className="text-fg">~{songs.toLocaleString()}</span> songs in the mix
            </>
          )}
        </p>
        <Button
          size="sm"
          variant={open && !mobile ? 'primary' : 'secondary'}
          leadingIcon={<Library />}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={mobile ? undefined : 'pack-mixer-panel'}
        >
          {open && !mobile ? 'Done' : 'Mix packs'}
        </Button>
      </div>

      {mobile ? (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title="Mix packs"
          description="Tap to add or remove. Mixed packs share one pool."
          side="bottom"
          footer={
            <>
              <span className="mr-auto font-mono text-xs tabular text-muted">
                {packs.length} pack{packs.length === 1 ? '' : 's'}
                {songs > 0 ? ` · ~${songs.toLocaleString()} songs` : ''}
              </span>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </>
          }
        >
          {mixer}
        </Sheet>
      ) : (
        <div id="pack-mixer-panel" hidden={!open} className={cn('rounded-2xl border border-border bg-bg/40 p-3 sm:p-4', open && 'animate-fade-in')}>
          {open && mixer}
        </div>
      )}
    </div>
  );
}
