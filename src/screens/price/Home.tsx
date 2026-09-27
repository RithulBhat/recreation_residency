import { CalendarDays, Play, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { R } from '@/routes';
import { PRICE_PACKS } from '@/data/price';
import { PRESETS } from '@/price/settings';
import { summarizeProvenance, approximateNote } from '@/arcade/provenance';

const PROVENANCE = summarizeProvenance(PRICE_PACKS);
const ITEMS = PRICE_PACKS.reduce((n, p) => n + p.items.length, 0);

export default function PriceHome() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="text-5xl leading-none" aria-hidden>
          💸
        </span>
        <h1 className="font-display text-4xl font-bold text-fg">Price Guess</h1>
        <p className="max-w-md text-sm text-muted">
          Guess what it costs. Closest wins — or closest without going over, if you like living
          dangerously.
        </p>
        <Badge tone="warn" size="sm">
          {approximateNote(PROVENANCE, 'Prices')}
        </Badge>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="xl" fullWidth to={R.price.setup} leadingIcon={<Play className="fill-current" />}>
          Play
        </Button>
        <Button size="xl" fullWidth variant="secondary" to={R.price.daily} leadingIcon={<CalendarDays />}>
          Daily
        </Button>
        <Button size="xl" fullWidth variant="secondary" to={R.price.party} leadingIcon={<Users />}>
          Party
        </Button>
      </div>

      <Card padding="lg" className="flex flex-col gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Presets</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <li key={p.id} className="flex items-start gap-3 rounded-2xl bg-surface px-3 py-2">
              <span className="text-xl leading-none" aria-hidden>
                {p.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{p.name}</p>
                <p className="text-xs text-muted">{p.blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-center text-xs text-muted">
        {ITEMS} items across {PRICE_PACKS.length} packs. Every price is an author estimate, not a
        sourced figure — the games that use real data say so on their own pages.
      </p>
    </div>
  );
}
