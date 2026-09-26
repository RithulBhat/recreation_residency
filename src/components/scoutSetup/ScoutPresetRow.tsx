import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SCOUT_PRESETS, type ScoutPreset } from '@/scout/packs';
import { useScoutSettingsStore } from '@/store/scoutStore';
import type { ScoutSettings } from '@/scout/types';
import { Chip } from '@/components/ui/Chip';

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when every value the preset sets is what the draft currently has. */
export function scoutPresetMatches(preset: ScoutPreset, settings: ScoutSettings): boolean {
  return (Object.entries(preset.settings) as Array<[keyof ScoutSettings, unknown]>).every(([key, value]) =>
    sameValue(settings[key], value),
  );
}

/** Preset chips: tap to apply. The one matching the draft is highlighted. */
export function ScoutPresetRow() {
  const settings = useScoutSettingsStore((s) => s.settings);
  const applyPreset = useScoutSettingsStore((s) => s.applyPreset);
  const [lastApplied, setLastApplied] = useState<string | null>(null);

  const active = useMemo(() => SCOUT_PRESETS.find((p) => scoutPresetMatches(p, settings)), [settings]);
  const shown = active ?? (lastApplied ? SCOUT_PRESETS.find((p) => p.id === lastApplied) : undefined);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
        <Sparkles className="size-3.5" aria-hidden />
        Quick presets
      </div>
      <div
        className="scrollbar-none -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0"
        role="group"
        aria-label="Presets"
      >
        {SCOUT_PRESETS.map((p) => (
          <Chip
            key={p.id}
            size="md"
            selected={active?.id === p.id}
            onClick={() => {
              applyPreset(p.id);
              setLastApplied(p.id);
            }}
            aria-label={`${p.name} preset: ${p.blurb}`}
            icon={<span aria-hidden>{p.emoji}</span>}
          >
            {p.name}
          </Chip>
        ))}
      </div>
      <p className="min-h-4 text-xs text-muted" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-fg">{shown.name}</span>
            {' — '}
            {shown.blurb}
          </>
        ) : (
          'Tap a preset to set the mode, packs and rules in one go.'
        )}
      </p>
    </div>
  );
}
