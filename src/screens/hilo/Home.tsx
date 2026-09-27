import { CalendarDays, Play, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { R } from '@/routes';
import { HILO_PACKS } from '@/data/hilo';
import { PRESETS } from '@/hilo/settings';
import { provenanceLine, summarizeProvenance } from '@/arcade/provenance';

const PROVENANCE = summarizeProvenance(HILO_PACKS);
const ITEMS = HILO_PACKS.reduce((n, p) => n + p.items.length, 0);

export default function HiloHome() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="text-5xl leading-none" aria-hidden>
          📈
        </span>
        <h1 className="font-display text-4xl font-bold text-fg">Higher or Lower</h1>
        <p className="max-w-md text-sm text-muted">
          One number is shown, the other is hidden. Say which way it goes and keep the chain
          alive.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="xl" fullWidth to={R.hilo.setup} leadingIcon={<Play className="fill-current" />}>
          Play
        </Button>
        <Button size="xl" fullWidth variant="secondary" to={R.hilo.daily} leadingIcon={<CalendarDays />}>
          Daily
        </Button>
        <Button size="xl" fullWidth variant="secondary" to={R.hilo.party} leadingIcon={<Users />}>
          Party
        </Button>
      </div>

      <Card padding="lg" className="flex flex-col gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Packs</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {HILO_PACKS.map((p) => (
            <li key={p.id} className="flex items-start gap-3 rounded-2xl bg-surface px-3 py-2">
              <span className="text-xl leading-none" aria-hidden>
                {p.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{p.name}</p>
                <p className="text-xs text-muted">{p.tagline}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

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
        {ITEMS.toLocaleString()} figures, every one of them sourced.{' '}
        {provenanceLine(PROVENANCE, 3)}.
      </p>
    </div>
  );
}
