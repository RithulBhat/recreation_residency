import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, Equal, Eye, SkipForward, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HiloCard } from '@/components/hilo/HiloCard';
import { ratioOf } from '@/arcade/pairing';
import { useHiloStore } from '@/hilo/store';
import { R } from '@/routes';
import { availablePowerUps, correctPick, currentPair } from '@/hilo/engine';
import { measureFor } from '@/hilo/measure';

export default function HiloPlay() {
  const navigate = useNavigate();
  const { state, dispatch, pick } = useHiloStore();

  useEffect(() => {
    if (state.status === 'idle') navigate(R.hilo.setup, { replace: true });
    if (state.status === 'finished') navigate(R.hilo.results, { replace: true });
  }, [state.status, navigate]);

  // The timed format needs a clock; every other format is untimed and this does nothing.
  useEffect(() => {
    if (state.settings.format !== 'timed' || state.status !== 'playing') return;
    const id = window.setInterval(() => dispatch({ type: 'tick', ms: 250 }), 250);
    return () => window.clearInterval(id);
  }, [state.settings.format, state.status, dispatch]);

  const pair = currentPair(state);
  if (!pair) return null;

  const revealing = state.status === 'revealing';
  const last = state.rounds[state.rounds.length - 1];
  const powerUps = availablePowerUps(state);
  const answer = correctPick(state);
  const gap = ratioOf(pair.from.value, pair.to.value);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {state.settings.format === 'lives' && (
            <span aria-label={`${state.livesLeft} lives left`}>
              {'❤️'.repeat(state.livesLeft)}
              <span className="opacity-25">{'🖤'.repeat(Math.max(0, state.settings.lives - state.livesLeft))}</span>
            </span>
          )}
          {state.settings.format === 'timed' && (
            <span className="font-mono text-sm text-fg">{Math.ceil(state.msLeft / 1000)}s</span>
          )}
          {state.streak > 1 && <Badge tone="warn">{state.streak} streak</Badge>}
        </div>
        <span className="font-mono text-sm text-fg">{state.totalScore.toLocaleString()}</span>
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row">
        <HiloCard
          item={pair.from}
          measure={measureFor(pair.from)}
          rounded={!state.settings.exactValues}
        />
        <div className="flex items-center justify-center px-2 font-mono text-xs uppercase tracking-[0.2em] text-muted">
          vs
        </div>
        <HiloCard
          item={pair.to}
          measure={measureFor(pair.to)}
          hidden={!revealing}
          revealing={revealing}
        />
      </div>

      {revealing ? (
        <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
          <Badge tone={last?.outcome === 'correct' ? 'success' : last?.outcome === 'skipped' ? 'neutral' : 'danger'}>
            {last?.outcome === 'correct'
              ? 'Correct'
              : last?.outcome === 'skipped'
                ? 'Skipped'
                : last?.outcome === 'timeout'
                  ? 'Out of time'
                  : 'Wrong'}
          </Badge>
          {last?.score ? <span className="font-mono text-2xl font-bold text-fg">+{last.score}</span> : null}
          <Button fullWidth size="lg" onClick={() => dispatch({ type: 'next' })}>
            {state.livesLeft <= 0 ? 'See results' : 'Keep going'}
          </Button>
        </Card>
      ) : (
        <>
          <div className="flex gap-2">
            <Button size="xl" fullWidth leadingIcon={<ArrowUp />} onClick={() => pick('higher')}>
              Higher
            </Button>
            {state.settings.allowSame && (
              <Button size="xl" variant="secondary" leadingIcon={<Equal />} onClick={() => pick('same')}>
                Too close
              </Button>
            )}
            <Button size="xl" fullWidth leadingIcon={<ArrowDown />} onClick={() => pick('lower')}>
              Lower
            </Button>
          </div>

          {state.peeking && (
            <p className="text-center text-sm text-muted" aria-live="polite">
              Peek: the gap is {gap >= 2 ? 'wide' : 'narrow'}.
            </p>
          )}
          {state.pendingDouble && (
            <p className="text-center text-sm text-warn" aria-live="polite">
              Double down armed — twice the points, two lives if you miss.
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {powerUps.includes('skip') && (
              <Button variant="ghost" size="sm" leadingIcon={<SkipForward />} onClick={() => dispatch({ type: 'powerUp', powerUp: 'skip' })}>
                Skip
              </Button>
            )}
            {powerUps.includes('peek') && (
              <Button variant="ghost" size="sm" leadingIcon={<Eye />} onClick={() => dispatch({ type: 'powerUp', powerUp: 'peek' })}>
                Peek
              </Button>
            )}
            {powerUps.includes('doubleDown') && !state.pendingDouble && (
              <Button variant="ghost" size="sm" leadingIcon={<Zap />} onClick={() => dispatch({ type: 'powerUp', powerUp: 'doubleDown' })}>
                Double down
              </Button>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {answer ? 'Make your pick.' : ''}
          </p>
        </>
      )}
    </div>
  );
}
