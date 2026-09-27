import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Binoculars,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  Film,
  Keyboard,
  Landmark,
  Layers,
  Play,
  ScanFace,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Button, cn } from '@/components/ui';
import { ModeCard } from '@/components/ModeCard';
import { SectionHeading } from '@/components/SectionHeading';
import { SilhouetteSample, startScoutGame, useScoutStarting } from '@/components/scout';
import { R } from '@/routes';
import { SCOUT_MODES } from '@/scout/packs';
import type { ScoutMode } from '@/scout/types';
import { useScoutResultStore } from '@/store/scoutResultStore';
import { useScoutSettingsStore } from '@/store/scoutStore';

/** Icon + accent per mode, so the seven cards read as seven different games. */
const MODE_ART: Readonly<Record<ScoutMode, { icon: ReactNode; accent: string }>> = {
  silhouette: { icon: <ScanFace />, accent: '#a855f7' },
  faceZoom: { icon: <Search />, accent: '#22d3ee' },
  highlight: { icon: <Film />, accent: '#f472b6' },
  teamTrivia: { icon: <Landmark />, accent: '#34d399' },
  statLine: { icon: <ChartColumn />, accent: '#fbbf24' },
  careerPath: { icon: <ClipboardList />, accent: '#818cf8' },
  logoZoom: { icon: <Binoculars />, accent: '#fb7185' },
};

/**
 * Copy rule for this list: it has to stay TRUE whatever the clip harvest comes back with. Official
 * tape exists for the famous end of the league and thins out fast further down, so the promise is a
 * link to the tape WHERE THERE IS ONE — never inline playback everywhere. (Most clips cannot be
 * embedded at all: the uploader blocks third-party playback, and the reveal falls back to a poster
 * and a YouTube link. Promising "plays on the reveal" would be wrong twice over.)
 */
const FEATURES = [
  { icon: <Layers />, text: 'Every active player · all 32 clubs' },
  { icon: <Sparkles />, text: 'Seven ways to guess' },
  { icon: <Film />, text: 'Real play-by-play, names redacted' },
  { icon: <Trophy />, text: 'His official tape on the reveal, wherever the league has published one' },
];

const STEPS = [
  {
    icon: <Binoculars />,
    title: 'Pick a mode',
    text: 'A blacked-out silhouette, an eyelash-close crop, a redacted play, a stat sheet, a draft trail, or a logo three pixels wide.',
  },
  {
    icon: <Keyboard />,
    // Two of the seven modes ask for a franchise, so nothing here calls the answer "him".
    title: 'Call it — or burn a try',
    text: 'Every miss lifts the shadow and buys a clue: position, conference, jersey, first initial. The earlier you get it, the more it pays.',
  },
  {
    icon: <Film />,
    title: 'Watch the tape',
    text: 'The reveal is the clean photo and the whole file — and when the NFL or the club has put a highlight reel out, the reveal hands you it.',
  },
];

/** Highlight Scout — the landing page. */
export default function ScoutHome() {
  const navigate = useNavigate();
  const settings = useScoutSettingsStore((s) => s.settings);
  const lastRecord = useScoutResultStore((s) => s.records[0]);
  const { starting } = useScoutStarting();
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      await startScoutGame({ ...settings, seed: undefined, daily: undefined });
      navigate(R.scout.play);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a session.');
    }
  }, [navigate, settings]);

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
            Real NFL rosters, real headshots, real play-by-play. You get a silhouette — or one eye, or a
            redacted touchdown — and five tries. Every miss trades points for a clue.
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
              Choose a mode
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

      {/* ------------------------------------------------------------------ modes */}
      <section className="mt-16" aria-label="Game modes">
        <SectionHeading
          eyebrow="Seven ways to play"
          title="Pick your poison"
          description="Each mode reveals its subject differently. Mix them in one run if you want the real test."
          as="h2"
          className="mb-6"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {SCOUT_MODES.map((m) => {
            const art = MODE_ART[m.id];
            return (
              <ModeCard
                key={m.id}
                icon={art.icon}
                name={m.name}
                blurb={m.blurb}
                howItPlays={m.guesses === 'team' ? 'Name the franchise' : 'Name the player'}
                to={`${R.scout.setup}?mode=${m.id}`}
                accent={art.accent}
              />
            );
          })}
          <ModeCard
            icon={<CalendarDays />}
            name="Daily scout"
            blurb="One seeded run a day. Same board for everyone."
            howItPlays="Resets at midnight"
            to={R.scout.daily}
            accent="#94a3b8"
            badge="Daily"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ how */}
      <section className="mt-16" aria-label="How it plays">
        <SectionHeading
          eyebrow="How it plays"
          title="Three steps. No account."
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
            YouTube channels.
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
