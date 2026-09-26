import { useMemo } from 'react';
import { CalendarDays, Flame, Globe, Layers, ListChecks, Play, RotateCcw } from 'lucide-react';
import { getDailyPack } from '@/lib/catalog';
import { dailySettings, todayISO } from '@/game/challenge';
import { useStatsStore } from '@/store/statsStore';
import { useStartGame } from '@/hooks/useStartGame';
import { PackCard } from '@/components/PackCard';
import { SectionHeading } from '@/components/SectionHeading';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DailyCalendarStrip, DailyResultCard, MidnightCountdown, dailyStreak, formatLongDate, formatShortDate, lastNDays } from '@/components/daily';
import { stagesSentence } from '@/components/setup/summary';
import { ReplaceGameDialog } from '@/components/ResumeGame';

/** One seeded classic run a day with the pack of the day — same songs for everyone. */
export default function Daily() {
  const game = useStartGame();
  const today = todayISO();
  const pack = useMemo(() => getDailyPack(today), [today]);
  const settings = useMemo(() => dailySettings(today, pack.id), [today, pack.id]);
  const daily = useStatsStore((s) => s.daily);
  const result = daily[today];
  const streak = useMemo(() => dailyStreak(new Set(Object.keys(daily)), today), [daily, today]);
  const days = useMemo(() => lastNDays(today, 14), [today]);

  const rules = [
    { icon: <Layers />, text: stagesSentence(settings.stages).replace("You'll hear", 'Classic ladder:') },
    { icon: <ListChecks />, text: `${settings.rounds} rounds, ${settings.hintsEnabled ? 'hints allowed' : 'no hints'}` },
    { icon: <Globe />, text: 'Seeded by the date — everyone gets the same songs in the same order' },
    { icon: <RotateCcw />, text: 'One attempt per day. A new pack drops at local midnight' },
  ];

  return (
    <div className="flex flex-col gap-5 pb-8 sm:gap-10">
      <SectionHeading
        as="h1"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden />
            <span>
              Daily · <span className="sm:hidden">{formatShortDate(today)}</span>
              <span className="hidden sm:inline">{formatLongDate(today)}</span>
            </span>
          </span>
        }
        title={<span id="daily-title">Pack of the day</span>}
        description="Ten rounds, classic rules, one shot. Compare grids with friends — everyone hears exactly the same songs today."
        size="lg"
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <PackCard pack={pack} className="min-h-40" showFeatured={false} />
          <Card padding="sm">
            <ul className="flex flex-col gap-2.5 text-sm text-fg">
              {rules.map((r, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-accent [&>svg]:size-4" aria-hidden>
                    {r.icon}
                  </span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {result ? (
          <div className="flex flex-col gap-3">
            <DailyResultCard result={result} streak={streak} />
            <MidnightCountdown className="px-1" />
          </div>
        ) : (
          <Card padding="lg" glow className="overflow-hidden">
            <div className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-accent-2 opacity-20 blur-3xl" aria-hidden />
            <div className="relative flex flex-col items-start gap-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Not played yet</div>
              <h2 className="font-display text-2xl font-black leading-tight text-fg sm:text-3xl">
                Today it's <span className="text-gradient">{pack.name}</span>
                <span aria-hidden> {pack.emoji}</span>
              </h2>
              <p className="text-sm text-muted">{pack.tagline}</p>
              {streak > 0 && (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-3 py-1.5 text-sm font-bold text-warn" data-testid="daily-streak">
                  <Flame className="size-4" aria-hidden />
                  {streak}-day streak — play today to keep it
                </p>
              )}
              {game.error && (
                <p className="text-sm font-semibold text-danger" role="alert">
                  {game.error}
                </p>
              )}
              <Button
                variant="glow"
                size="xl"
                leadingIcon={<Play className="fill-current" />}
                loading={game.loading}
                onClick={() => void game.start(settings)}
                className="w-full sm:w-auto"
                data-testid="play-daily"
              >
                {game.loading ? 'Loading songs…' : game.error ? 'Try again' : "Play today's challenge"}
              </Button>
              <MidnightCountdown label="Today's pack changes in" />
            </div>
          </Card>
        )}
      </div>

      <section aria-labelledby="daily-history">
        <SectionHeading size="sm" title={<span id="daily-history">Last two weeks</span>} description="Keep the streak alive — one daily a day." className="mb-3" />
        <DailyCalendarStrip days={days} daily={daily} today={today} />
      </section>
      <ReplaceGameDialog game={game} />
    </div>
  );
}
