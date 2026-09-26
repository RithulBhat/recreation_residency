import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bell,
  Disc3,
  Flame,
  Heart,
  Mic,
  Music,
  Play,
  Search,
  Settings,
  Share2,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useConfetti } from '@/hooks/useConfetti';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  ClipLengthSlider,
  Combobox,
  CountdownRing,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  Kbd,
  NumberTicker,
  Popover,
  ProgressBar,
  SegmentedControl,
  Sheet,
  Skeleton,
  Slider,
  Stepper,
  Switch,
  TabPanel,
  Tabs,
  Tooltip,
  useToast,
} from '@/components/ui';
import { Logo, LogoGlyph } from '@/components/Logo';
import { Vinyl } from '@/components/Vinyl';
import { Visualizer } from '@/components/Visualizer';
import { AlbumArt } from '@/components/AlbumArt';
import { PackCard } from '@/components/PackCard';
import { PackGrid } from '@/components/PackGrid';
import { ModeCard } from '@/components/ModeCard';
import { StatTile } from '@/components/StatTile';
import { SectionHeading } from '@/components/SectionHeading';
import { HowItWorks } from '@/components/HowItWorks';
import { Footer } from '@/components/Footer';
import { ThemeGrid } from '@/components/ThemeSwitcher';
import { BrandedLoader } from '@/components/BrandedLoader';
import { FALLBACK_PACKS, MODES } from './Home';

/* ------------------------------------------------------------------ */

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} data-gallery={id} className="scroll-mt-24" aria-labelledby={`${id}-h`}>
      <SectionHeading title={<span id={`${id}-h`}>{title}</span>} description={description} size="sm" className="mb-4" />
      <Card padding="md" className="flex flex-col gap-6">
        {children}
      </Card>
    </section>
  );
}

