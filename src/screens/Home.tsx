import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  CalendarDays,
  Disc3,
  Flame,
  Library,
  Mic,
  PartyPopper,
  Play,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Timer,
  Users,
  Zap,
} from 'lucide-react';
import type { Pack } from '@/types';
import type { LoadedGame } from '@/lib/startGame';
import { useSettingsStore } from '@/store/settingsStore';
import { useStartGame } from '@/hooks/useStartGame';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Vinyl, type VinylState } from '@/components/Vinyl';
import { Visualizer } from '@/components/Visualizer';
import { ModeCard } from '@/components/ModeCard';
import { PackCard } from '@/components/PackCard';
import { SectionHeading } from '@/components/SectionHeading';
import { HowItWorks } from '@/components/HowItWorks';
import { Footer } from '@/components/Footer';
import { ReplaceGameDialog, ResumeBanner } from '@/components/ResumeGame';

/* ------------------------------------------------------------------ */
/* Fallback packs (until the catalog is wired)                          */
/* ------------------------------------------------------------------ */

export const FALLBACK_PACKS: Pack[] = [
  { id: 'pop-hits', name: 'Pop Hits', emoji: '🎤', tagline: 'The biggest pop anthems of the last decade.', category: 'genre', tags: ['pop', 'english', '2010s', '2020s'], accent: '#f472b6', sources: [{ kind: 'chart', genreId: 132 }], approxSize: 240, featured: true },
  { id: '2000s', name: '2000s', emoji: '💿', tagline: 'Ringtones, iPods and low-rise jeans.', category: 'decade', tags: ['2000s', 'throwback', 'english'], accent: '#22d3ee', sources: [{ kind: 'search', q: '2000s hits' }], approxSize: 180, featured: true },
  { id: 'bollywood', name: 'Bollywood', emoji: '🎬', tagline: 'Blockbuster soundtracks from Mumbai.', category: 'region', tags: ['hindi', 'bollywood', 'soundtrack'], accent: '#f59e0b', sources: [{ kind: 'chart', genreId: 0 }], approxSize: 300, featured: true },
  { id: 'hip-hop', name: 'Hip-Hop', emoji: '🔥', tagline: 'From boom bap to trap.', category: 'genre', tags: ['hip-hop', 'rap', 'english'], accent: '#a855f7', sources: [{ kind: 'chart', genreId: 116 }], approxSize: 220, featured: true, explicitHeavy: true },
  { id: 'rock-classics', name: 'Rock Classics', emoji: '🎸', tagline: 'Riffs your dad air-guitars to.', category: 'genre', tags: ['rock', 'classic', '70s', '80s'], accent: '#fb7185', sources: [{ kind: 'chart', genreId: 152 }], approxSize: 200 },
  { id: 'k-pop', name: 'K-Pop', emoji: '💜', tagline: 'Idols, choreo and hooks that never leave.', category: 'region', tags: ['k-pop', 'korean', 'pop'], accent: '#818cf8', sources: [{ kind: 'search', q: 'k-pop' }], approxSize: 160, featured: true },
  { id: 'movie-soundtracks', name: 'Movie Soundtracks', emoji: '🍿', tagline: 'Name the film from the theme.', category: 'soundtrack', tags: ['soundtrack', 'film', 'instrumental'], accent: '#34d399', sources: [{ kind: 'search', q: 'soundtrack' }], approxSize: 140 },
  { id: 'party-anthems', name: 'Party Anthems', emoji: '🪩', tagline: 'Floor-fillers only.', category: 'vibe', tags: ['party', 'dance', 'edm'], accent: '#fbbf24', sources: [{ kind: 'chart', genreId: 113 }], approxSize: 210, featured: true },
];

/* ------------------------------------------------------------------ */
/* Modes                                                                */
/* ------------------------------------------------------------------ */

export const MODES = [
  { icon: <Disc3 />, name: 'Classic', blurb: 'Heardle-style. The clip grows every try.', how: '0.1s → 10s · 6 tries', to: '/setup?mode=classic', accent: '#a855f7' },
  { icon: <Timer />, name: 'Fixed clip', blurb: 'One clip length for every song. You pick it.', how: 'Any length 0.1–10s', to: '/setup?mode=fixed', accent: '#22d3ee' },
  { icon: <Zap />, name: 'Blitz', blurb: 'Sixty seconds. How many can you name?', how: 'Wrong guess −3s', to: '/setup?mode=blitz', accent: '#fbbf24' },
  { icon: <Flame />, name: 'Survival', blurb: 'Three lives. Clips shrink as you win.', how: '−15% per correct', to: '/setup?mode=survival', accent: '#fb7185' },
  { icon: <Swords />, name: 'Duel', blurb: 'Two players, one buzzer, same device — or online.', how: 'A vs L keys · room codes', to: '/setup?mode=duel', accent: '#f472b6' },
  { icon: <PartyPopper />, name: 'Party', blurb: 'Two to eight players. Pass the phone.', how: 'Turn-based · scoreboard', to: '/setup?mode=party', accent: '#34d399' },
  { icon: <CalendarDays />, name: 'Daily', blurb: 'One seeded run a day. Same songs for everyone.', how: 'Resets at midnight', to: '/daily', accent: '#818cf8' },
  { icon: <Share2 />, name: 'Challenge a friend', blurb: 'Send a link. Same tracks, same rules, beat my score.', how: 'Share code · no account', to: '/setup?share=1', accent: '#fb923c' },
] as const;

