import { useMemo } from 'react';
import { CalendarDays, Flame, Globe, ListChecks, Play, RotateCcw, Timer } from 'lucide-react';
import { todayISO } from '@/game/challenge';
import { scoutDailySettings } from '@/scout/challenge';
import { SCOUT_MODES, scoutPack } from '@/scout/packs';
import { SectionHeading } from '@/components/SectionHeading';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  DailyCalendarStrip,
  MidnightCountdown,
  dailyStreak,
  formatLongDate,
  formatShortDate,
  lastNDays,
} from '@/components/daily';
import {
  SCOUT_DIFFICULTY_INFO,
  ScoutDailyResultCard,
  ScoutReplaceDialog,
  ScoutResumeBanner,
  SCOUT_MODE_ACCENT,
  roundsLabel,
  scoutDailyRecord,
  scoutDailyResults,
  triesLabel,
  useStartScout,
} from '@/components/scoutSetup';
import { useScoutResultStore } from '@/store/scoutResultStore';

/** One seeded run a day: the mode of the day, the pack of the day, identical for everyone. */
export default function ScoutDaily() {
  const game = useStartScout();
  const today = todayISO();
  const settings = useMemo(() => scoutDailySettings(today), [today]);
  const records = useScoutResultStore((s) => s.records);
  const daily = useMemo(() => scoutDailyResults(records), [records]);
  const result = useMemo(() => scoutDailyRecord(records, today), [records, today]);
  const streak = useMemo(() => dailyStreak(new Set(Object.keys(daily)), today), [daily, today]);
  const days = useMemo(() => lastNDays(today, 14), [today]);

  const mode = SCOUT_MODES.find((m) => m.id === settings.mode);
  const pack = scoutPack(settings.packIds[0] ?? '');
  const accent = SCOUT_MODE_ACCENT[settings.mode];

  const rules = [
    { icon: <ListChecks />, text: `${roundsLabel(settings.rounds)}, ${triesLabel(settings.tries)} per subject` },
    {
      icon: <Timer />,
      text: settings.roundTimer > 0 ? `${settings.roundTimer}s on the clock each round` : 'No clock — take your time',
    },
    { icon: <Globe />, text: 'Seeded by the date — everyone gets the same subjects in the same order' },
    { icon: <RotateCcw />, text: 'One attempt per day. A new mode drops at local midnight' },
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
        title={<span id="scout-daily-title">Today's assignment</span>}
        description="Eight subjects, five tries, one shot. The mode rotates every day and the order is fixed by the date, so you and your group are looking at exactly the same board."
        size="lg"
      />

      <ScoutResumeBanner />

      {/*
        Left column is the brief, right column is the button — and nothing is said in both. The mode
        name, its blurb, its `how` line and the pack live in the card below; the rules live in the
        one under it; the call to action carries only what belongs next to a button. (Both cards used
        to print `mode.how` verbatim, side by side.) No `lg:items-start`, so the shorter column
        stretches and the button sits at the optical centre of the row instead of leaving dead card.
      */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-4">
          <Card
            padding="lg"
            className="min-h-40 overflow-hidden"
            style={{
              background: `linear-gradient(155deg, color-mix(in oklab, ${accent} 30%, var(--sg-bg-elevated)) 0%, color-mix(in oklab, ${accent} 6%, var(--sg-bg-elevated)) 75%)`,
            }}
            data-testid="scout-daily-mode"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full opacity-40 blur-3xl"
              style={{ background: accent }}
            />
            <div className="relative flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-fg/70">Mode of the day</span>
              <h2 className="font-display text-2xl font-black leading-tight text-fg sm:text-3xl">
                <span aria-hidden className="mr-1.5">
                  {mode?.emoji}
                </span>
                {mode?.name ?? settings.mode}
              </h2>
              <p className="text-sm text-fg/85">{mode?.blurb}</p>
              <p className="font-mono text-xs text-fg/70">{mode?.how}</p>
              {pack && (
                <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-sm text-muted">
                  <span aria-hidden>{pack.emoji}</span>
                  <span className="font-semibold text-fg">{pack.name}</span>
                  {settings.difficulty !== 'any' && (
                    <span>· {SCOUT_DIFFICULTY_INFO[settings.difficulty].label}</span>
                  )}
                </p>
              )}
            </div>
          </Card>

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
            <ScoutDailyResultCard record={result} streak={streak} />
            <MidnightCountdown label="Tomorrow's assignment in" className="px-1" />
          </div>
        ) : (
          <Card padding="lg" glow className="overflow-hidden">
            <div className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-accent-2 opacity-20 blur-3xl" aria-hidden />
            <div className="relative flex flex-col items-start gap-4 lg:h-full lg:justify-center">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Not played yet</div>
              <h2 className="font-display text-2xl font-black leading-tight text-fg sm:text-3xl">
                One shot at <span className="text-gradient">today's eight</span>
              </h2>
              <p className="text-sm text-muted">
                Solve on the first rung for the most points — every miss after that trades score for a
                clue. There is no second attempt.
              </p>
              {streak > 0 && (
                <p
                  className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-3 py-1.5 text-sm font-bold text-warn"
                  data-testid="scout-daily-streak"
                >
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
                data-testid="scout-play-daily"
              >
                {game.loading ? 'Loading the roster…' : game.error ? 'Try again' : "Play today's assignment"}
              </Button>
              <MidnightCountdown label="Today's mode changes in" />
            </div>
          </Card>
        )}
      </div>

      <section aria-labelledby="scout-daily-history">
        <SectionHeading
          size="sm"
          title={<span id="scout-daily-history">Last two weeks</span>}
          description="Keep the streak alive — one assignment a day."
          className="mb-3"
        />
        <DailyCalendarStrip days={days} daily={daily} today={today} />
      </section>
      <ScoutReplaceDialog game={game} />
    </div>
  );
}
