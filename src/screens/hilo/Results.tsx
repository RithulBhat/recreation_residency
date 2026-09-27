import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { RotateCcw, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { formatCompact } from '@/arcade/units';
import { useHiloStore } from '@/hilo/store';
import { HILO } from '@/hilo/routes';
import { measureFor } from '@/hilo/measure';

export default function HiloResults() {
  const navigate = useNavigate();
  const { state, start } = useHiloStore();

  useEffect(() => {
    if (state.rounds.length === 0 && state.status !== 'finished') {
      navigate(HILO.setup, { replace: true });
    }
  }, [state.rounds.length, state.status, navigate]);

  const correct = state.rounds.filter((r) => r.outcome === 'correct').length;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card padding="lg" className="flex flex-col items-center gap-2 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Final score</span>
        <NumberTicker value={state.totalScore} className="font-display text-5xl font-bold text-accent" />
        <p className="text-sm text-muted">
          {correct} right of {state.rounds.length} · best streak {state.bestStreak}
        </p>
        {state.exhausted && (
          <Badge tone="warn" size="sm">
            The packs ran out of fresh pairs
          </Badge>
        )}
      </Card>

      <ul className="flex flex-col gap-2">
        {state.rounds.map((r, i) => (
          <li key={`${r.to.id}-${i}`}>
            <Card padding="md" className="flex items-center gap-3">
              <Badge
                tone={r.outcome === 'correct' ? 'success' : r.outcome === 'skipped' ? 'neutral' : 'danger'}
                size="sm"
              >
                {r.outcome === 'correct' ? '✓' : r.outcome === 'skipped' ? '–' : '✕'}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">
                  {r.from.name} → <span className="font-semibold">{r.to.name}</span>
                </p>
                <p className="font-mono text-xs text-muted">
                  {formatCompact(r.from.value, r.from.unit)} → {formatCompact(r.to.value, r.to.unit)} ·{' '}
                  {measureFor(r.to)}
                </p>
              </div>
              {r.doubled && (
                <Badge tone="warn" size="sm">
                  2×
                </Badge>
              )}
              <span className="w-12 shrink-0 text-right font-mono text-sm text-fg">{r.score}</span>
            </Card>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button
          fullWidth
          size="lg"
          leadingIcon={<RotateCcw />}
          onClick={() => {
            start();
            navigate(HILO.play);
          }}
        >
          Play again
        </Button>
        <Button fullWidth size="lg" variant="ghost" leadingIcon={<Settings2 />} to={HILO.setup}>
          Change setup
        </Button>
      </div>
    </div>
  );
}
