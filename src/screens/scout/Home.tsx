import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Binoculars,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  Film,
  GraduationCap,
  Hash,
  Keyboard,
  Landmark,
  Layers,
  ListOrdered,
  Play,
  Puzzle,
  Scale,
  ScanFace,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Button, cn } from '@/components/ui';
import { ModeCard } from '@/components/ModeCard';
import { SectionHeading } from '@/components/SectionHeading';
import { SCOUT_FORMAT_ACCENT, SilhouetteSample, startScoutGame, useScoutStarting } from '@/components/scout';
import { R } from '@/routes';
import { SCOUT_FORMATS } from '@/scout/formats';
import { SCOUT_MODES, scoutModeAnswer } from '@/scout/packs';
import { SCOUT_FORMAT_PRESETS, applyScoutPreset } from '@/scout/presets';
import { SCOUT_PUZZLE_MODES } from '@/scout/puzzles';
import type { ScoutFormatInfo } from '@/scout/formats';
import type { ScoutMode } from '@/scout/types';
import { useScoutResultStore } from '@/store/scoutResultStore';
import { useScoutSettingsStore } from '@/store/scoutStore';

/** Icon + accent per puzzle type, so thirteen cards read as thirteen different questions. */
const MODE_ART: Readonly<Record<ScoutMode, { icon: ReactNode; accent: string }>> = {
  silhouette: { icon: <ScanFace />, accent: '#a855f7' },
  faceZoom: { icon: <Search />, accent: '#22d3ee' },
  highlight: { icon: <Film />, accent: '#f472b6' },
  teamTrivia: { icon: <Landmark />, accent: '#34d399' },
  statLine: { icon: <ChartColumn />, accent: '#fbbf24' },
  careerPath: { icon: <ClipboardList />, accent: '#818cf8' },
  logoZoom: { icon: <Binoculars />, accent: '#fb7185' },
  teammates: { icon: <Users />, accent: '#f97316' },
  depthChart: { icon: <ListOrdered />, accent: '#14b8a6' },
  draftClass: { icon: <GraduationCap />, accent: '#a3e635' },
  higherLower: { icon: <Scale />, accent: '#38bdf8' },
  oddOneOut: { icon: <Puzzle />, accent: '#e879f9' },
  jersey: { icon: <Hash />, accent: '#facc15' },
};

/** What the player is actually naming, in four words. */
const ANSWER_LINE: Readonly<Record<string, string>> = {
  player: 'Name the player',
  team: 'Name the franchise',
  year: 'Name the draft year',
  option: 'Tap a card — no typing',
};

const REVEAL_MODES = SCOUT_MODES.filter((m) => !(SCOUT_PUZZLE_MODES as readonly ScoutMode[]).includes(m.id));
const CHOICE_MODES = SCOUT_MODES.filter((m) => (SCOUT_PUZZLE_MODES as readonly ScoutMode[]).includes(m.id));

/** Four runs worth putting one click away — one per shape of session. */
const FEATURED_PRESET_IDS = ['sixty-second-scout', 'last-man-standing', 'around-the-league', 'pass-the-laptop'];
const FEATURED_PRESETS = FEATURED_PRESET_IDS.map((id) => SCOUT_FORMAT_PRESETS.find((p) => p.id === id)).filter(
  (p): p is (typeof SCOUT_FORMAT_PRESETS)[number] => p !== undefined,
);

/**
 * Copy rule for this list: it has to stay TRUE whatever the clip harvest comes back with. Official
 * tape exists for the famous end of the league and thins out fast further down, so the promise is
 * numbers — 510 players have a verified clip out of 2,500 on a roster — and never inline playback
 * everywhere (a quarter of those clips are embed-blocked by their uploader and open on YouTube).
 */
const FEATURES = [
  { icon: <Layers />, text: '2,500 active players · all 32 clubs' },
  { icon: <Sparkles />, text: 'Six session formats × thirteen puzzle types' },
  { icon: <Film />, text: 'Real play-by-play, names redacted' },
  { icon: <Trophy />, text: 'Verified tape for 510 players — the rest open their ESPN file' },
];