function Row({ label, children, wrap = true }: { label?: string; children: ReactNode; wrap?: boolean }) {
  return (
    <div>
      {label && <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted">{label}</div>}
      <div className={wrap ? 'flex flex-wrap items-center gap-3' : 'flex flex-col gap-3'}>{children}</div>
    </div>
  );
}

const SONGS = [
  { id: 1, title: 'Blinding Lights', artist: 'The Weeknd' },
  { id: 2, title: 'Levitating', artist: 'Dua Lipa' },
  { id: 3, title: 'Bad Guy', artist: 'Billie Eilish' },
  { id: 4, title: 'Shape of You', artist: 'Ed Sheeran' },
  { id: 5, title: 'As It Was', artist: 'Harry Styles' },
  { id: 6, title: 'Kesariya', artist: 'Arijit Singh' },
  { id: 7, title: 'Dynamite', artist: 'BTS' },
  { id: 8, title: 'Bohemian Rhapsody', artist: 'Queen' },
];

const COVER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 500'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f472b6'/><stop offset='.5' stop-color='#a855f7'/><stop offset='1' stop-color='#22d3ee'/></linearGradient></defs><rect width='500' height='500' fill='url(#g)'/><circle cx='340' cy='170' r='120' fill='#fff' fill-opacity='.22'/><circle cx='150' cy='340' r='90' fill='#0b0b12' fill-opacity='.35'/><rect x='40' y='40' width='120' height='120' rx='24' fill='#0b0b12' fill-opacity='.25'/><text x='40' y='450' font-family='Arial Black, Arial, sans-serif' font-size='58' font-weight='900' fill='#fff' fill-opacity='.92'>AFTER DARK</text></svg>`,
)}`;

/* ------------------------------------------------------------------ */

export default function Gallery() {
  const [theme, setTheme] = useTheme();
  const { toast } = useToast();
  const { fire } = useConfetti();

  const [clip, setClip] = useState(0.35);
  const [vol, setVol] = useState(70);
  const [sw, setSw] = useState(true);
  const [seg, setSeg] = useState<'fixed' | 'escalating'>('fixed');
  const [tab, setTab] = useState<'overview' | 'tracks' | 'share'>('overview');
  const [tries, setTries] = useState(3);
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState('');
  const [blur, setBlur] = useState(1);
  const [score, setScore] = useState(1240);
  const [selected, setSelected] = useState<string[]>(['pop-hits', 'k-pop']);
  const [chips, setChips] = useState<string[]>(['pop']);
  const [ring, setRing] = useState(1);
  const [vinylProgress, setVinylProgress] = useState(0.35);

  useEffect(() => {
    const id = window.setInterval(() => setRing((r) => (r <= 0 ? 1 : r - 0.02)), 200);
    return () => window.clearInterval(id);
  }, []);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SONGS.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q));
  }, [query]);

  const nav = [
    'themes', 'typography', 'buttons', 'chips', 'inputs', 'sliders', 'controls', 'overlays', 'feedback', 'data', 'vinyl', 'visualizer', 'albumart', 'packs', 'modes', 'sections',
  ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge tone="gradient" className="mb-3">Design system</Badge>
          <h1 className="font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">Gallery</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">Every primitive and feature component in every state. Visual QA surface — switch themes to check contrast.</p>
        </div>
        <nav className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Gallery sections">
          {nav.map((n) => (
            <a key={n} href={`#${n}`} className="glass shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold capitalize text-muted hover:text-fg">
              {n}
            </a>
          ))}
        </nav>
      </div>

      {/* Themes */}
      <Section id="themes" title="Themes" description="Tokens live on <html data-theme>. Everything below re-skins instantly.">
        <ThemeGrid theme={theme} onChange={setTheme} className="max-w-md grid-cols-2 sm:grid-cols-4" />
        <Row label="Tokens">
          {['bg', 'bg-elevated', 'surface', 'surface-strong', 'border', 'fg', 'muted', 'accent', 'accent-2', 'accent-3', 'success', 'danger', 'warn'].map((t) => (
            <div key={t} className="flex items-center gap-2 rounded-xl border border-border p-1.5 pr-3">
              <span className={`size-7 rounded-lg border border-border bg-${t}`} aria-hidden />
              <span className="font-mono text-[11px] text-muted">{t}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-xl border border-border p-1.5 pr-3">
            <span className="size-7 rounded-lg bg-gradient-accent" aria-hidden />
            <span className="font-mono text-[11px] text-muted">gradient-accent</span>
          </div>
        </Row>
        <Row label="Surfaces">
          <div className="glass rounded-2xl px-4 py-3 text-sm">.glass</div>
          <div className="glass-strong rounded-2xl px-4 py-3 text-sm">.glass-strong</div>
          <div className="glass glow rounded-2xl px-4 py-3 text-sm">.glow</div>
          <div className="glass border-gradient rounded-2xl px-4 py-3 text-sm">.border-gradient</div>
          <div className="glass noise rounded-2xl px-4 py-3 text-sm">.noise</div>
        </Row>
      </Section>

      {/* Typography */}
      <Section id="typography" title="Typography & Logo">
        <Row label="Logo" >
          <Logo size="sm" />
          <Logo size="md" />
          <Logo size="lg" />
          <Logo size="xl" />
          <LogoGlyph size={40} spinning />
        </Row>
        <div className="flex flex-col gap-2">
          <p className="font-display text-5xl font-black tracking-tight">Unbounded 900</p>
          <p className="font-display text-2xl font-bold">Unbounded 700 — display headings</p>
          <p className="text-lg">Space Grotesk — body copy, buttons, labels. The quick brown fox jumps over the lazy dog.</p>
          <p className="text-sm text-muted">Muted body — secondary copy and hints.</p>
          <p className="font-mono text-3xl tabular">0.35s · 1,240 pts · 00:59</p>
          <p className="text-gradient font-display text-4xl font-black">Gradient text</p>
        </div>
      </Section>

      {/* Buttons */}
      <Section id="buttons" title="Buttons" description="Variants × sizes, loading, icons, links, icon buttons.">
        <Row label="Variants">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="glow">Glow</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </Row>
        <Row label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="xl" leadingIcon={<Play className="fill-current" />}>Play now</Button>
        </Row>
        <Row label="Icons & links">
          <Button leadingIcon={<Play className="fill-current" />}>Leading</Button>
          <Button variant="secondary" trailingIcon={<Share2 />}>Trailing</Button>
          <Button variant="secondary" to="/">Router link</Button>
          <Button variant="ghost" href="https://deezer.com" target="_blank" rel="noreferrer">Anchor</Button>
          <Button pill variant="secondary" size="sm">Pill</Button>
          <Button fullWidth variant="secondary" className="sm:hidden">Full width</Button>
        </Row>
        <Row label="Icon buttons">
          <IconButton aria-label="Settings" icon={<Settings />} size="sm" />
          <IconButton aria-label="Settings" icon={<Settings />} />
          <IconButton aria-label="Settings" icon={<Settings />} size="lg" />
          <IconButton aria-label="Favourite" icon={<Heart />} variant="secondary" />
          <IconButton aria-label="Play" icon={<Play className="fill-current" />} variant="primary" />
          <IconButton aria-label="Delete" icon={<Zap />} variant="danger" />
          <IconButton aria-label="Active" icon={<Mic />} active />
          <IconButton aria-label="Square" icon={<Search />} shape="square" variant="secondary" />
          <IconButton aria-label="Disabled" icon={<Bell />} disabled />
        </Row>
        <Row label="Kbd">
          <span className="text-sm text-muted">Press <Kbd>Space</Kbd> to play, <Kbd>Enter</Kbd> to guess, <Kbd size="sm">A</Kbd>/<Kbd size="sm">L</Kbd> to buzz.</span>
        </Row>
      </Section>

      {/* Chips & badges */}
      <Section id="chips" title="Chips, Badges, Avatars">
        <Row label="Chips">
          {['pop', 'hip-hop', 'rock', '2010s', 'hindi'].map((c, i) => (
            <Chip key={c} selected={chips.includes(c)} onClick={() => setChips((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))} count={[240, 180, 120, 90, 300][i]} check>
              {c}
            </Chip>
          ))}
          <Chip size="sm" color="#f472b6" selected={false}>colored</Chip>
          <Chip size="sm" color="#f472b6" selected>colored selected</Chip>
          <Chip size="sm" icon={<Flame />}>icon</Chip>
        </Row>
        <Row label="Badges">
          <Badge>Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="success" icon={<Sparkles />}>Correct</Badge>
          <Badge tone="danger">Wrong</Badge>
          <Badge tone="warn">Partial</Badge>
          <Badge tone="gradient">New</Badge>
          <Badge tone="accent" dot>Live</Badge>
          <Badge size="sm">Small</Badge>
        </Row>
        <Row label="Avatars">
          <Avatar emoji="🦊" color="#fb923c" size="xs" name="Fox" />
          <Avatar emoji="🐼" color="#a855f7" size="sm" name="Panda" />
          <Avatar emoji="🐸" color="#34d399" size="md" name="Frog" />
          <Avatar emoji="🦄" color="#f472b6" size="lg" name="Unicorn" active />
          <Avatar emoji="🐙" color="#22d3ee" size="xl" name="Octopus" />
        </Row>
      </Section>

      {/* Inputs */}
      <Section id="inputs" title="Inputs & Combobox">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Player name" placeholder="e.g. DJ Rithul" hint="Shown on the scoreboard." />
          <Input label="Room code" placeholder="ABCD" leadingIcon={<Swords />} size="lg" />
          <Input label="With error" defaultValue="nope" error="That code doesn't exist." />
          <Input label="Disabled" placeholder="Nope" disabled />
          <Input size="xl" placeholder="Extra large guess box…" leadingIcon={<Search />} trailing={<IconButton aria-label="Voice" icon={<Mic />} variant="primary" size="sm" />} />
        </div>
        <Row label="Combobox (type 'b' or 'the')" wrap={false}>
          <Combobox
            value={query}
            onChange={setQuery}
            options={options}
            getKey={(s) => String(s.id)}
            getLabel={(s) => s.title}
            getDescription={(s) => s.artist}
            onSelect={(s) => {
              toast({ title: `Guessed “${s.title}”`, description: s.artist, tone: 'success' });
              setQuery('');
            }}
            onSubmit={(t) => toast({ title: `Free-text guess: ${t}`, tone: 'accent' })}
            placeholder="Guess the song or artist…"
            aria-label="Guess"
            size="xl"
            trailing={<IconButton aria-label="Voice guess" icon={<Mic />} variant="primary" size="sm" />}
          />
        </Row>
      </Section>

      {/* Sliders */}
      <Section id="sliders" title="Sliders & Stepper">
        <ClipLengthSlider value={clip} onChange={setClip} />
        <Slider label="Volume" value={vol} onChange={setVol} min={0} max={100} step={1} format={(v) => `${v}%`} />
        <Slider label="Log scale, no readout" value={clip} onChange={setClip} min={0.1} max={10} log format={(v) => `${v.toFixed(2)}s`} showValue={false} presets={[0.1, 1, 10]} ticks />
        <Slider label="Disabled" value={40} onChange={() => {}} min={0} max={100} disabled />
        <div className="grid gap-3 sm:grid-cols-2">
          <Stepper label="Tries per song" description="1–6" value={tries} onChange={setTries} min={1} max={6} />
          <Stepper label="Rounds" value={10} onChange={() => {}} min={0} max={50} step={5} size="lg" format={(v) => (v === 0 ? '∞' : String(v))} />
        </div>
      </Section>

      {/* Controls */}
      <Section id="controls" title="Switch, Segmented, Tabs">
        <div className="grid gap-4 sm:grid-cols-2">
          <Switch label="Voice host" description="A synthesized host narrates the game." checked={sw} onChange={setSw} />
          <Switch label="Explicit filter" checked={!sw} onChange={(v) => setSw(!v)} size="sm" />
          <Switch label="Disabled" checked disabled onChange={() => {}} />
          <Switch label="Right label" labelPosition="right" checked={sw} onChange={setSw} />
        </div>
        <Row label="Segmented">
          <SegmentedControl<'fixed' | 'escalating'> value={seg} onChange={setSeg} options={[{ value: 'fixed', label: 'Fixed', icon: <Timer /> }, { value: 'escalating', label: 'Escalating', icon: <Flame /> }]} />
          <SegmentedControl<'fixed' | 'escalating'> size="sm" value={seg} onChange={setSeg} options={[{ value: 'fixed', label: 'Fixed' }, { value: 'escalating', label: 'Escalating' }]} />
          <SegmentedControl<'fixed' | 'escalating'> size="lg" fullWidth className="sm:max-w-sm" value={seg} onChange={setSeg} options={[{ value: 'fixed', label: 'Fixed' }, { value: 'escalating', label: 'Escalating' }]} />
        </Row>
        <div>
          <Tabs<'overview' | 'tracks' | 'share'> idPrefix="g" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview', icon: <Trophy /> }, { value: 'tracks', label: 'Tracks', count: 12 }, { value: 'share', label: 'Share', icon: <Share2 /> }]} />
          <TabPanel idPrefix="g" value="overview" active={tab} className="pt-4 text-sm text-muted">Overview panel content.</TabPanel>
          <TabPanel idPrefix="g" value="tracks" active={tab} className="pt-4 text-sm text-muted">Tracks panel content.</TabPanel>
          <TabPanel idPrefix="g" value="share" active={tab} className="pt-4 text-sm text-muted">Share panel content.</TabPanel>
        </div>
      </Section>

      {/* Overlays */}
      <Section id="overlays" title="Dialog, Sheet, Popover, Tooltip">
        <Row>
          <Button variant="secondary" onClick={() => setDialog(true)}>Open dialog</Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>Open sheet</Button>
          <Popover trigger={<Button variant="secondary">Popover</Button>} aria-label="Example popover" align="start">
            <div className="p-2 text-sm">
              <div className="font-semibold text-fg">Quick settings</div>
              <div className="mt-2"><Switch size="sm" label="Hints" checked={sw} onChange={setSw} /></div>
            </div>
          </Popover>
          <Tooltip content="Replay the clip (Space)">
            <IconButton aria-label="Replay" icon={<Play />} variant="secondary" />
          </Tooltip>
          <Tooltip content="Below" side="bottom">
            <Button variant="ghost">Hover me</Button>
          </Tooltip>
        </Row>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Give up on this one?"
          description="You'll see the answer and lose the round."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>Keep trying</Button>
              <Button variant="danger" onClick={() => setDialog(false)}>Reveal</Button>
            </>
          }
        >
          <p className="text-sm text-muted">Dialogs trap focus, lock scroll, close on Escape or backdrop click, and slide up as a sheet on small screens.</p>
        </Dialog>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Game settings" description="Bottom sheet on mobile, drawer on desktop.">
          <div className="flex flex-col gap-5">
            <ClipLengthSlider value={clip} onChange={setClip} compact />
            <Switch label="Hints" checked={sw} onChange={setSw} />
            <Stepper label="Tries" value={tries} onChange={setTries} min={1} max={6} />
          </div>
        </Sheet>
      </Section>

      {/* Feedback */}
      <Section id="feedback" title="Toast, Progress, Skeleton, Loader, Empty state">
        <Row label="Toasts">
          <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Saved', description: 'Your settings are stored locally.' })}>Neutral</Button>
          <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Correct!', description: '+1,240 pts', tone: 'success' })}>Success</Button>
          <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Wrong', description: 'Two tries left.', tone: 'danger' })}>Danger</Button>
          <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Streak at risk', tone: 'warn', action: { label: 'Use a hint', onClick: () => {} } })}>Warn + action</Button>
          <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Sticky toast', tone: 'accent', duration: 0 })}>Sticky</Button>
          <Button variant="glow" size="sm" onClick={() => fire('win')}>Confetti</Button>
          <Button variant="glow" size="sm" onClick={() => fire('big')}>Big confetti</Button>
        </Row>
        <div className="grid gap-4 sm:grid-cols-2">
          <ProgressBar value={0.66} label="Round 7 of 10" showValue />
          <ProgressBar value={0.4} size="lg" color="var(--sg-success)" label="Accuracy" showValue />
          <ProgressBar value={0.5} segments={6} label="Tries" />
          <ProgressBar value={0} indeterminate label="Loading previews" size="sm" />
        </div>
        <Row label="Skeleton">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-24" />
          <Skeleton circle className="size-12" />
          <Skeleton className="h-24 w-24 rounded-3xl" />
        </Row>
        <div className="grid gap-4 sm:grid-cols-2">
          <BrandedLoader label="Decoding preview…" />
          <EmptyState icon={<Music />} title="No tracks yet" description="Pick a pack to fill the queue." action={<Button size="sm" variant="secondary">Browse packs</Button>} size="sm" />
        </div>
      </Section>

      {/* Data */}
      <Section id="data" title="NumberTicker, CountdownRing, StatTile">
        <Row>
          <div className="font-mono text-5xl font-semibold tabular"><NumberTicker value={score} /></div>
          <Button variant="secondary" size="sm" onClick={() => setScore(Math.round(Math.random() * 20000))}>Randomize</Button>
          <NumberTicker value={0.87} decimals={2} className="text-2xl" suffix="s" />
        </Row>
        <Row label="Countdown ring">
          <CountdownRing progress={ring} size={80}><span className="text-lg">{Math.ceil(ring * 30)}</span></CountdownRing>
          <CountdownRing progress={0.62} size={56} stroke={5}><span className="text-sm">19</span></CountdownRing>
          <CountdownRing progress={0.15} size={56} stroke={5}><span className="text-sm">4</span></CountdownRing>
          <CountdownRing progress={1} size={40} stroke={4} color="var(--sg-success)" />
        </Row>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Score" value={12480} icon={<Trophy />} tone="accent" />
          <StatTile label="Accuracy" value={78} suffix="%" icon={<Sparkles />} tone="success" hint="Last 7 days" />
          <StatTile label="Best streak" value={14} icon={<Flame />} tone="warn" />
          <StatTile label="Fastest" value="0.9s" icon={<Timer />} size="sm" />
        </div>
      </Section>

      {/* Vinyl */}
      <Section id="vinyl" title="Vinyl" description="THE play button. Spins only while playing. Space/Enter to trigger.">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {(['idle', 'loading', 'playing', 'done'] as const).map((s) => (
            <div key={s} className="flex flex-col items-center gap-3">
              <Vinyl state={s} progress={s === 'playing' ? vinylProgress : s === 'done' ? 1 : 0} size="min(38vw, 180px)" clipLabel="0.1s" coverUrl={s === 'done' ? COVER : undefined} blur={s === 'done' ? 0 : 1} onClick={() => setVinylProgress((p) => (p >= 1 ? 0.1 : p + 0.2))} />
              <span className="font-mono text-xs uppercase tracking-widest text-muted">{s}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-4">
          <Vinyl state="playing" progress={vinylProgress} size="min(70vw, 320px)" clipLabel="2.5s" coverUrl={COVER} blur={0.6} onClick={() => setVinylProgress((p) => (p >= 1 ? 0.1 : p + 0.2))} />
          <span className="text-xs text-muted">Hero size · cover 60% blurred · click to advance progress</span>
        </div>
      </Section>

      {/* Visualizer */}
      <Section id="visualizer" title="Visualizer" description="Canvas, DPR-aware. Idle animation without an analyser.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="glass h-28 rounded-2xl p-3"><Visualizer analyser={null} active={false} variant="bars" /></div>
          <div className="glass h-28 rounded-2xl p-3"><Visualizer analyser={null} active={false} variant="wave" /></div>
          <div className="glass h-28 rounded-2xl p-3"><Visualizer analyser={null} active={false} variant="ring" /></div>
        </div>
        <div className="glass h-16 rounded-2xl p-2"><Visualizer analyser={null} active={false} variant="bars" bars={72} color="var(--sg-success)" mirror={false} /></div>
      </Section>

      {/* Album art */}
      <Section id="albumart" title="AlbumArt" description="Blur 0..1 with shimmer; flips when fully revealed.">
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:items-center">
          <AlbumArt src={COVER} alt="Album cover" blur={blur} size={200} />
          <div className="flex flex-col gap-4">
            <Slider label="Blur" value={blur} onChange={setBlur} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} presets={[1, 0.6, 0.3, 0]} />
            <Row label="Sizes & fallback">
              <AlbumArt src={COVER} blur={1} size={72} rounded="xl" />
              <AlbumArt src={COVER} blur={0.5} size={72} rounded="2xl" />
              <AlbumArt src={COVER} blur={0} size={72} rounded="full" />
              <AlbumArt blur={0} size={72} rounded="xl" />
              <AlbumArt blur={0} size={72} rounded="xl" emoji="🎸" />
            </Row>
          </div>
        </div>
      </Section>

      {/* Packs */}
      <Section id="packs" title="PackCard & PackGrid" description="Props-driven — pass packs, selectedIds, onToggle.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PackCard pack={FALLBACK_PACKS[0]!} selected onToggle={() => {}} onPlay={() => {}} />
          <PackCard pack={FALLBACK_PACKS[1]!} onToggle={() => {}} onPlay={() => {}} />
          <PackCard pack={FALLBACK_PACKS[2]!} size="sm" onToggle={() => {}} />
          <PackCard pack={FALLBACK_PACKS[3]!} size="sm" selected onToggle={() => {}} />
        </div>
        <PackGrid
          packs={FALLBACK_PACKS}
          selectedIds={selected}
          onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          onPlay={(id) => toast({ title: `Play ${id}` })}
          onPlaySelection={() => toast({ title: `Mixing ${selected.length} packs`, tone: 'success' })}
          onClearSelection={() => setSelected([])}
          onSurprise={() => setSelected(FALLBACK_PACKS.slice(0, 3).map((p) => p.id))}
        />
      </Section>

      {/* Modes */}
      <Section id="modes" title="ModeCard">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.slice(0, 4).map((m) => (
            <ModeCard key={m.name} icon={m.icon} name={m.name} blurb={m.blurb} howItPlays={m.how} to={m.to} accent={m.accent} />
          ))}
          <ModeCard icon={<Disc3 />} name="Disabled" blurb="Coming soon." to="/" disabled badge="Soon" />
          <ModeCard icon={<Zap />} name="Large" blurb="Bigger padding for hero placements." howItPlays="size=lg" to="/" size="lg" badge="New" accent="#22d3ee" />
        </div>
      </Section>

      {/* Sections */}
      <Section id="sections" title="SectionHeading, HowItWorks, Footer">
        <SectionHeading eyebrow="Eyebrow" title="Section heading" description="With a description and an action." action={<Button variant="ghost" size="sm">Action</Button>} />
        <SectionHeading title="Centered large" size="lg" align="center" description="Centered variant." />
        <HowItWorks />
        <Footer className="mt-0" />
      </Section>
    </div>
  );
}
