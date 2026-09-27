import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarDays, Play } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ShareButton } from '@/components/arcade/ShareButton';
import { todayISO } from '@/game/challenge';
import { dailySeedFor, readDaily, secondsUntilTomorrow } from '@/arcade/daily';
import { usePriceStore } from '@/price/store';
import { PRICE } from '@/price/routes';
import { presetById } from '@/price/settings';

function countdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function PriceDaily() {
  const navigate = useNavigate();
  const { start, setSettings } = usePriceStore();
  const date = todayISO();
  const [record, setRecord] = useState(() => readDaily('price'));
  const [left, setLeft] = useState(() => secondsUntilTomorrow());

  useEffect(() => {
    const id = window.setInterval(() => setLeft(secondsUntilTomorrow()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setRecord(readDaily('price'));
  }, [date]);

  const done = record?.date === date;

  const settings = useMemo(() => {
    const preset = presetById('daily');
    return { ...(preset?.settings ?? {}), seed: dailySeedFor('price', date) } as ReturnType<
      typeof usePriceStore.getState
    >['settings'];
  }, [date]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
        <Badge tone="accent" icon={<CalendarDays />}>
          {date}
        </Badge>
        <h1 className="font-display text-2xl font-bold text-fg">Price Guess — Daily</h1>
        <p className="text-sm text-muted">
          Six items, one attempt, the same for everyone today.
        </p>

        {done ? (
          <>
            <p className="font-mono text-3xl font-bold text-accent">
              {record.score.toLocaleString()}
            </p>
            {record.marks && (
              <pre className="text-lg leading-tight" aria-label="Your result grid">
                {record.marks}
              </pre>
            )}
            <p className="text-xs text-muted">Next daily in {countdown(left)}</p>
            <ShareButton
              className="w-full"
              card={{
                title: `Price Guess — Daily ${date}`,
                subtitle: `${record.score.toLocaleString()} points`,
                marks: [],
                url: window.location.origin + window.location.pathname,
              }}
            />
          </>
        ) : (
          <Button
            size="xl"
            fullWidth
            leadingIcon={<Play className="fill-current" />}
            onClick={() => {
              setSettings(settings);
              start(settings);
              navigate(PRICE.play);
            }}
          >
            Play today&rsquo;s run
          </Button>
        )}
      </Card>

      <p className="text-center text-xs text-muted">
        Every price is an author estimate, not a sourced figure.
      </p>
    </div>
  );
}