const STEPS = [
  {
    icon: <Binoculars />,
    title: 'Pick a format',
    text: 'Ten calm rounds, ninety seconds against a clock, three lives, all 32 franchises, or two seats on one laptop.',
  },
  {
    icon: <Puzzle />,
    title: 'Pick what a round shows',
    text: 'A blacked-out silhouette, an eyelash-close crop, a redacted play, four of his teammates, two men and one stat. Mix them all if you want the real test.',
  },
  {
    icon: <Keyboard />,
    // Several puzzle types ask for a franchise or a year, so nothing here calls the answer "him".
    title: 'Call it — or burn a try',
    text: 'Every miss lifts the shadow and buys a clue: position, conference, jersey, first initial. The earlier you get it, the more it pays.',
  },
];

function FormatCard({ info, className }: { info: ScoutFormatInfo; className?: string }) {
  const accent = SCOUT_FORMAT_ACCENT[info.id];
  const seats = info.seats === 'solo' ? 'Solo' : info.seats === 'pair' ? '2 players' : '2–8 players';
  return (
    <Link
      to={`${R.scout.setup}?format=${info.id}`}
      data-testid="scout-format-card"
      data-format={info.id}
      className={cn(
        'group relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border p-4 transition-[border-color,box-shadow,transform] duration-200 hover:border-border-strong hover:shadow-glow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2',
        className,
      )}
      style={{
        background: `linear-gradient(155deg, color-mix(in oklab, ${accent} 24%, var(--sg-bg-elevated)) 0%, color-mix(in oklab, ${accent} 5%, var(--sg-bg-elevated)) 70%)`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full opacity-45 blur-3xl transition-opacity group-hover:opacity-75"
        style={{ background: accent }}
      />
      <div className="relative flex items-start gap-2.5">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-2xl text-lg leading-none shadow-lg"
          style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 55%, var(--sg-accent-2)))` }}
          aria-hidden
        >
          {info.emoji}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold leading-tight text-fg">{info.name}</h3>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{seats}</p>
        </div>
      </div>
      <p className="relative mt-3 text-sm leading-snug text-fg/85">{info.blurb}</p>
      <dl className="relative mt-3 flex flex-col gap-1 border-t border-border/70 pt-2.5 text-xs text-muted">
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-bold uppercase tracking-wider text-fg/60">How</dt>
          <dd className="min-w-0">{info.how}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-bold uppercase tracking-wider text-fg/60">Ends</dt>
          <dd className="min-w-0">{info.ends}</dd>
        </div>
      </dl>
    </Link>
  );
}

/** Highlight Scout — the landing page. Formats and puzzle types, presented as the two axes they are. */
export default function ScoutHome() {
  const navigate = useNavigate();
  const settings = useScoutSettingsStore((s) => s.settings);
  const lastRecord = useScoutResultStore((s) => s.records[0]);
  const { starting } = useScoutStarting();
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (over?: Partial<typeof settings>) => {
      setError(null);
      try {
        await startScoutGame({ ...settings, ...over, seed: undefined, daily: undefined });
        navigate(R.scout.play);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start a session.');
      }
    },
    [navigate, settings],
  );

  const startPreset = useCallback(
    async (presetId: string) => {
      setError(null);
      try {
        await startScoutGame({ ...applyScoutPreset(settings, presetId), seed: undefined, daily: undefined });
        navigate(R.scout.play);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start a session.');
      }
    },
    [navigate, settings],
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* ------------------------------------------------------------------ hero */}
      <section className="grid items-center gap-8 pt-2 sm:pt-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
        <div className="min-w-0">
          <Badge tone="gradient" size="sm" className="mb-4">
            Highlight Scout
          </Badge>
          <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-fg sm:text-5xl lg:text-6xl">
            Name the player from <span className="text-gradient">a shadow.</span>
          </h1>
          <p className="mt-4 max-w-prose text-base text-muted sm:text-lg">
            Real NFL rosters, real headshots, real play-by-play. Pick how the run is shaped and what a round
            shows you — a silhouette, four of his teammates, two men and one stat — and every miss trades
            points for a clue.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Button
              variant="glow"
              size="xl"
              leadingIcon={<Play className="fill-current" />}
              onClick={() => void start()}
              loading={starting}
              data-testid="scout-home-play"
            >
              Start scouting
            </Button>
            <Button variant="secondary" size="xl" to={R.scout.setup} leadingIcon={<SlidersHorizontal />}>
              Build a session
            </Button>
            <Button variant="ghost" size="lg" to={R.scout.daily} leadingIcon={<CalendarDays />}>
              Daily scout
            </Button>
          </div>
          {error !== null && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          <ul className="mt-7 grid gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-2 text-sm text-muted">
                <span className="text-accent [&>svg]:size-4" aria-hidden>
                  {f.icon}
                </span>
                {f.text}
              </li>
            ))}
          </ul>
          {lastRecord && (
            <p className="mt-6 text-sm text-muted" data-testid="scout-last-session">
              Last session: <span className="font-semibold text-fg">{lastRecord.correct}/{lastRecord.played}</span> ·{' '}
              <span className="font-mono text-fg tabular">{lastRecord.score.toLocaleString('en-US')}</span> pts ·{' '}
              <Button variant="ghost" size="sm" to={R.scout.stats} className="px-1.5 text-accent">
                see your stats
              </Button>
            </p>
          )}
        </div>

        <div className="mx-auto w-full max-w-[380px] lg:max-w-none">
          <SilhouetteSample />
        </div>
      </section>

      {/* ------------------------------------------------------------------ the two axes */}
      <section className="mt-16" aria-label="How a session is built">
        <SectionHeading
          eyebrow="Two dials, not one"
          title="Format × puzzle type"
          description="They are different questions. The FORMAT is the shape of the whole run; the PUZZLE TYPE is what one round puts in front of you. Every combination is a different game."
          as="h2"
          size="lg"
          className="mb-6"
        />
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
          <div className="glass flex min-w-0 flex-col rounded-3xl p-5" data-testid="scout-axis-format">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Axis 1 · Format</p>
            <h3 className="mt-1 font-display text-xl font-bold text-fg">How the run is shaped</h3>
            <p className="mt-2 text-sm text-muted">
              One clock, or three lives, or all 32 franchises, or two seats on one laptop. The format decides what
              ends the run and what a round costs you.
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {SCOUT_FORMATS.map((f) => (
                <li
                  key={f.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-semibold text-fg"
                >
                  <span aria-hidden>{f.emoji}</span>
                  {f.name}
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden place-items-center lg:grid" aria-hidden>
            <span className="font-display text-3xl font-black text-muted">×</span>
          </div>
          <div className="glass flex min-w-0 flex-col rounded-3xl p-5" data-testid="scout-axis-puzzle">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-accent-2">
              Axis 2 · Puzzle type
            </p>
            <h3 className="mt-1 font-display text-xl font-bold text-fg">What a round shows you</h3>
            <p className="mt-2 text-sm text-muted">
              Seven reveal one subject a piece at a time. Six put a set of real players on the table and ask a
              different question of it. Two of those want a tap, not a name.
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {SCOUT_MODES.slice(0, 7).map((m) => (
                <li
                  key={m.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-semibold text-fg"
                >
                  <span aria-hidden>{m.emoji}</span>
                  {m.name}
                </li>
              ))}
              <li className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-semibold text-muted">
                + 6 more
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-center font-mono text-xs text-muted sm:text-sm" data-testid="scout-axis-example">
          <span className="text-fg">⏱️ Blitz</span> × <span className="text-fg">🔍 Face Off</span> = ninety seconds of
          extreme close-ups · <span className="text-fg">🗺️ Gauntlet</span> × <span className="text-fg">📋 Depth Chart</span>{' '}
          = name all 32 clubs off their rosters
        </p>
      </section>

      {/* ------------------------------------------------------------------ formats */}
      <section className="mt-16" aria-label="Session formats">
        <SectionHeading
          eyebrow="Six formats"
          title="Pick the shape of the run"
          description="Each one changes what ends the session and how a round is scored."
          as="h2"
          className="mb-6"
        />
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {SCOUT_FORMATS.map((f) => (
            <FormatCard key={f.id} info={f} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ puzzle types */}
      <section className="mt-16" aria-label="Puzzle types">
        <SectionHeading
          eyebrow="Thirteen puzzle types"
          title="Pick what a round shows"
          description="Mix them in one run if you want the real test — every round then picks a type its subject can actually be played in."
          as="h2"
          className="mb-6"
          action={
            <Button variant="ghost" size="sm" to={R.scout.daily} leadingIcon={<CalendarDays />}>
              Daily scout
            </Button>
          }
        />
        <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
          One subject, revealed a piece at a time
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {REVEAL_MODES.map((m) => (
            <ModeCard
              key={m.id}
              icon={MODE_ART[m.id].icon}
              name={m.name}
              blurb={m.blurb}
              howItPlays={ANSWER_LINE[scoutModeAnswer(m.id)]}
              to={`${R.scout.setup}?mode=${m.id}`}
              accent={MODE_ART[m.id].accent}
            />
          ))}
        </div>
        <h3 className="mb-3 mt-8 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-accent-2">
          A set of real players, and a different question
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3">
          {CHOICE_MODES.map((m) => (
            <ModeCard
              key={m.id}
              icon={MODE_ART[m.id].icon}
              name={m.name}
              blurb={m.blurb}
              howItPlays={ANSWER_LINE[scoutModeAnswer(m.id)]}
              to={`${R.scout.setup}?mode=${m.id}`}
              accent={MODE_ART[m.id].accent}
              badge={scoutModeAnswer(m.id) === 'option' ? 'No typing' : undefined}
            />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ presets */}
      <section className="mt-16" aria-label="Ready-made runs">
        <SectionHeading
          eyebrow="One click"
          title="Ready-made runs"
          description="Both dials already set. Straight onto the board."
          as="h2"
          className="mb-6"
        />
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {FEATURED_PRESETS.map((p) => (
            <li key={p.id} className="glass flex min-w-0 flex-col rounded-3xl p-4">
              <div className="flex items-start gap-2.5">
                <span className="text-2xl leading-none" aria-hidden>
                  {p.emoji}
                </span>
                <h3 className="min-w-0 font-display text-base font-bold leading-tight text-fg">{p.name}</h3>
              </div>
              <p className="mt-2 flex-1 text-sm text-muted">{p.blurb}</p>
              <Button
                variant="secondary"
                size="md"
                className="mt-3"
                fullWidth
                trailingIcon={<ArrowRight />}
                loading={starting}
                onClick={() => void startPreset(p.id)}
                data-testid="scout-preset-start"
                data-preset={p.id}
              >
                Play it
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------------------ how */}
      <section className="mt-16" aria-label="How it plays">
        <SectionHeading
          eyebrow="How it plays"
          title="Three choices. No account."
          description="Everything runs in your browser — the rosters are baked in at build time."
          as="h2"
          className="mb-6"
        />
        <ol className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass relative overflow-hidden rounded-3xl p-5">
              <span
                className="pointer-events-none absolute -right-3 -top-6 select-none font-display text-[7rem] font-black leading-none text-fg/[0.045]"
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="relative flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-accent-fg shadow-glow [&>svg]:size-5" aria-hidden>
                  {s.icon}
                </span>
                <h3 className="font-display text-base font-bold text-fg">{s.title}</h3>
              </div>
              <p className="relative mt-3 text-sm leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------------ closer */}
      <section className={cn('glass noise relative mt-16 overflow-hidden rounded-4xl p-6 text-center sm:p-10')}>
        <div className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-accent opacity-25 blur-3xl" aria-hidden />
        <div className="relative">
          <h2 className="font-display text-2xl font-bold text-fg sm:text-3xl">Think you know the league?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Most people get the stars. The deep cuts are where scouts are made.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <Button variant="glow" size="lg" onClick={() => void start()} loading={starting} trailingIcon={<ArrowRight />}>
              Start scouting
            </Button>
            <Button variant="secondary" size="lg" to={R.scout.stats}>
              Your scouting record
            </Button>
          </div>
        </div>
      </section>

      {/* Scout has its own provenance line: the shared Footer credits Deezer, which is Songooner's
          data source, not this game's. */}
      <footer className="mt-16 border-t border-border pb-6 pt-6 text-xs text-muted">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="max-w-prose text-center sm:text-left">
            Rosters, headshots and play-by-play from ESPN's public data. Highlight tape from official NFL and club
            YouTube channels — 510 players have a verified clip, and a quarter of those open on YouTube because the
            uploader blocks embedding.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Footer">
            <Link to={R.scout.setup} className="touch-hit-44 inline-flex items-center hover:text-fg">
              Play
            </Link>
            <Link to={R.scout.daily} className="touch-hit-44 inline-flex items-center hover:text-fg">
              Daily
            </Link>
            <Link to={R.scout.stats} className="touch-hit-44 inline-flex items-center hover:text-fg">
              Stats
            </Link>
            <Link to={R.residency} className="touch-hit-44 inline-flex items-center hover:text-fg">
              Residency
            </Link>
          </nav>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted/70 sm:text-left">
          Not affiliated with the NFL or ESPN. Player images and clips belong to their owners.
        </p>
      </footer>
    </div>
  );
}
