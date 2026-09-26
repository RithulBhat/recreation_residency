import { Layers, Timer } from 'lucide-react';
import type { ClipMode } from '@/types';
import { LIMITS, clipLengthPresets } from '@/game/presets';
import { ClipLengthSlider } from '@/components/ui/Slider';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { Switch } from '@/components/ui/Switch';
import { useSettingsStore } from '@/store/settingsStore';
import { StageEditor } from './StageEditor';

/** Clip mode + the fixed-length slider / escalating stage editor. */
export function ClipSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const { mode, clipMode } = settings;

  const onClipMode = (next: ClipMode) => {
    if (next === clipMode) return;
    // Classic and Fixed are the same game with the other clip mode — flip between them so the
    // control never appears to "bounce back" (normalizeSettings pins classic → escalating).
    // Escalating derives `tries` from the stage count (often 7); start Fixed from its own default.
    if (next === 'fixed' && mode === 'classic') update({ mode: 'fixed', clipMode: 'fixed', tries: 3 });
    else if (next === 'escalating' && mode === 'fixed') update({ mode: 'classic', clipMode: 'escalating' });
    else update({ clipMode: next });
  };

  const hint =
    mode === 'blitz'
      ? 'Blitz always plays one clip length per song.'
      : mode === 'classic' || mode === 'fixed'
        ? 'Switching flips between Classic and Fixed clip mode.'
        : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SegmentedControl<ClipMode>
          aria-label="Clip mode"
          fullWidth
          value={clipMode}
          onChange={onClipMode}
          options={[
            { value: 'fixed', label: 'Fixed clip', icon: <Timer /> },
            {
              value: 'escalating',
              // The full label does not fit next to "Fixed clip" on 320 px screens.
              label: (
                <>
                  <span className="max-[359px]:hidden">Escalating stages</span>
                  <span className="min-[360px]:hidden">Stages</span>
                </>
              ),
              'aria-label': 'Escalating stages',
              icon: <Layers />,
              disabled: mode === 'blitz',
            },
          ]}
        />
        {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
      </div>

      {clipMode === 'fixed' ? (
        <>
          <ClipLengthSlider
            value={settings.clipLength}
            onChange={(clipLength) => update({ clipLength })}
            presets={[...clipLengthPresets]}
            min={LIMITS.clipLength.min}
            max={LIMITS.clipLength.max}
          />
          {mode !== 'blitz' && (
            <Stepper
              label="Tries per song"
              description="Every miss costs points; the clip stays the same length."
              value={settings.tries}
              onChange={(tries) => update({ tries })}
              min={LIMITS.triesFixed.min}
              max={LIMITS.triesFixed.max}
              aria-label="Tries per song"
            />
          )}
        </>
      ) : (
        <StageEditor stages={settings.stages} onChange={(stages) => update({ stages })} />
      )}

      <Switch
        label="Replay the same moment"
        description="Every try starts at the same offset. Off = a fresh random spot each try."
        checked={settings.sameStartEachTry}
        onChange={(sameStartEachTry) => update({ sameStartEachTry })}
      />
    </div>
  );
}
