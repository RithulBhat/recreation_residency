import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { Switch } from '@/components/ui/Switch';
import { feasibleDifficulties } from '@/arcade/pairing';
import { createRng } from '@/game/rng';
import { HILO_PACKS } from '@/data/hilo';
import { resolveRunPool } from '@/hilo/pool';
import { measureFor } from '@/hilo/measure';
import { useHiloStore } from '@/hilo/store';
import { R } from '@/routes';
import {
  DIFFICULTY_BLURB,
  FORMAT_BLURB,
  FORMAT_LABEL,
  HILO_DIFFICULTIES,
  HILO_FORMATS,
  PRESETS,
  reconcile,
} from '@/hilo/settings';
import type { HiloDifficulty, HiloFormat, StreakCurve } from '@/hilo/types';

export default function HiloSetup() {
  const navigate = useNavigate();
  const { settings, setSettings, start } = useHiloStore();
  const [local, setLocal] = useState(settings);

  const update = (patch: Partial<typeof local>) => setLocal(reconcile({ ...local, ...patch }));

  /**
   * Which difficulties the CHOSEN packs can actually deliver.
   *
   * A band a pack cannot satisfy makes the hardest setting silently play like the easiest —
   * measured at 100% degradation on a pool spaced wider than the band. Offering it anyway and
   * quietly substituting is worse than not offering it: the player concludes the game is broken
   * rather than the pack.
   */
  const run = useMemo(
    () => resolveRunPool(local.packIds, createRng(local.seed)),
    [local.packIds, local.seed],
  );

  const offered = useMemo(() => {
    const list = feasibleDifficulties(run.items);
    return list.length > 0 ? list : (['easy'] as const);
  }, [run.items]);

  const togglePack = (id: string) => {
    const has = local.packIds.includes(id);
    const packIds = has ? local.packIds.filter((p) => p !== id) : [...local.packIds, id];
    const can = feasibleDifficulties(resolveRunPool(packIds, createRng(local.seed)).items);
    // Drop to something the new selection can serve rather than leaving a dead setting selected.
    const difficulty = can.includes(local.difficulty) ? local.difficulty : (can[0] ?? 'easy');
    update({ packIds, difficulty });
  };

  const begin = () => {
    setSettings(local);
    start(local);
    navigate(R.hilo.play);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-fg">Higher or Lower</h1>
        <p className="text-sm text-muted">
          One number is shown, the other is hidden. Say which way it goes and keep the chain alive.
        </p>
      </header>

      <section className="flex flex-col gap-2" aria-labelledby="hilo-presets">
        <h2 id="hilo-presets" className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
          Presets
        </h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Chip key={p.id} onClick={() => setLocal(p.settings)} icon={<span aria-hidden>{p.emoji}</span>}>
              {p.name}
            </Chip>
          ))}
        </div>
      </section>

      <Card padding="lg" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Format</span>
          <SegmentedControl<HiloFormat>
            fullWidth
            size="sm"
            value={local.format}
            onChange={(format) => update({ format })}
            options={HILO_FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
          />
          <p className="text-xs text-muted">{FORMAT_BLURB[local.format]}</p>
        </div>

        {local.format === 'lives' && (
          <Stepper label="Lives" value={local.lives} onChange={(lives) => update({ lives })} min={1} max={5} />
        )}
        {local.format === 'timed' && (
          <Stepper
            label="Seconds"
            value={local.duration}
            onChange={(duration) => update({ duration })}
            min={15}
            max={300}
            step={15}
            format={(v) => `${v}s`}
          />
        )}
        {local.format === 'rounds' && (
          <Stepper label="Rounds" value={local.rounds} onChange={(rounds) => update({ rounds })} min={3} max={100} />
        )}

        <section className="flex flex-col gap-2" aria-labelledby="hilo-packs">
          <h2 id="hilo-packs" className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            Packs
          </h2>
          <div className="flex flex-wrap gap-2">
            {HILO_PACKS.map((p) => (
              <Chip
                key={p.id}
                check
                selected={local.packIds.length === 0 || local.packIds.includes(p.id)}
                onClick={() => togglePack(p.id)}
                count={p.items.length}
                icon={<span aria-hidden>{p.emoji}</span>}
              >
                {p.name}
              </Chip>
            ))}
          </div>
          {run.items.length > 0 && (
            <p className="text-xs text-muted">
              This run is about{' '}
              <strong className="text-fg">{measureFor(run.items[0])}</strong> —{' '}
              {run.packs.map((p) => p.name).join(', ')}.
            </p>
          )}
          {run.droppedPacks.length > 0 && (
            <p className="text-xs text-warn">
              {run.droppedPacks.map((p) => p.name).join(', ')} measure something else, so they sit
              this run out. A round comparing a chart position to a population would not be a
              question anyone could answer.
            </p>
          )}
        </section>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            Difficulty
          </span>
          <SegmentedControl<HiloDifficulty>
            fullWidth
            value={local.difficulty}
            onChange={(difficulty) => update({ difficulty })}
            options={HILO_DIFFICULTIES.map((d) => ({
              value: d,
              label: d[0].toUpperCase() + d.slice(1),
              disabled: !offered.includes(d),
            }))}
          />
          <p className="text-xs text-muted">{DIFFICULTY_BLURB[local.difficulty]}</p>
          {offered.length < HILO_DIFFICULTIES.length && (
            <p className="text-xs text-warn">
              These packs cannot separate values finely enough for every difficulty, so the ones
              they cannot honour are disabled rather than quietly playing easier.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Streak</span>
          <SegmentedControl<StreakCurve>
            fullWidth
            size="sm"
            value={local.streakCurve}
            onChange={(streakCurve) => update({ streakCurve })}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'gentle', label: 'Gentle' },
              { value: 'steep', label: 'Steep' },
            ]}
          />
        </div>

        <Switch
          checked={local.exactValues}
          onChange={(exactValues) => update({ exactValues })}
          label="Show exact figures"
          description="Off rounds the known value, which makes close calls harder."
        />
        <Switch
          checked={local.allowSame}
          onChange={(allowSame) => update({ allowSame })}
          disabled={local.difficulty === 'insane'}
          label={'Offer a "too close to call" button'}
          description={
            local.difficulty === 'insane'
              ? 'Not on this difficulty — nearly every pair would qualify.'
              : 'A third answer when the two values are within 2% of each other.'
          }
        />
      </Card>

      <Button size="xl" fullWidth leadingIcon={<Play className="fill-current" />} onClick={begin}>
        Start the chain
      </Button>
    </div>
  );
}
