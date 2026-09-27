import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { RotateCcw, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { formatValue, relativeError } from '@/arcade/units';
import { describeMiss } from '@/price/miss';
import { usePriceStore } from '@/price/store';
import { PRICE } from '@/price/routes';
import { ShareButton } from '@/components/arcade/ShareButton';
import { shareCard } from '@/price/share';
import { gridOf } from '@/arcade/share';
import { writeDaily } from '@/arcade/daily';
import { todayISO } from '@/game/challenge';

export default function PriceResults() {
  const navigate = useNavigate();
  const { state, start } = usePriceStore();

  useEffect(() => {
    if (state.rounds.length === 0) navigate(PRICE.setup, { replace: true });
  }, [state.rounds.length, navigate]);

  const daily = state.settings.seed?.startsWith('price-daily-') ? todayISO() : undefined;
  const card = shareCard(state, {
    daily,
    url: window.location.origin + window.location.pathname,
  });

  // A finished daily is remembered so it can be re-shared without replaying it.
  useEffect(() => {
    if (!daily || state.status !== 'finished') return;
    writeDaily('price', { date: daily, score: state.totalScore, marks: gridOf(card.marks) });
  }, [daily, state.status, state.totalScore, card.marks]);

  if (state.rounds.length === 0) return null;

  const played = state.rounds.filter((r) => r.verdict !== null);
  const sharp = played.filter((r) => r.verdict === 'exact' || r.verdict === 'close').length;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card padding="lg" className="flex flex-col items-center gap-2 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Final score</span>
        <NumberTicker
          value={state.totalScore}
          className="font-display text-5xl font-bold text-accent"
        />
        <p className="text-sm text-muted">
          {sharp} of {played.length} within 5% · best streak {state.bestStreak}
        </p>
      </Card>

      <ul className="flex flex-col gap-2">
        {played.map((r, i) => {
          const guess = r.guesses[r.guesses.length - 1];
          const error = guess ? relativeError(guess.value, r.item.value) : Infinity;
          return (
            <li key={`${r.item.id}-${i}`}>
              <Card padding="md" className="flex items-center gap-3">
                <span className="text-2xl leading-none" aria-hidden>
                  {r.item.emoji ?? '📦'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{r.item.name}</p>
                  <p className="font-mono text-xs text-muted">
                    {guess ? `You ${formatValue(guess.value, 'usd')}` : 'No guess'} ·{' '}
                    {formatValue(r.item.value, 'usd')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.verdict === 'over' ? (
                    <Badge tone="danger" size="sm">
                      Over
                    </Badge>
                  ) : guess && Number.isFinite(error) ? (
                    <Badge tone={error <= 0.05 ? 'success' : 'neutral'} size="sm">
                      {error === 0
                        ? 'Exact'
                        : (describeMiss(guess.value, r.item.value)?.text ?? '—')}
                    </Badge>
                  ) : null}
                  <span className="w-12 text-right font-mono text-sm text-fg">{r.score}</span>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="text-center text-xs text-muted">
        Every price in this game is an author estimate, not a sourced figure.
      </p>

      <ShareButton card={card} />

      <div className="flex gap-2">
        <Button
          fullWidth
          size="lg"
          leadingIcon={<RotateCcw />}
          onClick={() => {
            start();
            navigate(PRICE.play);
          }}
        >
          Play again
        </Button>
        <Button
          fullWidth
          size="lg"
          variant="ghost"
          leadingIcon={<Settings2 />}
          to={PRICE.setup}
        >
          Change setup
        </Button>
      </div>
    </div>
  );
}
