import { Dices, RotateCcw } from 'lucide-react';
import type { Speed } from '@/types';
import { LIMITS, NEUTRAL_MODIFIERS, randomModifiers } from '@/game/presets';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { useSettingsStore } from '@/store/settingsStore';
import { SettingRow } from './SettingRow';
import { modifierLabels, pitchLabel } from './summary';

const SPEEDS: readonly Speed[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Speed, reverse, lo-fi, bitcrush, pitch — plus "Surprise me" and reset. */
export function ModifierSettings() {
  const modifiers = useSettingsStore((s) => s.settings.modifiers);
  const update = useSettingsStore((s) => s.update);
  const set = (patch: Partial<typeof modifiers>) => update({ modifiers: { ...modifiers, ...patch } });
  const active = modifierLabels(modifiers);

  return (
    <div className="flex flex-col gap-5">
      <SettingRow label="Speed" hint="Playback rate. Pitch follows unless you correct it below." stack>
        <SegmentedControl<string>
          aria-label="Playback speed"
          size="sm"
          fullWidth
          value={String(modifiers.speed)}
          onChange={(v) => set({ speed: Number(v) as Speed })}
          options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))}
        />
      </SettingRow>

      <div className="grid gap-4 sm:grid-cols-3 sm:gap-3">
        <Switch label="Reverse" description="Play it backwards." checked={modifiers.reverse} onChange={(reverse) => set({ reverse })} className="sm:flex-col sm:items-start sm:gap-2" />
        <Switch label="Lo-fi" description="Muffled, like through a wall." checked={modifiers.lofi} onChange={(lofi) => set({ lofi })} className="sm:flex-col sm:items-start sm:gap-2" />
        <Switch label="Bitcrush" description="Crunchy 8-bit texture." checked={modifiers.bitcrush} onChange={(bitcrush) => set({ bitcrush })} className="sm:flex-col sm:items-start sm:gap-2" />
      </div>

      <Slider
        label="Pitch"
        value={modifiers.pitch}
        onChange={(pitch) => set({ pitch: Math.round(pitch) })}
        min={LIMITS.pitch.min}
        max={LIMITS.pitch.max}
        step={1}
        format={(v) => `${v > 0 ? '+' : ''}${v} st · ${pitchLabel(v)}`}
        presets={[-12, -5, 0, 5, 12]}
        presetFormat={(v) => (v === 0 ? 'normal' : v < 0 ? (v <= -7 ? 'demon' : 'lower') : v >= 7 ? 'chipmunk' : 'higher')}
        ticks
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" leadingIcon={<Dices />} onClick={() => update({ modifiers: randomModifiers() })}>
          Surprise me
        </Button>
        <button
          type="button"
          onClick={() => update({ modifiers: { ...NEUTRAL_MODIFIERS } })}
          disabled={active.length === 0}
          className="touch-hit-44 inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Reset modifiers
        </button>
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {active.length === 0 ? 'Sounds normal' : active.join(' · ')}
        </span>
      </div>
    </div>
  );
}
