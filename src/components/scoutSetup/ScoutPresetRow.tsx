import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ScoutPreset } from '@/scout/packs';
import { ALL_SCOUT_PRESETS } from '@/scout/presets';
import { useScoutSettingsStore } from '@/store/scoutStore';
import type { ScoutSettings } from '@/scout/types';
import { Chip } from '@/components/ui/Chip';
import { SCOUT_FORMAT_ACCENT, scoutFormatName } from './summary';

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when every value the preset sets is what the draft currently has. */
export function scoutPresetMatches(preset: ScoutPreset, settings: ScoutSettings): boolean {
  return (Object.entries(preset.settings) as Array<[keyof ScoutSettings, unknown]>).every(([key, value]) =>
    sameValue(settings[key], value),
  );
}

/**
 * Preset chips: tap to apply. One flat row over `ALL_SCOUT_PRESETS` — the puzzle-type presets that
 * shipped first (Silhouette Sprint, Mixed Bag, Sicko Mode…) and the SESSION FORMAT presets (Sixty
 * Second Scout, Last Man Standing, Around the League, Film Room Duel, Pass the Laptop), because from
 * the player's side they are the same offer: one tap, a whole run set up.
 *
 * The chip carries the preset's own emoji and is tinted by the FORMAT it sets, so the blitz ones read
 * as blitz before you read the label. The one matching the draft is highlighted.
 */
export function ScoutPresetRow() {
  const settings = useScoutSettingsStore((s) => s.settings);
  const applyPreset = useScoutSettingsStore((s) => s.applyPreset);
  const [lastApplied, setLastApplied] = useState<string | null>(null);

  const active = useMemo(() => ALL_SCOUT_PRESETS.find((p) => scoutPresetMatches(p, settings)), [settings]);
  const shown = active ?? (lastApplied ? ALL_SCOUT_PRESETS.find((p) => p.id === lastApplied) : undefined);

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
        data-testid="scout-presets"
      >
        {ALL_SCOUT_PRESETS.map((p) => {
          // Only the FORMAT presets set a format; a puzzle-type preset leaves whatever is selected
          // alone, so it gets no format dot and claims none in its label.
          const format = p.settings.format;
          return (
            <Chip
              key={p.id}
              size="sm"
              selected={active?.id === p.id}
              color={format ? SCOUT_FORMAT_ACCENT[format] : undefined}
              onClick={() => {
                applyPreset(p.id);
                setLastApplied(p.id);
              }}
              aria-label={
                format ? `${p.name} preset — ${scoutFormatName(format)}: ${p.blurb}` : `${p.name} preset: ${p.blurb}`
              }
              icon={<span aria-hidden>{p.emoji}</span>}
              data-preset={p.id}
            >
              {p.name}
            </Chip>
          );
        })}
      </div>
      <p className="min-h-4 text-xs text-muted" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-fg">{shown.name}</span>
            {' — '}
            {shown.blurb}
          </>
        ) : (
          'Tap a preset to set the format, the puzzle type, the packs and the rules in one go.'
        )}
      </p>
    </div>
  );
}
