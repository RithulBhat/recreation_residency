import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { CalendarDays, ChartColumn, Gamepad2, Home, Library, Play, SlidersHorizontal } from 'lucide-react';
import type { ThemeName } from '@/hooks/useTheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { GAME_HOME, GAME_LABEL, R, RESIDENCY_NAME, RESIDENCY_SHORT, activeGame, type GameKey } from '@/routes';
import { cn } from './ui/cn';
import { IconButton } from './ui/IconButton';
import { Popover } from './ui/Popover';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';
import { LogoGlyph } from './Logo';
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

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

/**
 * One nav per game — the shell reads the active game off the pathname, so the tabs always belong to
 * the game you are inside and the hub shows none at all.
 */
const GAME_NAV: Record<GameKey, readonly NavItem[]> = {
  // "Lobby", not "Play": the tab opens the setup screen, while "Play now" CTAs start a game.
  songooner: [
    { to: R.songooner.setup, label: 'Lobby', icon: <Gamepad2 /> },
    { to: R.songooner.packs, label: 'Packs', icon: <Library /> },
    { to: R.songooner.daily, label: 'Daily', icon: <CalendarDays /> },
    { to: R.songooner.stats, label: 'Stats', icon: <ChartColumn /> },
  ],
  scout: [
    { to: R.scout.setup, label: 'Play', icon: <Play /> },
    { to: R.scout.daily, label: 'Daily', icon: <CalendarDays /> },
    { to: R.scout.stats, label: 'Stats', icon: <ChartColumn /> },
  ],
};

/** Tailwind needs the column count as a literal class, so the two shapes are spelled out. */
const MOBILE_COLS: Record<number, string> = { 4: 'grid-cols-4', 5: 'grid-cols-5' };

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

/**
 * `Residency / Songooner` — the residency always links home, and the game name next to it is the
 * way back to the game's own lobby. The residency half never shrinks; the game name truncates, so
 * even "Highlight Scout" on a 320 px phone cannot push the row wider than the screen.
 */
function Brand({ game, compact, onHub }: { game: GameKey | null; compact: boolean; onHub: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <Link
        to={R.residency}
        aria-label={RESIDENCY_NAME}
        // On the hub the wordmark is the page you are already on, not a way out of it.
        aria-current={onHub ? 'page' : undefined}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-2 sm:gap-2"
      >
        <LogoGlyph size={compact ? 22 : 28} />
        <span
          className={cn(
            'wordmark text-gradient font-display font-black leading-none tracking-tight',
            compact ? 'text-sm' : 'text-lg sm:text-2xl',
          )}
        >
          {RESIDENCY_SHORT}
        </span>
      </Link>
      {game && (
        <>
          <span className="shrink-0 text-base font-light text-muted/60 sm:text-xl" aria-hidden>
            /
          </span>
          <Link
            to={GAME_HOME[game]}
            aria-label={`${GAME_LABEL[game]} home`}
            className={cn(
              'flex min-h-11 min-w-0 items-center rounded-xl font-display font-bold leading-none tracking-tight text-fg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-2',
              compact ? 'text-xs' : 'text-sm sm:text-lg',
            )}
          >
            <span className="truncate">{GAME_LABEL[game]}</span>
          </Link>
        </>
      )}
    </div>
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
  const { pathname } = useLocation();
  const game = activeGame(pathname);
  const nav = game ? GAME_NAV[game] : null;
  const mobileNav: readonly NavItem[] | null = game
    ? [{ to: GAME_HOME[game], label: 'Home', icon: <Home /> }, ...GAME_NAV[game]]
    : null;

  return (
    <div className="flex min-h-dvh flex-col px-safe">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>

      {/* Top bar */}
      {/* In focus mode on a sideways phone the 64 px bar is a fifth of the screen — the stage gets it back. */}
      <header className={cn('sticky top-0 z-40 pt-safe', immersive && 'landscape-phone:hidden')}>
        <div className="glass border-x-0 border-t-0 bg-bg/90">
          <div className={cn('mx-auto flex h-16 w-full items-center gap-3 px-4 sm:px-6', widths[width])}>
            <Brand game={game} compact={compact} onHub={pathname === R.residency} />

            {!immersive && nav && (
              <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
                {nav.map((n) => (
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
      <main
        id="main"
        className={cn(
          'mx-auto w-full flex-1 px-4 pt-6 sm:px-6 sm:pt-8',
          widths[width],
          immersive ? 'pb-safe' : mobileNav ? 'pb-safe-nav md:pb-12' : 'pb-12',
        )}
      >
        {children}
      </main>

      {/* Mobile bottom tab bar — a game's tabs; the hub has none, so it stays out of the way. */}
      {!immersive && mobileNav && (
        <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden" aria-label="Primary mobile">
          <div className="glass-strong border-x-0 border-b-0 bg-bg/97 pb-safe">
            <ul className={cn('grid h-[4.5rem] px-1', MOBILE_COLS[mobileNav.length] ?? 'grid-cols-5')}>
              {mobileNav.map((n, i) => (
                <li key={n.to} className="min-w-0">
                  <NavLink
                    to={n.to}
                    end={i === 0}
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
