import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { LIMITS } from '@/game/presets';
import { ClipLengthSlider, formatClip } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { stagesSentence } from './summary';

export const STAGE_OPTIONS: readonly number[] = [0.1, 0.25, 0.5, 1, 2, 3, 5, 7, 10, 15];
export const MIN_STAGES = 2;

export interface StageEditorProps {
  stages: readonly number[];
  onChange: (stages: number[]) => void;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** Toggleable stage chips (kept sorted, 2–8) plus a slider to add any custom length. */
export function StageEditor({ stages, onChange }: StageEditorProps) {
  const [custom, setCustom] = useState(0.75);
  const atMax = stages.length >= LIMITS.maxStages;
  const atMin = stages.length <= MIN_STAGES;

  const options = useMemo(() => {
    const all = [...STAGE_OPTIONS];
    for (const s of stages) if (!all.some((o) => near(o, s))) all.push(s);
    return all.sort((a, b) => a - b);
  }, [stages]);

  const isOn = (v: number) => stages.some((s) => near(s, v));

  const toggle = (v: number) => {
    if (isOn(v)) {
      if (atMin) return;
      onChange(stages.filter((s) => !near(s, v)));
    } else {
      if (atMax) return;
      onChange([...stages, v].sort((a, b) => a - b));
    }
  };

  const customOn = isOn(custom);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-fg">Stages</span>
          <span className="font-mono text-[11px] tabular text-muted">
            {stages.length} of {LIMITS.maxStages} · min {MIN_STAGES}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Clip stages">
          {options.map((v) => {
            const on = isOn(v);
            const disabled = on ? atMin : atMax;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                aria-label={`${formatClip(v)} stage`}
                data-stage={v}
                disabled={disabled}
                onClick={() => toggle(v)}
                className={cn(
                  'h-10 min-w-12 rounded-full border px-3 font-mono text-sm font-semibold tabular transition-[background-color,border-color,color,transform] active:scale-95 disabled:cursor-not-allowed',
                  on
                    ? 'border-transparent bg-accent text-accent-fg shadow-glow disabled:opacity-80'
                    : 'border-border bg-surface text-muted hover:bg-surface-strong hover:text-fg disabled:opacity-40',
                )}
              >
                {formatClip(v)}
              </button>
            );
          })}
        </div>
      </div>

      <p className="rounded-2xl bg-surface px-3.5 py-2.5 text-sm text-fg" aria-live="polite" data-testid="stage-preview">
        {stagesSentence(stages)}
      </p>

      <div className="rounded-2xl border border-dashed border-border-strong p-3.5">
        <ClipLengthSlider
          label="Custom stage"
          value={custom}
          onChange={setCustom}
          compact
          min={0.1}
          max={LIMITS.stage.max}
          presets={[]}
        />
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          leadingIcon={<Plus />}
          disabled={atMax || customOn}
          onClick={() => toggle(custom)}
        >
          {customOn ? `${formatClip(custom)} already in` : `Add ${formatClip(custom)} stage`}
        </Button>
      </div>
    </div>
  );
}