const FEATURES = [
  { icon: <Library />, text: 'Thousands of songs · 150+ packs' },
  { icon: <Timer />, text: 'Any clip length, 0.1–10s' },
  { icon: <Swords />, text: 'Duels & online rooms' },
  { icon: <Users />, text: 'Party mode for 2–8' },
  { icon: <Mic />, text: 'Voice guessing' },
  { icon: <CalendarDays />, text: 'Daily challenge' },
];

/* ------------------------------------------------------------------ */

// Values of (nearly) equal width in Unbounded — "2" alone is half the width of "0.5" and would leave
// a hole in the reserved cell.
const CLIPS = ['0.1', '0.5', '2.5', '10'];

function ClipTicker() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % CLIPS.length), 1900);
    return () => window.clearInterval(id);
  }, [reduce]);
  const value = CLIPS[i] ?? '0.1';
  // Proportional figures (no `tabular`): Unbounded's tabular "1" sits in a full digit cell and left a
  // visible hole between "0.1" and "seconds". The cell is as wide as the widest value ("0.5" = 2.2ch)
  // so the headline never re-wraps as it ticks; narrower values centre inside it.
  return (
    <span className="inline-grid justify-items-center overflow-hidden align-bottom" style={{ minWidth: '2.2ch' }} aria-live="off">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduce ? { opacity: 0 } : { y: '110%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: '-110%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="col-start-1 row-start-1"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

interface HeroVinylProps {
  /** Starts a game from the saved settings; resolves null when nothing started (declined / failed). */
  onStart: () => Promise<LoadedGame | null>;
}

/** The hero record IS the play button: one tap loads the saved setup and lands on /play. */
function HeroVinyl({ onStart }: HeroVinylProps) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<VinylState>('idle');
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);

  // A short needle-drop sweep while the pool loads; the ring parks at full if loading takes longer.
  useEffect(() => {
    if (state !== 'playing') return;
    const start = performance.now();
    const dur = reduce ? 0 : 1400;
    const tick = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
      setProgress(t);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [state, reduce]);

  const tap = () => {
    if (state !== 'idle') return;
    setState('playing');
    void onStart().then((loaded) => {
      if (loaded) return; // navigating away
      setState('idle');
      setProgress(0);
    });
  };

  return (
    <div className="relative mx-auto flex w-full max-w-sm flex-col items-center">
      <div className="pointer-events-none absolute inset-x-8 top-6 h-2/3 rounded-full bg-gradient-accent opacity-20 blur-3xl" aria-hidden />
      <Vinyl state={state} progress={progress} size="clamp(200px, 62vw, 340px)" clipLabel="0.1s" onClick={tap} aria-label="Start playing" />
      <div className="mt-3 h-9 w-full max-w-xs opacity-90 sm:mt-6 sm:h-14">
        <Visualizer analyser={null} active={false} variant="bars" bars={40} idleAmplitude={state === 'playing' ? 1 : 0.55} />
      </div>
      <p className="eyebrow-readable mt-2">{state === 'playing' ? 'Loading songs…' : 'Tap the record to play'}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface HomeProps {
  packs?: ReadonlyArray<Pack>;
}

export default function Home({ packs }: HomeProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const game = useStartGame();
  const settings = useSettingsStore((s) => s.settings);
  const featured = (packs && packs.length > 0 ? packs.filter((p) => p.featured) : FALLBACK_PACKS).slice(0, 8);
  const list = featured.length >= 4 ? featured : (packs && packs.length > 0 ? packs : FALLBACK_PACKS).slice(0, 8);

  // Songspot's whole advantage is "you are playing in one tap". Settings persist, so the CTA can
  // start the last setup straight away; the lobby is one ghost link away for anyone who wants it.
  const playNow = () => game.start(settings);

  const rise = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <div className="flex flex-col gap-16 sm:gap-24">
      {/* Hero */}
      <section
        className="flex flex-col gap-4 pt-1 sm:gap-8 sm:pt-10 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center"
        aria-labelledby="hero-title"
      >
        {/* `contents` below sm flattens the copy into the section so the record can sit between the
            headline and the subhead on a phone (badge → headline → record → subhead → Play now). */}
        <div className="contents sm:flex sm:min-w-0 sm:flex-col sm:items-start sm:gap-5">
          <ResumeBanner className="order-first w-full sm:w-auto sm:min-w-80" />
          <motion.div {...rise(0)} className="order-1">
            <Badge tone="accent" dot>
              <Sparkles className="size-3" /> Free · no sign-up · nothing to install
            </Badge>
          </motion.div>
          <motion.h1
            id="hero-title"
            {...rise(0.1)}
            className="order-2 max-w-full font-display text-[clamp(1.9rem,9.2vw,2.6rem)] font-black leading-[1.02] tracking-tight text-fg sm:text-6xl lg:text-[4.4rem]"
          >
            Name the track from{' '}
            <span className="text-gradient whitespace-nowrap">
              <ClipTicker /> seconds.
            </span>
          </motion.h1>
          <motion.p {...rise(0.18)} className="order-4 max-w-xl text-base text-muted sm:text-lg">
            Thousands of songs, <strong className="font-semibold text-fg">150+ packs</strong>, any clip from 0.1 to 10 seconds.
          </motion.p>
          <motion.div {...rise(0.26)} className="order-5 flex w-full flex-col gap-2 sm:mt-3 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <Button
              variant="glow"
              size="xl"
              onClick={() => void playNow()}
              loading={game.loading}
              leadingIcon={<Play className="fill-current" />}
              className="w-full sm:w-auto"
              data-testid="play-now"
            >
              Play now
            </Button>
            <div className="flex items-center justify-center gap-1 sm:justify-start">
              <Button variant="ghost" size="md" to="/setup" leadingIcon={<SlidersHorizontal />}>
                Customise
              </Button>
              <Button variant="ghost" size="md" to="/daily" leadingIcon={<CalendarDays />}>
                Daily
              </Button>
            </div>
          </motion.div>
          {game.error && (
            <p className="order-5 text-sm font-semibold text-danger" role="alert">
              {game.error}{' '}
              <Link to="/setup" className="font-semibold text-fg underline-offset-2 hover:underline">
                Change the setup
              </Link>
            </p>
          )}
        </div>

        <motion.div {...rise(0.2)} className="order-3 sm:order-none sm:py-2">
          <HeroVinyl onStart={playNow} />
        </motion.div>

        <motion.ul
          {...rise(0.34)}
          className="order-6 flex flex-wrap justify-center gap-2 sm:order-none lg:col-span-2 lg:justify-start"
          aria-label="Highlights"
        >
          {FEATURES.map((f) => (
            <li key={f.text} className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-fg/85 [&>svg]:size-3.5 [&>svg]:text-accent">
              {f.icon}
              {f.text}
            </li>
          ))}
        </motion.ul>
      </section>

      {/* Modes */}
      <section aria-labelledby="modes-title">
        <SectionHeading
          eyebrow="Pick a mode"
          title={<span id="modes-title">Eight ways to play</span>}
          description="From a chill classic round to a sweaty sixty-second blitz."
          className="mb-6"
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {MODES.map((m) => (
            <ModeCard key={m.name} icon={m.icon} name={m.name} blurb={m.blurb} howItPlays={m.how} to={m.to} accent={m.accent} />
          ))}
        </div>
      </section>

      {/* Featured packs */}
      <section aria-labelledby="packs-title">
        <SectionHeading
          eyebrow="Featured packs"
          title={<span id="packs-title">Start with a vibe</span>}
          description="Mix as many as you like. Difficulty tiers keep it fair."
          action={
            <Button variant="ghost" size="sm" to="/packs" trailingIcon={<ArrowRight />}>
              All packs
            </Button>
          }
          className="mb-5"
        />
        <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          {list.map((p) => (
            <PackCard
              key={p.id}
              pack={p}
              size="sm"
              showFeatured={false}
              className="w-44 shrink-0 snap-start sm:w-52"
              onToggle={(id) => navigate(`/setup?packs=${encodeURIComponent(id)}`)}
              onPlay={(id) => navigate(`/setup?packs=${encodeURIComponent(id)}&autostart=1`)}
            />
          ))}
          <Link
            to="/packs"
            className="glass flex w-36 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-3xl text-sm font-semibold text-muted transition-colors hover:text-fg"
          >
            <span className="grid size-10 place-items-center rounded-full bg-surface-strong">
              <ArrowRight className="size-5" />
            </span>
            150+ more
          </Link>
        </div>
      </section>

      <HowItWorks />

      {/* Closing CTA */}
      <section className="glass noise relative overflow-hidden rounded-4xl p-6 text-center sm:p-12" aria-labelledby="cta-title">
        <div className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-accent-vivid opacity-25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -right-16 size-72 rounded-full bg-accent-2-vivid opacity-20 blur-3xl" aria-hidden />
        <div className="relative">
          <h2 id="cta-title" className="font-display text-2xl font-black tracking-tight text-fg sm:text-4xl">
            Think you know music? <span className="text-gradient">Prove it in 0.1s.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted sm:text-base">Grab a friend, pick a pack, and let the record spin.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button variant="glow" size="lg" onClick={() => void playNow()} loading={game.loading} leadingIcon={<Play className="fill-current" />}>
              Play now
            </Button>
            <Button variant="secondary" size="lg" to="/duel" leadingIcon={<Swords />}>
              Start a duel
            </Button>
          </div>
        </div>
      </section>

      <Footer className="mt-0" />
      <ReplaceGameDialog game={game} />
    </div>
  );
}
