import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { Switch } from '@/components/ui/Switch';
import { PRICE_PACKS } from '@/data/price';
import { usePriceStore } from '@/price/store';
import { PRICE } from '@/price/routes';
import { PRESETS, reconcile } from '@/price/settings';
import type { PriceDifficulty, PriceScoring } from '@/price/types';

export default function PriceSetup() {
  const navigate = useNavigate();
  const { settings, setSettings, start } = usePriceStore();
  const [local, setLocal] = useState(settings);

  // Every edit goes through reconcile, so the screen can never show a combination the engine
  // would silently override — the settings you see are the settings you get.
  const update = (patch: Partial<typeof local>) => setLocal(reconcile({ ...local, ...patch }));

  const togglePack = (id: string) => {
    const has = local.packIds.includes(id);
    update({ packIds: has ? local.packIds.filter((p) => p !== id) : [...local.packIds, id] });
  };

  const begin = () => {
    setSettings(local);
    start(local);
    navigate(PRICE.play);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-fg">Price Guess</h1>
        <p className="text-sm text-muted">
          Guess what it costs. Closest wins. Every price here is an estimate, not a sourced figure.
        </p>
      </header>

      <section className="flex flex-col gap-2" aria-labelledby="price-presets">
        <h2 id="price-presets" className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
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
        <section className="flex flex-col gap-2" aria-labelledby="price-packs">
          <h2 id="price-packs" className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            Packs
          </h2>
          <div className="flex flex-wrap gap-2">
            {PRICE_PACKS.map((p) => (
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
          {local.packIds.length === 0 && (
            <p className="text-xs text-muted">Nothing selected, so everything is in play.</p>
          )}
        </section>

        <Stepper
          label="Rounds"
          value={local.rounds}
          onChange={(rounds) => update({ rounds })}
          min={1}
          max={50}
        />

        <Stepper
          label="Timer"
          description="Seconds per round. Zero turns the clock off."
          value={local.timer}
          onChange={(timer) => update({ timer })}
          min={0}
          max={120}
          step={5}
          format={(v) => (v === 0 ? 'Off' : `${v}s`)}
        />

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            Difficulty
          </span>
          <SegmentedControl<PriceDifficulty>
            fullWidth
            value={local.difficulty}
            onChange={(difficulty) => update({ difficulty })}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
              { value: 'chaos', label: 'Chaos' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            Scoring
          </span>
          <SegmentedControl<PriceScoring>
            fullWidth
            value={local.scoring}
            onChange={(scoring) => update({ scoring })}
            options={[
              { value: 'closeness', label: 'Closeness' },
              { value: 'priceIsRight', label: 'Without going over' },
            ]}
          />
        </div>

        <Switch
          checked={local.streakMultiplier}
          onChange={(streakMultiplier) => update({ streakMultiplier })}
          label="Streak multiplier"
          description="Consecutive good guesses are worth more, up to +50%."
        />

        <Switch
          checked={local.speedBonus}
          onChange={(speedBonus) => update({ speedBonus })}
          disabled={local.timer === 0}
          label="Speed bonus"
          description={
            local.timer === 0
              ? 'Needs a timer — there is no clock to beat.'
              : 'Up to 25% more for answering quickly.'
          }
        />
      </Card>

      <Button size="xl" fullWidth leadingIcon={<Play className="fill-current" />} onClick={begin}>
        Start guessing
      </Button>
    </div>
  );
}
