import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Activity, Binoculars, Crosshair, Map as MapIcon, Medal, Play, Trophy } from 'lucide-react';
import { buildScoutReport } from '@/scout/report';
import { useScoutStatsStore } from '@/store/scoutStatsStore';
import { R } from '@/routes';
import { SectionHeading } from '@/components/SectionHeading';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScoutFooter } from '@/components/scoutSetup';
import {
  ScoutAchievementCabinet,
  ScoutBestCall,
  ScoutCutBars,
  ScoutDataTools,
  ScoutLeagueMap,
  ScoutNemesisPanel,
  ScoutRankHero,
  ScoutRecentForm,
  ScoutVerdict,
} from '@/components/scoutReport';

/** Eyebrow with its icon — every section on this page wears one. */
function Eyebrow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="[&>svg]:size-3" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

/**
 * DEV affordance: `#/scout/stats?demo=1` folds a sample history into the real ledger so the Report
 * Card can be reviewed without grinding out thirteen runs. `clear` drops the query param, so a reset
 * cannot be undone by a reload.
 */
function useScoutDemoSeed(): { ready: boolean; clear: () => void } {
  const [params, setParams] = useSearchParams();
  const wanted = import.meta.env.DEV && params.get('demo') === '1';
  const [ready, setReady] = useState(!wanted);

  useEffect(() => {
    if (!wanted) {
      setReady(true);
      return;
    }
    let alive = true;
    void import('@/components/scoutReport/demoSeed')
      .then((mod) => mod.seedScoutReportDemo())
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

  return {
    ready,
    clear: () => {
      if (!params.has('demo')) return;
      const next = new URLSearchParams(params);
      next.delete('demo');
      setParams(next, { replace: true });
    },
  };
}

function LoadingReport() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your scouting record">
      <Skeleton className="h-48 rounded-4xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_unused, i) => (
          <Skeleton key={i} className="h-28 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-5xl" />
      <Skeleton className="h-80 rounded-4xl" />
    </div>
  );
}

/**
 * Highlight Scout's Report Card.
 *
 * Every number on this page comes out of one call to `buildScoutReport` over the lifetime ledger in
 * `@/store/scoutStatsStore` — the rank ladder, the verdict, the six accuracy cuts, the 32-franchise
 * map, the best call, the badges and recent form. This screen only lays them out; it computes
 * nothing, which is why the copy can afford to be blunt.
 *
 * Songooner's stats live in a different store and a different screen; the two ledgers never mix.
 */
