import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Binoculars, Home, Play, Swords, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { decodeScoutChallenge, scoutChallengeSettings } from '@/scout/challenge';
import { scoutMode, scoutPack } from '@/scout/packs';
import { formatScore } from '@/stats/share';
import { useScoutResultStore } from '@/store/scoutResultStore';
import { R } from '@/routes';
import {
  ScoutReplaceDialog,
  roundsLabel,
  scoutDifficultyLabel,
  timerLabel,
  triesLabel,
  useStartScout,
} from '@/components/scoutSetup';
import type { ScoutPack } from '@/scout/types';

/** One pack, in its own colour — the same chip the Songooner challenge screen uses. */
function PackChip({ pack }: { pack: ScoutPack }) {
  return (
    <span
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold text-fg"
      style={{ background: `color-mix(in oklab, ${pack.accent} 22%, var(--sg-surface))` }}
    >
      <span aria-hidden>{pack.emoji}</span>
      {pack.name}
    </span>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 font-semibold text-fg">{value}</dd>
      {hint !== undefined && <dd className="mt-0.5 text-xs text-muted">{hint}</dd>}
    </div>
  );
}

/**
 * `/scout/c/:code` — someone sent a Highlight Scout challenge. Decode it, show what they played and
 * what they scored, then deal the identical seeded run.
 *
 * This is often a stranger's first contact with the game, so the screen has to say what the run is
 * before it asks anyone to press a button: the mode, the rules, the packs, and a way into the rest
 * of Highlight Scout. Accepting starts the run here rather than bouncing through the lobby — same
 * `useStartScout` pipeline the lobby and the daily use, so a run already in progress still gets the
 * "replace it?" confirmation instead of being thrown away.
 */
export default function ScoutChallenge() {
  const { code = '' } = useParams();
  const game = useStartScout();
  const payload = useMemo(() => (code ? decodeScoutChallenge(code) : null), [code]);
  const [busy, setBusy] = useState(false);

  if (!payload) {
    return (
      <div className="mx-auto w-full max-w-lg py-6 sm:py-10">
        <Card padding="lg">
          <EmptyState
            as="h1"
            icon={<Swords />}
            title="That challenge link is broken"
            description="The code could not be read — it may have been cut off when it was copied. Ask for a fresh link, or set up your own scouting session."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button to={R.scout.home} variant="secondary" leadingIcon={<Home />}>
                  Highlight Scout
                </Button>
                <Button to={R.scout.setup} leadingIcon={<Play className="fill-current" />}>
                  Play anyway
                </Button>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  const settings = scoutChallengeSettings(payload);
  const by = payload.by?.trim() || null;
  const mode = scoutMode(settings.mode);
  const tier = scoutDifficultyLabel(settings);
  const hasScore = typeof payload.score === 'number';
  const packs = settings.packIds.map((id) => ({ id, pack: scoutPack(id) }));
  const unknown = packs.filter((p) => p.pack === undefined);
  const rules = [roundsLabel(settings.rounds), triesLabel(settings.tries), timerLabel(settings.roundTimer)].join(' · ');

  const accept = async () => {
    setBusy(true);
    // Powers the "You beat Maya!" banner on the results screen; a nameless or scoreless link just
    // isn't a "beat my score" run, so it clears any leftover challenger instead.
    useScoutResultStore
      .getState()
      .setChallenger(by !== null && typeof payload.score === 'number' ? { by, score: payload.score } : null);
    // `start` navigates to `#/scout/play` itself once the pool is built.
    await game.start(settings);
    setBusy(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-4 sm:gap-5 sm:py-8 lg:py-12">
      <Card padding="lg" glow className="overflow-hidden">
        <div
          className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-accent-3 opacity-20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-accent-2 opacity-15 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <span
              className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-accent-fg shadow-glow"
              aria-hidden
            >
              <Swords className="size-7" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                {hasScore ? 'Challenge · score to beat' : 'Challenge'}
              </div>
              {typeof payload.score === 'number' && (
                <p className="mt-1.5" data-testid="scout-challenge-score">
                  <span className="text-gradient block font-mono text-5xl font-bold leading-none tabular sm:text-6xl">
                    {formatScore(payload.score)}
                  </span>
                  <span className="mt-1.5 block text-sm font-semibold text-fg">Beat it.</span>
                </p>
              )}
              <h1
                className={
                  hasScore
                    ? 'mt-3 font-display text-lg font-bold leading-tight text-muted sm:text-xl'
                    : 'mt-1 font-display text-2xl font-black leading-tight text-fg sm:text-3xl'
                }
              >
                {by ? (
                  <>
                    <span className={hasScore ? 'text-fg' : 'text-gradient'}>{by}</span> challenged you
                  </>
                ) : (
                  'A friend challenged you'
                )}
              </h1>
            </div>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <Fact
              label="Mode"
              value={`${mode?.emoji ?? ''} ${mode?.name ?? settings.mode}`.trim()}
              hint={mode?.blurb}
            />
            <Fact label="Rules" value={rules} hint={settings.hintsEnabled ? 'Hints on' : 'No hints'} />
            <Fact
              label="Subjects"
              value="Same order, same seed"
              hint={tier !== null ? `${tier} only` : 'Every tier in the packs'}
            />
          </dl>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Packs</div>
            <ul className="flex flex-wrap gap-2" aria-label="Packs">
              {packs.map(({ id, pack }) => (
                <li key={id}>
                  {pack ? (
                    <PackChip pack={pack} />
                  ) : (
                    <Badge tone="warn" icon={<TriangleAlert />}>
                      {id} · no longer in the game
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            {unknown.length > 0 && (
              <p className="mt-2 text-xs text-warn">
                {unknown.length === packs.length
                  ? 'None of these packs exist any more, so the pool falls back to the default roster.'
                  : 'Unknown packs are skipped; the pool is built from the rest.'}
              </p>
            )}
          </div>

          {game.error !== null && (
            <p className="text-sm font-semibold text-danger" role="alert">
              {game.error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="glow"
              size="xl"
              leadingIcon={<Play className="fill-current" />}
              loading={busy || game.loading}
              onClick={() => void accept()}
              className="w-full sm:w-auto"
              data-testid="scout-accept-challenge"
            >
              {busy || game.loading
                ? 'Loading the roster…'
                : game.error !== null
                  ? 'Try again'
                  : 'Accept the challenge'}
            </Button>
            <Link
              to={R.scout.setup}
              className="px-2 py-2 text-center text-sm font-semibold text-muted transition-colors hover:text-fg"
            >
              Maybe later — play my own
            </Link>
          </div>
        </div>
      </Card>

      <Card padding="md">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-strong text-accent [&>svg]:size-5"
            aria-hidden
          >
            <Binoculars />
          </span>
          <p className="min-w-0 flex-1 text-sm text-muted">
            <span className="font-semibold text-fg">New to Highlight Scout?</span>{' '}
            {mode?.how ?? 'Name the NFL player from the clues you are given.'} You get{' '}
            {triesLabel(settings.tries)} per subject, and every miss trades points for another clue.
          </p>
          <Button to={R.scout.home} variant="ghost" size="sm">
            How it works
          </Button>
        </div>
      </Card>

      <ScoutReplaceDialog game={game} />
    </div>
  );
}
