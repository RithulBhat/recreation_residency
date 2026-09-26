import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { GameSettings } from '@/types';
import { PRESETS, type Preset } from '@/game/presets';
import { Chip } from '@/components/ui/Chip';
import { Tooltip } from '@/components/ui/Tooltip';
import { useSettingsStore } from '@/store/settingsStore';

/** Keys that reflect the preset itself (players/modifiers are personal or randomized). */
const IGNORED_KEYS: ReadonlySet<string> = new Set(['players', 'modifiers']);

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when every value the preset sets is what the draft currently has. */
export function presetMatches(preset: Preset, settings: GameSettings): boolean {
  return (Object.entries(preset.settings) as Array<[keyof GameSettings, unknown]>).every(
    ([key, value]) => IGNORED_KEYS.has(key) || sameValue(settings[key], value),
  );
}

/** Preset chips: tap to apply. The one matching the current draft is highlighted. */
export function PresetRow() {
  const settings = useSettingsStore((s) => s.settings);
  const applyPreset = useSettingsStore((s) => s.applyPreset);
  const [lastApplied, setLastApplied] = useState<string | null>(null);

  const active = useMemo(() => PRESETS.find((p) => presetMatches(p, settings)), [settings]);
  const shown = active ?? (lastApplied ? PRESETS.find((p) => p.id === lastApplied) : undefined);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
        <Sparkles className="size-3.5" aria-hidden />
        Quick presets
      </div>
      <div className="scrollbar-none -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <Tooltip key={p.id} content={p.blurb}>
            <Chip
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
          </Tooltip>
        ))}
      </div>
      <p className="min-h-4 text-xs text-muted" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-fg">{shown.name}</span>
            {' — '}
            {shown.blurb}
            {shown.randomizeModifiers && ' Re-rolls the modifiers every tap.'}
          </>
        ) : (
          'Tap a preset to apply it. Your packs, difficulty and players stay as they are.'
        )}
      </p>
    </div>
  );
}