export default function ScoutStats() {
  const { ready, clear } = useScoutDemoSeed();
  const totals = useScoutStatsStore((s) => s.totals);
  const runs = useScoutStatsStore((s) => s.runs);
  const subjects = useScoutStatsStore((s) => s.subjects);
  const achievements = useScoutStatsStore((s) => s.achievements);

  const report = useMemo(
    () => buildScoutReport({ totals, records: runs, subjects: Object.values(subjects) }),
    [totals, runs, subjects],
  );
  const hasRuns = report.runs > 0;

  return (
    <div className="flex flex-col gap-8 pb-4 sm:gap-14">
      <SectionHeading
        as="h1"
        eyebrow="Local · private · yours"
        title={<span id="scout-stats-title">Your scouting record</span>}
        description="The report card: which rooms you own, which ones own you, and how much of the league you can actually name."
        size="lg"
        action={
          <span className="hidden sm:block">
            <Button variant="glow" to={R.scout.setup} leadingIcon={<Play className="fill-current" />}>
              Play
            </Button>
          </span>
        }
      />

      {!ready ? (
        <LoadingReport />
      ) : (
        <>
          <section aria-labelledby="scout-rank-title">
            <h2 id="scout-rank-title" className="sr-only">
              Rank and lifetime totals
            </h2>
            <ScoutRankHero report={report} totals={totals} />
          </section>

          <section aria-labelledby="scout-verdict-title">
            <h2 id="scout-verdict-title" className="sr-only">
              The verdict
            </h2>
            <ScoutVerdict report={report} />
          </section>

          {!hasRuns && (
            <section aria-labelledby="scout-empty-title">
              <Card padding="lg" glow className="overflow-hidden">
                <div
                  className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-accent opacity-25 blur-3xl"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute -bottom-24 -right-16 size-64 rounded-full bg-accent-2 opacity-20 blur-3xl"
                  aria-hidden
                />
                <div className="relative">
                  <EmptyState
                    icon={<Binoculars />}
                    title={<span id="scout-empty-title">Nothing scouted yet</span>}
                    description="One run fills in the bars below, lights up the league map and starts the badge count. Twenty graded rounds and the verdict up top stops hedging."
                    action={
                      <Button
                        variant="glow"
                        size="lg"
                        to={R.scout.setup}
                        leadingIcon={<Play className="fill-current" />}
                      >
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
                      seeds a sample record
                    </p>
                  )}
                </div>
              </Card>
            </section>
          )}

          <section aria-labelledby="scout-eye-title">
            <SectionHeading
              eyebrow={<Eyebrow icon={<Crosshair />}>Your eye</Eyebrow>}
              title={<span id="scout-eye-title">What you can actually see</span>}
              description={
                hasRuns
                  ? 'Share of rounds you named the subject, cut six ways. A row needs six sightings before it can be called your sharpest or your blind spot — below that it stays marked thin.'
                  : 'Share of rounds you named the subject. Every row stays on the axis from the first run, so the shape never jumps around as history arrives.'
              }
              className="mb-4"
            />
            {/* The six cuts are dealt into the two columns BY HEIGHT, not by category: thirteen
                puzzle types next to three position groups left a 640 x 350 px hole under the left
                column at 1920. Position groups + divisions + fame tiers is the same stack of rows
                as puzzle types + formats + conference, so the two columns land together. */}
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3 sm:gap-4">
                <ScoutCutBars
                  title="Position groups"
                  hint="Offence, defence, special teams — the real skill split."
                  cuts={report.byGroup}
                  testId="scout-cut-groups"
                />
                {hasRuns ? (
                  <>
                    <ScoutCutBars
                      title="Divisions"
                      hint="Eight divisions, four rosters each."
                      cuts={report.byDivision}
                      testId="scout-cut-divisions"
                    />
                    <ScoutCutBars
                      title="Fame tiers"
                      hint="Superstars down to deep cuts. This is the curve that separates a fan from a scout."
                      cuts={report.byTier}
                      long
                      testId="scout-cut-tiers"
                    />
                  </>
                ) : (
                  // With only two charts to show, the note that explains the other four rides in the
                  // shorter column rather than under the whole grid.
                  <p className="text-sm text-muted">
                    Four more axes — fame tier, conference, division and session format — appear here once you
                    have played a run.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:gap-4">
                <ScoutCutBars
                  title="Puzzle types"
                  hint="Which clue you read fastest — shadow, crop, play text or paperwork."
                  cuts={report.byMode}
                  long
                  testId="scout-mode-chart"
                />
                {hasRuns && (
                  <>
                    <ScoutCutBars
                      title="Session formats"
                      hint="Gauntlet and Survival ask harder questions than Standard."
                      cuts={report.byFormat}
                      long
                      testId="scout-cut-formats"
                    />
                    <ScoutCutBars
                      title="Conference"
                      hint="Do you watch one half of the league and not the other?"
                      cuts={report.byConference}
                      long
                      testId="scout-cut-conference"
                    />
                  </>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="scout-map-title">
            <SectionHeading
              eyebrow={<Eyebrow icon={<MapIcon />}>The league map</Eyebrow>}
              title={<span id="scout-map-title">All 32 rosters, and how well you know them</span>}
              description="Every franchise you have faced, washed in its own colour. The bar under each crest is the share of its subjects you named."
              className="mb-4"
            />
            <ScoutLeagueMap report={report} />
          </section>

          <section aria-labelledby="scout-call-title">
            <SectionHeading
              eyebrow={<Eyebrow icon={<Medal />}>Highlights</Eyebrow>}
              title={<span id="scout-call-title">Your best call, and your unfinished business</span>}
              description="The shortest rung you ever named anybody at — and the men who keep walking away unnamed."
              className="mb-4"
            />
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
              <ScoutBestCall report={report} firstLooks={totals.firstRungSolves} />
              <ScoutNemesisPanel nemeses={report.nemeses} />
            </div>
          </section>

          <section aria-labelledby="scout-achievements-title">
            <SectionHeading
              eyebrow={<Eyebrow icon={<Trophy />}>Trophy cabinet</Eyebrow>}
              title={<span id="scout-achievements-title">Forty-seven badges</span>}
              description="Naming a man from the pure black shadow, clearing a division, surviving twenty. Volume alone unlocks almost none of these."
              className="mb-4"
            />
            <ScoutAchievementCabinet unlocks={achievements} />
          </section>

          <section aria-labelledby="scout-form-title">
            <SectionHeading
              eyebrow={<Eyebrow icon={<Activity />}>Recent form</Eyebrow>}
              title={<span id="scout-form-title">How you have been scouting</span>}
              description="Accuracy per run, oldest to newest, and the last sessions in full."
              className="mb-4"
            />
            <ScoutRecentForm report={report} runs={runs} />
          </section>

          <section aria-labelledby="scout-data-title">
            <SectionHeading
              title={<span id="scout-data-title">Data</span>}
              description="Everything on this page lives in this browser only. Wiping it cannot be undone."
              className="mb-4"
            />
            <ScoutDataTools onAfterReset={clear} />
          </section>
        </>
      )}

      {/* ESPN, not Deezer: Highlight Scout has no audio. See ScoutFooter. */}
      <ScoutFooter className="mt-0" />
    </div>
  );
}
