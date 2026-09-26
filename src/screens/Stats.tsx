import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Activity, Disc3, Ear, Library, ListMusic, Play, Trophy } from 'lucide-react';
import { useStatsStore } from '@/store/statsStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SectionHeading } from '@/components/SectionHeading';
import { Footer } from '@/components/Footer';
import {
  AchievementGrid,
  ClipBucketChart,
  DataTools,
  FormStrip,
  HistoryList,
  PackStandings,
  RankHero,
  RecentGames,
} from '@/components/stats';

/** Dev affordance: `/#/stats?demo=1` seeds fake games so the page can be reviewed. */
function useDemoSeed(): boolean {
  const [params] = useSearchParams();
  const wanted = import.meta.env.DEV && params.get('demo') === '1';
  const [ready, setReady] = useState(!wanted);

  useEffect(() => {
    if (!wanted) {
      setReady(true);
      return;
    }
    let alive = true;
    void import('@/components/stats/demoSeed')
      .then((mod) => {
        mod.seedDemoStats();
      })
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
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your stats">
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

export default function Stats() {
  const ready = useDemoSeed();
  const totals = useStatsStore((s) => s.totals);
  const records = useStatsStore((s) => s.records);
  const tracks = useStatsStore((s) => s.tracks);
  const unlocks = useStatsStore((s) => s.achievements);

  // The store appends in play order, which is chronological in real use — but
  // an imported file (or the demo seed) can arrive in any order, and every
  // consumer below reads "newest first".
  const byRecency = useMemo(() => [...records].sort((a, b) => b.finishedAt - a.finishedAt), [records]);

  const hasGames = totals.games > 0;

  return (
    <div className="flex flex-col gap-10 pb-4 sm:gap-14">
      <SectionHeading
        as="h1"
        eyebrow="Local · private · yours"
        title={<span id="stats-title">Your musical brain</span>}
        description="Every round you play sharpens this page: how short a clip you can name a song from, which packs own you, and every track you've ever met."
        size="lg"
        action={
          hasGames ? (
            // The mobile tab bar already has Play; keep the header uncrowded
            // there. The wrapper does the hiding — `Button` already sets
            // `inline-flex`, and `cn` does not merge conflicting utilities.
            <span className="hidden sm:block">
              <Button variant="glow" to="/setup" leadingIcon={<Play className="fill-current" />}>
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
                icon={<Disc3 />}
                title="Nothing recorded yet"
                description="Play one round and this page fills up — your rank, accuracy at every clip length, best streak, pack standings, 53 achievements and a history of every song you've heard."
                action={
                  <Button variant="glow" size="lg" to="/setup" leadingIcon={<Play className="fill-current" />}>
                    Play now
                  </Button>
                }
              />
              {import.meta.env.DEV && (
                <p className="mt-4 text-center font-mono text-xs text-muted">
                  dev:{' '}
                  <Link to="/stats?demo=1" className="text-accent underline-offset-2 hover:underline">
                    ?demo=1
                  </Link>{' '}
                  seeds sample games
                </p>
              )}
            </div>
          </Card>

          <section aria-labelledby="achievements-title">
            <SectionHeading
              eyebrow={<span className="inline-flex items-center gap-1.5"><Trophy className="size-3" aria-hidden /> Waiting for you</span>}
              title={<span id="achievements-title">53 achievements</span>}
              description="Some are obvious. Three are hidden until you trip over them."
              className="mb-4"
            />
            <AchievementGrid unlocks={unlocks} />
          </section>

          <section aria-labelledby="data-title">
            <SectionHeading
              title={<span id="data-title">Data</span>}
              description="Already have a Songooner backup? Import it here."
              className="mb-4"
            />
            <DataTools />
          </section>
        </>
      ) : (
        <>
          <section aria-labelledby="rank-title">
            <h2 id="rank-title" className="sr-only">
              Rank and lifetime totals
            </h2>
            <RankHero totals={totals} />
          </section>

          <section aria-labelledby="ears-title">
            <SectionHeading
              eyebrow={<span className="inline-flex items-center gap-1.5"><Ear className="size-3" aria-hidden /> Your ears</span>}
              title={<span id="ears-title">How short can you go?</span>}
              description="Accuracy at each clip length you've heard, from a 0.1 second blip to a full 10 seconds."
              className="mb-4"
            />
            <ClipBucketChart totals={totals} />
          </section>

          <section aria-labelledby="form-title">
            <SectionHeading
              eyebrow={<span className="inline-flex items-center gap-1.5"><Activity className="size-3" aria-hidden /> Recent form</span>}
              title={<span id="form-title">How you've been playing</span>}
              description="Tap any game to see how it was set up and how it went."
              className="mb-4"
            />
            <div className="flex flex-col gap-3 sm:gap-4">
              <FormStrip records={byRecency} count={20} />
              <RecentGames records={byRecency} count={8} />
            </div>
          </section>

          <section aria-labelledby="packs-title">
            <SectionHeading
              eyebrow={<span className="inline-flex items-center gap-1.5"><Library className="size-3" aria-hidden /> Packs</span>}
              title={<span id="packs-title">Where you shine, where you don't</span>}
              description="Accuracy is per round, so mixed-pack games count towards every pack they pulled from."
              className="mb-4"
            />
            <PackStandings totals={totals} />
          </section>

          <section aria-labelledby="achievements-title">
            <SectionHeading
              eyebrow={<span className="inline-flex items-center gap-1.5"><Trophy className="size-3" aria-hidden /> Achievements</span>}
              title={<span id="achievements-title">The trophy cabinet</span>}
              description="Hidden ones stay masked until you trip over them."
              className="mb-4"
            />
            <AchievementGrid unlocks={unlocks} />
          </section>

          <section aria-labelledby="songs-title" id="songs-you-have-met" className="scroll-mt-24">
            <SectionHeading
              eyebrow={<span className="inline-flex items-center gap-1.5"><ListMusic className="size-3" aria-hidden /> History</span>}
              title={<span id="songs-title">Songs you've met</span>}
              description="Newest first, with how often you've nailed each one and the shortest clip you managed it from."
              className="mb-4"
            />
            <HistoryList tracks={tracks} />
          </section>

          <section aria-labelledby="data-title">
            <SectionHeading
              title={<span id="data-title">Data</span>}
              description="Back it up, move it to another browser, or wipe the slate."
              className="mb-4"
            />
            <DataTools />
          </section>
        </>
      )}

      <Footer className="mt-0" />
    </div>
  );
}
