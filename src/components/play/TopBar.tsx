import { CircleHelp, Flame, Heart, X } from 'lucide-react';
import type { GameState } from '@/types';
import { CountdownRing, IconButton, NumberTicker, cn } from '@/components/ui';
import { isMultiplayer } from '@/game/presets';
import { livesLeft, progress, timeLeftMs, wonRounds } from '@/game/selectors';
import { clock } from './format';

export interface TopBarProps {
  state: GameState;
  /** Clock sample (from `useGameClock`) for the countdown rings. */
  now: number;
  onQuit: () => void;
  onHelp: () => void;
}

function Lives({ lives, max }: { lives: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${lives} of ${max} lives left`}>
      {Array.from({ length: Math.max(max, lives) }, (_, i) => (
        <Heart
          key={i}
          className={cn('size-4 transition-colors', i < lives ? 'fill-danger text-danger' : 'text-fg/20')}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** Round / blitz clock on the left, score + streak (+ lives) on the right, help + quit at the end. */
export function TopBar({ state, now, onQuit, onHelp }: TopBarProps) {
  const { settings } = state;
  const blitz = settings.mode === 'blitz';
  const left = timeLeftMs(state, now);
  const lives = livesLeft(state);
  const p = progress(state);
  const solo = !isMultiplayer(settings);
  const streak = state.streak;

  return (
    <header className="flex items-center gap-2 sm:gap-3">
      {blitz ? (
        <div className="flex items-center gap-3">
          <div data-testid="blitz-clock">
            <CountdownRing progress={left !== null ? left / (settings.blitzDuration * 1000) : 0} size={56} stroke={5} label="Blitz clock" warnBelow={0.2}>
              <span className="text-sm">{clock(left ?? 0)}</span>
            </CountdownRing>
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold text-fg">
              {wonRounds(state)} <span className="text-sm font-semibold text-muted">songs</span>
            </div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Blitz · wrong −3s</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="leading-tight">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Round</div>
            <div className="font-display text-xl font-bold text-fg" data-testid="round-counter">
              {p.round}
              <span className="text-muted">/{p.total > 0 ? p.total : '∞'}</span>
            </div>
          </div>
          {settings.roundTimer > 0 && (
            <CountdownRing
              progress={left !== null ? left / (settings.roundTimer * 1000) : 1}
              size={44}
              stroke={4}
              label="Round timer"
            >
              <span className="text-xs">{Math.ceil((left ?? settings.roundTimer * 1000) / 1000)}</span>
            </CountdownRing>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        {solo && (
          <div className="text-right leading-tight">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Score</div>
            <NumberTicker value={state.totalScore} animateOnMount={false} className="font-display text-xl font-bold text-gradient" />
          </div>
        )}
        {solo && streak >= 2 && (
          <span
            className="inline-flex h-8 items-center gap-1 rounded-full bg-warn/15 px-2.5 font-mono text-sm font-bold text-warn"
            aria-label={`${streak} in a row`}
          >
            <Flame className="size-4 fill-current" aria-hidden />
            {streak}
          </span>
        )}
        {lives !== undefined && <Lives lives={lives} max={settings.lives} />}
        <IconButton aria-label="Keyboard shortcuts" icon={<CircleHelp />} size="sm" onClick={onHelp} className="hidden sm:inline-flex" />
        <IconButton aria-label="Quit game" icon={<X />} size="sm" onClick={onQuit} />
      </div>
    </header>
  );
}
