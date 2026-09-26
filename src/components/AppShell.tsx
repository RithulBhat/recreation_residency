import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { CalendarDays, ChartColumn, Home, Library, Play, SlidersHorizontal } from 'lucide-react';
import type { ThemeName } from '@/hooks/useTheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from './ui/cn';
import { IconButton } from './ui/IconButton';
import { Popover } from './ui/Popover';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';
import { Logo } from './Logo';
import { ThemeGrid, ThemeSwitcher } from './ThemeSwitcher';
import { VolumeControl } from './VolumeControl';

export interface AppShellProps {
  theme: ThemeName;
  onThemeChange: (t: ThemeName) => void;
  /** 0..1 */
  volume: number;
  onVolumeChange: (v: number) => void;
  muted?: boolean;
  onMutedChange?: (m: boolean) => void;
  sfx?: boolean;
  onSfxChange?: (on: boolean) => void;
  /** Hide nav chrome (e.g. focus mode while playing). Header stays minimal. */
  immersive?: boolean;
  /** Extra controls rendered on the right of the top bar */
  extra?: ReactNode;
  children: ReactNode;
  /** Max content width. Default 'wide' (max-w-6xl). */
  width?: 'narrow' | 'wide' | 'full';
}

const NAV = [
  { to: '/setup', label: 'Play', icon: <Play /> },
  { to: '/packs', label: 'Packs', icon: <Library /> },
  { to: '/daily', label: 'Daily', icon: <CalendarDays /> },
  { to: '/stats', label: 'Stats', icon: <ChartColumn /> },
];

const MOBILE_NAV = [{ to: '/', label: 'Home', icon: <Home />, end: true }, ...NAV.map((n) => ({ ...n, end: false }))];

const widths = { narrow: 'max-w-3xl', wide: 'max-w-6xl', full: 'max-w-none' } as const;

/** Below 360 px the wordmark plus two icon buttons no longer fit on one row. */
const useCompactHeader = () => useMediaQuery('(max-width: 359px)');

type CompactControlsProps = Pick<AppShellProps, 'theme' | 'onThemeChange' | 'volume' | 'onVolumeChange' | 'muted' | 'onMutedChange'>;

/** Volume + theme folded into a single popover for very narrow screens. */
function CompactControls({ theme, onThemeChange, volume, onVolumeChange, muted, onMutedChange }: CompactControlsProps) {
  const effective = muted ? 0 : volume;
  return (
    <Popover aria-label="Sound & theme" width={256} trigger={<IconButton aria-label="Sound & theme" icon={<SlidersHorizontal />} />}>
      <div className="flex flex-col gap-3 p-2">
        <Slider
          label="Volume"
          value={Math.round(effective * 100)}
          onChange={(v) => {
            onVolumeChange(v / 100);
            if (muted && v > 0) onMutedChange?.(false);
          }}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
        />
        {onMutedChange && <Switch size="sm" label="Mute" checked={!!muted} onChange={onMutedChange} />}
        <div className="border-t border-border pt-3">
          <ThemeGrid theme={theme} onChange={onThemeChange} />
        </div>
      </div>
    </Popover>
  );
}

export function AppShell({
  theme,
  onThemeChange,
  volume,
  onVolumeChange,
  muted,
  onMutedChange,
  sfx,
  onSfxChange,
  immersive = false,
  extra,
  children,
  width = 'wide',
}: AppShellProps) {
  const compact = useCompactHeader();
  return (
    <div className="flex min-h-dvh flex-col px-safe">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>

      {/* Top bar */}
      <header className="sticky top-0 z-40 pt-safe">
        <div className="glass border-x-0 border-t-0 bg-bg/60">
          <div className={cn('mx-auto flex h-16 w-full items-center gap-3 px-4 sm:px-6', widths[width])}>
            <Link to="/" className="flex min-h-11 min-w-0 items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-2" aria-label="Songooner home">
              <Logo size="md" />
            </Link>

            {!immersive && (
              <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
                {NAV.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className={({ isActive }) =>
                      cn(
                        'touch-hit-44 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors [&>svg]:size-4',
                        isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface hover:text-fg',
                      )
                    }
                  >
                    {n.icon}
                    {n.label}
                  </NavLink>
                ))}
              </nav>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-1">
              {extra}
              {compact ? (
                <CompactControls theme={theme} onThemeChange={onThemeChange} volume={volume} onVolumeChange={onVolumeChange} muted={muted} onMutedChange={onMutedChange} />
              ) : (
                <>
                  <VolumeControl volume={volume} onVolumeChange={onVolumeChange} muted={muted} onMutedChange={onMutedChange} sfx={sfx} onSfxChange={onSfxChange} />
                  <ThemeSwitcher theme={theme} onChange={onThemeChange} />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main id="main" className={cn('mx-auto w-full flex-1 px-4 pt-6 sm:px-6 sm:pt-8', widths[width], immersive ? 'pb-safe' : 'pb-safe-nav md:pb-12')}>
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      {!immersive && (
        <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden" aria-label="Primary mobile">
          <div className="glass-strong border-x-0 border-b-0 bg-bg/80 pb-safe">
            <ul className="grid h-[4.5rem] grid-cols-5 px-1">
              {MOBILE_NAV.map((n) => (
                <li key={n.to} className="min-w-0">
                  <NavLink
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      cn(
                        'flex h-full flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition-colors [&>svg]:size-5',
                        isActive ? 'text-accent' : 'text-muted',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            'grid h-7 w-12 place-items-center rounded-full transition-colors [&>svg]:size-5',
                            isActive && 'bg-accent/15',
                          )}
                          aria-hidden
                        >
                          {n.icon}
                        </span>
                        <span>{n.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </div>
  );
}
