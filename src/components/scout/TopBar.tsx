import { CircleHelp, Flame, X } from 'lucide-react';
import { CountdownRing, IconButton, NumberTicker, cn } from '@/components/ui';
import { scoutFormatInfo } from '@/scout/formats';
import { scoutMode } from '@/scout/packs';
import { blitzTimeLeftMs, formatProgress, timeLeftMs } from '@/scout/selectors';
import type { ScoutState } from '@/scout/types';
import { BlitzClock } from './BlitzClock';
import { SCOUT_FORMAT_ACCENT } from './formatCopy';

export interface TopBarProps {
  state: ScoutState;
  /** Clock sample from `useScoutClock`, for the countdown ring and the blitz clock. */
  now: number;
  onQuit: () => void;
  onHelp: () => void;
}

/**
 * The bar the whole run hangs off, and the one piece of chrome that changes shape per FORMAT.
 *
 * Standard, duel and party count rounds; the gauntlet counts franchises off its board; blitz hands the
 * hero slot to {@link BlitzClock}, because in that format the clock is the game and a round counter is
 * noise. Everything comes out of `formatProgress`, so the bar never re-derives a rule.
 */
export function TopBar({ state, now, onQuit, onHelp }: TopBarProps) {
  const { settings } = state;
  const round = state.rounds[state.currentRound];
  const mode = scoutMode(round?.mode ?? settings.mode);
  const fp = formatProgress(state, now);
  const format = fp.format;
  const info = scoutFormatInfo(format);
  const blitz = format === 'blitz';
  const blitzLeft = blitzTimeLeftMs(state, now);
  const roundLeft = blitz ? null : timeLeftMs(state, now);
  const full = Math.max(1, settings.roundTimer) * 1000;
  const accent = SCOUT_FORMAT_ACCENT[format];
  const shown = format === 'gauntlet' ? fp.franchisesCleared : fp.round;
  const total = format === 'gauntlet' ? fp.franchisesTotal : fp.total;

  return (
    <header className="flex items-center gap-2 sm:gap-3" data-testid="scout-top-bar" data-format={format}>
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        {blitz ? (
          <BlitzClock msLeft={blitzLeft ?? 0} endsAt={state.blitzEndsAt} correct={fp.correct} />
        ) : (
          <div className="min-w-0 leading-tight">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted">
              {format === 'gauntlet' ? 'Franchises' : 'Round'}
            </div>
            <div className="font-display text-xl font-bold text-fg" data-testid="scout-round-counter">
              {shown}
              <span className="text-muted">/{total > 0 ? total : '∞'}</span>
            </div>
          </div>
        )}

        {mode && (
          <span
            className="hidden min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-fg sm:inline-flex"
            data-testid="scout-mode-pill"
          >
            <span aria-hidden>{mode.emoji}</span>
            <span className="truncate">{mode.name}</span>
          </span>
        )}
        {format !== 'standard' && info && (
          <span
            className="hidden min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold text-fg lg:inline-flex"
            style={{
              borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
              background: `color-mix(in oklab, ${accent} 18%, var(--sg-surface))`,
            }}
            data-testid="scout-format-pill"
            data-format={format}
          >
            <span aria-hidden>{info.emoji}</span>
            <span className="truncate">{info.name}</span>
          </span>
        )}
        {!blitz && settings.roundTimer > 0 && (
          <CountdownRing progress={roundLeft !== null ? roundLeft / full : 1} size={44} stroke={4} label="Round timer">
            <span className="text-xs">{Math.ceil((roundLeft ?? full) / 1000)}</span>
          </CountdownRing>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <div className={cn('text-right leading-tight sm:mr-2', blitz && 'hidden sm:block')}>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Score</div>
          <NumberTicker
            value={state.totalScore}
            animateOnMount={false}
            className="font-display text-2xl font-bold text-gradient"
          />
        </div>
        {state.streak >= 2 && (
          <span
            className="inline-flex h-8 items-center gap-1 rounded-full bg-warn/15 px-2.5 font-mono text-sm font-bold text-warn"
            aria-label={`${state.streak} in a row`}
            data-testid="scout-streak"
          >
            <Flame className="size-4 fill-current" aria-hidden />
            {state.streak}
          </span>
        )}
        <IconButton
          aria-label="Keyboard shortcuts"
          icon={<CircleHelp />}
          size="sm"
          onClick={onHelp}
          className="hidden sm:inline-flex"
        />
        <IconButton aria-label="Quit game" icon={<X />} size="sm" onClick={onQuit} data-testid="scout-quit" />
      </div>
    </header>
  );
}
