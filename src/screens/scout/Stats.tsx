import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Activity, Binoculars, Crosshair, Flame, Ghost, Library, Play, Timer, Trophy } from 'lucide-react';
import { formatScore } from '@/stats/share';
import { SectionHeading } from '@/components/SectionHeading';
import { StatTile } from '@/components/StatTile';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDuration } from '@/components/stats/format';
import { R } from '@/routes';
import {
  ScoutModeChart,
  ScoutNemesisList,
  ScoutPackStandings,
  ScoutRecentRuns,
  scoutAccuracy,
  scoutAvgScore,
  scoutNemeses,
  scoutPackStandings,
  scoutSubjects,
  scoutTotals,
} from '@/components/scoutSetup';
import { useScoutResultStore } from '@/store/scoutResultStore';

/** Dev affordance: `#/scout/stats?demo=1` seeds a fake history so the page can be reviewed. */
function useScoutDemoSeed(): boolean {
  const [params] = useSearchParams();
  const wanted = import.meta.env.DEV && params.get('demo') === '1';
  const [ready, setReady] = useState(!wanted);

  useEffect(() => {
    if (!wanted) {
      setReady(true);
      return;
    }
    let alive = true;
    void import('@/components/scoutSetup/scoutDemoSeed')
      .then((mod) => mod.seedScoutDemoStats())
      .catch(() => {
        /* dev-only helper — never break the page */
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [wanted]);

  return ready;
}

function LoadingStats() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your scouting record">
      <Skeleton className="h-44 rounded-4xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-4xl" />
    </div>
  );
}

/**
 * Highlight Scout's own record. Separate ledger from Songooner's (`sg:scout-stats`), because the
 * shapes have nothing in common — no clip buckets here, and `@/scout` exposes no achievement
 * engine, so there is deliberately no trophy cabinet on this page.
 */
export default function ScoutStats() {
  const ready = useScoutDemoSeed();
  const records = useScoutResultStore((s) => s.records);
  const reset = useScoutResultStore((s) => s.resetHistory);
  const [wiping, setWiping] = useState(false);

  const byRecency = useMemo(() => [...records].sort((a, b) => b.finishedAt - a.finishedAt), [records]);
  const totals = useMemo(() => scoutTotals(records), [records]);
  const subjects = useMemo(() => scoutSubjects(records), [records]);
  const dailies = useMemo(() => new Set(records.map((r) => r.daily).filter(Boolean)).size, [records]);
  const accuracy = scoutAccuracy(totals);
  const hasGames = totals.games > 0;
  const packRows = scoutPackStandings(totals);
  const nemeses = scoutNemeses(subjects, 8);

  return (
    <div className="flex flex-col gap-8 pb-4 sm:gap-14">
      <SectionHeading
        as="h1"
        eyebrow="Local · private · yours"
        title={<span id="scout-stats-title">Your scouting record</span>}
        description="Every round sharpens this page: which modes you read fastest, which packs own you, and the players who keep walking away unnamed."
        size="lg"
        action={
          hasGames ? (
            <span className="hidden sm:block">
              <Button variant="glow" to={R.scout.setup} leadingIcon={<Play className="fill-current" />}>
                Play
              </Button>
            </span>
          ) : undefined
        }
      />

      {!ready ? (
        <LoadingStats />
      ) : !hasGames ? (
        <>
          <Card padding="lg" glow className="overflow-hidden">
            <div className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-accent opacity-25 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-24 -right-16 size-64 rounded-full bg-accent-2 opacity-20 blur-3xl" aria-hidden />
            <div className="relative">
              <EmptyState
                icon={<Binoculars />}
                title="Nothing scouted yet"
                description="Play one run and this page fills up — accuracy in all seven modes, your strongest and weakest packs, your best streak, and the players you keep missing."
                action={
                  <Button variant="glow" size="lg" to={R.scout.setup} leadingIcon={<Play className="fill-current" />}>
                    Start scouting
                  </Button>
                }
              />
              {import.meta.env.DEV && (
                <p className="mt-4 text-center font-mono text-xs text-muted">
                  dev:{' '}
                  <Link to={`${R.scout.stats}?demo=1`} className="text-accent underline-offset-2 hover:underline">
                    ?demo=1
                  </Link>{' '}
                  seeds sample runs
                </p>
              )}
            </div>
          </Card>

          <section aria-labelledby="scout-modes-empty">
            <SectionHeading
              eyebrow={
                <span className="inline-flex items-center gap-1.5">
                  <Crosshair className="size-3" aria-hidden /> Waiting for you
                </span>
              }
              title={<span id="scout-modes-empty">Seven modes to be measured on</span>}
              description="Each one tests a different kind of recognition. The chart fills in as you play them."
              className="mb-4"
            />
            <ScoutModeChart totals={totals} />
          </section>
        </>
      ) : (
        <>
          <section aria-labelledby="scout-totals-title">
            <h2 id="scout-totals-title" className="sr-only">
              Lifetime totals
            </h2>
            <Card padding="lg" glow className="overflow-hidden">
              <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-accent opacity-20 blur-3xl" aria-hidden />
              <div className="relative flex flex-col gap-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Lifetime</div>
                    <p className="mt-1 font-display text-3xl font-black tabular text-fg sm:text-4xl">
                      <span className="text-gradient">{formatScore(totals.score)}</span>
                      <span className="ml-1.5 text-base font-semibold text-muted">points scouted</span>
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {totals.games} {totals.games === 1 ? 'run' : 'runs'} · {totals.rounds} rounds ·{' '}
                      {formatScore(scoutAvgScore(totals))} avg per run
                      {dailies > 0 && ` · ${dailies} ${dailies === 1 ? 'daily' : 'dailies'}`}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile
                    variant="opaque"
                    label="Runs"
                    value={totals.games}
                    icon={<Binoculars />}
                    hint={`${totals.rounds} rounds played`}
                  />
                  <StatTile
                    variant="opaque"
                    label="Accuracy"
                    value={Math.round(accuracy * 100)}
                    suffix="%"
                    icon={<Crosshair />}
                    tone={accuracy >= 0.5 ? 'success' : accuracy >= 0.3 ? 'warn' : 'danger'}
                    hint={`${totals.correct} of ${totals.rounds} named`}
                  />
                  <StatTile
                    variant="opaque"
                    label="Best streak"
                    value={totals.bestStreak}
                    icon={<Flame />}
                    tone="warn"
                    hint="Rounds in a row"
                  />
                  <StatTile
                    variant="opaque"
                    label="First look"
                    value={totals.firstTry}
                    icon={<Trophy />}
                    hint="Solved on rung one"
                  />
                  <StatTile
                    variant="opaque"
                    label="Time scouting"
                    value={formatDuration(totals.timePlayedMs)}
                    icon={<Timer />}
                    hint="Across every run"
                  />
                  <StatTile
                    variant="opaque"
                    label="Packs played"
                    value={packRows.length}
                    icon={<Library />}
                    hint={nemeses.length > 0 ? `${nemeses.length} still beating you` : 'Nothing unfinished'}
                  />
                </div>
              </div>
            </Card>
          </section>

          <section aria-labelledby="scout-modes-title">
            <SectionHeading
              eyebrow={
                <span className="inline-flex items-center gap-1.5">
                  <Crosshair className="size-3" aria-hidden /> Your eye
                </span>
              }
              title={<span id="scout-modes-title">Which clues you read fastest</span>}
              description="Accuracy per mode, so you can see whether you are a silhouette reader or a stat-sheet reader."
              className="mb-4"
            />
            <ScoutModeChart totals={totals} />
          </section>

          {packRows.length > 0 && (
            <section aria-labelledby="scout-packs-title">
              <SectionHeading
                eyebrow={
                  <span className="inline-flex items-center gap-1.5">
                    <Library className="size-3" aria-hidden /> Packs
                  </span>
                }
                title={<span id="scout-packs-title">Where you shine, where you don't</span>}
                description="Accuracy counts per round, so a mixed-pack run counts towards every pack it pulled from. Tap a row for a rematch."
                className="mb-4"
              />
              <ScoutPackStandings totals={totals} />
            </section>
          )}

          <section aria-labelledby="scout-nemesis-title">
            <SectionHeading
              eyebrow={
                <span className="inline-flex items-center gap-1.5">
                  <Ghost className="size-3" aria-hidden /> Unfinished business
                </span>
              }
              title={<span id="scout-nemesis-title">The ones you keep missing</span>}
              description="Every subject you have faced, ranked by how often they have walked away unnamed."
              className="mb-4"
            />
            <ScoutNemesisList subjects={subjects} />
          </section>

          <section aria-labelledby="scout-form-title">
            <SectionHeading
              eyebrow={
                <span className="inline-flex items-center gap-1.5">
                  <Activity className="size-3" aria-hidden /> Recent form
                </span>
              }
              title={<span id="scout-form-title">How you've been scouting</span>}
              description="Your last runs, newest first."
              className="mb-4"
            />
            <ScoutRecentRuns records={byRecency} />
          </section>

          <section aria-labelledby="scout-data-title">
            <SectionHeading
              title={<span id="scout-data-title">Data</span>}
              description="Everything on this page lives in this browser only. Wiping it cannot be undone."
              className="mb-4"
            />
            <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
              <p className="text-sm text-muted">
                {totals.games} runs · {Object.keys(subjects).length} subjects · {dailies} dailies
              </p>
              <Button variant="danger" onClick={() => setWiping(true)} data-testid="scout-wipe">
                Wipe Scout stats
              </Button>
            </div>
            <Dialog
              open={wiping}
              onClose={() => setWiping(false)}
              title="Wipe your scouting record?"
              description="Every run, subject and daily on this page goes. Songooner's stats are untouched."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setWiping(false)}>
                    Keep it
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      reset();
                      setWiping(false);
                    }}
                    data-testid="scout-wipe-confirm"
                  >
                    Wipe it
                  </Button>
                </>
              }
            />
          </section>
        </>
      )}

      <Footer className="mt-0" />
    </div>
  );
}
