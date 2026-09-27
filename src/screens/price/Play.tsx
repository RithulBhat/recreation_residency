import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Lightbulb, SkipForward } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { formatValue } from '@/arcade/units';
import { missLine } from '@/price/miss';
import { PriceKeypad } from '@/components/price/PriceKeypad';
import { usePriceStore } from '@/price/store';
import { PRICE } from '@/price/routes';
import { scoreGuess } from '@/price/scoring';
import type { PriceHint } from '@/price/types';

const HINT_LABEL: Record<PriceHint, string> = {
  category: 'Reveal the category',
  bracket: 'Reveal the price range',
  firstDigit: 'Reveal the first digit',
};

/** What a bought hint actually shows. Derived from the item so it can never contradict it. */
function hintText(hint: PriceHint, value: number, category: string): string {
  switch (hint) {
    case 'category':
      return `Category: ${category}`;
    case 'bracket': {
      const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
      return `Somewhere between ${formatValue(magnitude, 'usd')} and ${formatValue(magnitude * 10, 'usd')}`;
    }
    case 'firstDigit':
      return `Starts with ${String(Math.round(value))[0]}`;
  }
}

export default function PricePlay() {
  const navigate = useNavigate();
  const { state, dispatch, guess } = usePriceStore();
  const [entry, setEntry] = useState('');

  const round = state.rounds[state.index];
  const revealing = state.status === 'revealing';

  // A game that was never started (a refresh straight onto /price/play) has nothing to show.
  useEffect(() => {
    if (state.status === 'idle') navigate(PRICE.setup, { replace: true });
    if (state.status === 'finished') navigate(PRICE.results, { replace: true });
  }, [state.status, navigate]);

  useEffect(() => {
    setEntry('');
  }, [state.index]);

  const breakdown = useMemo(() => {
    if (!revealing || !round || round.guesses.length === 0) return null;
    const best = round.guesses[round.guesses.length - 1];
    return scoreGuess({
      guess: best.value,
      answer: round.item.value,
      scoring: state.settings.scoring,
      timer: state.settings.timer,
      elapsedMs: best.elapsedMs,
      speedBonus: state.settings.speedBonus,
      streak: state.streak,
      streakMultiplier: state.settings.streakMultiplier,
      hintsUsed: round.hintsUsed.length,
    });
  }, [revealing, round, state.settings, state.streak]);

  if (!round) return null;

  const available = state.settings.hints.filter((h) => !round.hintsUsed.includes(h));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Round {state.index + 1} of {state.rounds.length}
        </span>
        <div className="flex items-center gap-2">
          {state.streak > 1 && <Badge tone="warn">{state.streak} streak</Badge>}
          <span className="font-mono text-sm text-fg">{state.totalScore.toLocaleString()}</span>
        </div>
      </div>
      <ProgressBar value={((state.index + (revealing ? 1 : 0)) / state.rounds.length) * 100} size="xs" />

      <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
        <span className="text-6xl leading-none" aria-hidden>
          {round.item.emoji ?? '📦'}
        </span>
        <h1 className="font-display text-2xl font-bold text-fg">{round.item.name}</h1>
        {round.item.blurb && <p className="text-sm text-muted">{round.item.blurb}</p>}
        <Badge tone="warn" size="sm">
          Approximate
        </Badge>

        {round.hintsUsed.length > 0 && (
          <ul className="flex w-full flex-col gap-1 pt-1">
            {round.hintsUsed.map((h) => (
              <li key={h} className="rounded-xl bg-surface px-3 py-2 text-sm text-muted">
                {hintText(h, round.item.value, round.item.category)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {revealing ? (
        <Card padding="lg" className="flex flex-col items-center gap-2 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            It actually costs
          </span>
          <NumberTicker
            value={round.item.value}
            prefix="$"
            className="font-display text-4xl font-bold text-accent"
          />
          {breakdown && (
            <p className="text-sm text-muted">
              {breakdown.verdict === 'over'
                ? `You said ${formatValue(round.guesses[round.guesses.length - 1].value, 'usd')} — over the price, so nothing this round`
                : missLine(
                    round.guesses[round.guesses.length - 1].value,
                    round.item.value,
                    state.settings.currency,
                  )}
            </p>
          )}
          <span className="font-mono text-2xl font-bold text-fg">+{round.score}</span>
          <Button fullWidth size="lg" onClick={() => dispatch({ type: 'next' })}>
            {state.index + 1 >= state.rounds.length ? 'See results' : 'Next item'}
          </Button>
        </Card>
      ) : (
        <>
          <div
            className="rounded-2xl border border-border bg-surface px-4 py-3 text-center font-mono text-3xl font-bold text-fg"
            aria-live="polite"
            aria-label={entry === '' ? 'No guess entered' : `Your guess: ${entry} dollars`}
          >
            {entry === '' ? <span className="text-muted">$0</span> : `$${Number(entry).toLocaleString()}`}
          </div>

          <PriceKeypad value={entry} onChange={setEntry} onSubmit={() => guess(Number(entry))} />

          <div className="flex flex-wrap gap-2">
            {available.map((h) => (
              <Button
                key={h}
                variant="ghost"
                size="sm"
                leadingIcon={<Lightbulb />}
                onClick={() => dispatch({ type: 'hint', hint: h })}
              >
                {HINT_LABEL[h]}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<SkipForward />}
              onClick={() => dispatch({ type: 'skip' })}
            >
              Skip
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
