import { CircleHelp, Flame, X } from 'lucide-react';
import { CountdownRing, IconButton, NumberTicker } from '@/components/ui';
import { scoutMode } from '@/scout/packs';
import { progress, timeLeftMs } from '@/scout/selectors';
import type { ScoutState } from '@/scout/types';

export interface TopBarProps {
  state: ScoutState;
  /** Clock sample from `useScoutClock`, for the countdown ring. */
  now: number;
  onQuit: () => void;
  onHelp: () => void;
}

/** Round counter + mode on the left, score + streak on the right, help and quit at the end. */
export function TopBar({ state, now, onQuit, onHelp }: TopBarProps) {
  const { settings } = state;
  const round = state.rounds[state.currentRound];
  const mode = scoutMode(round?.mode ?? settings.mode);
  const p = progress(state);
  const left = timeLeftMs(state, now);
  const full = Math.max(1, settings.roundTimer) * 1000;

  return (
    <header className="flex items-center gap-2 sm:gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 leading-tight">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Round</div>
          <div className="font-display text-xl font-bold text-fg" data-testid="scout-round-counter">
            {p.round}
            <span className="text-muted">/{p.total > 0 ? p.total : '∞'}</span>
          </div>
        </div>
        {mode && (
          <span
            className="hidden min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-fg sm:inline-flex"
            data-testid="scout-mode-pill"
          >
            <span aria-hidden>{mode.emoji}</span>
            <span className="truncate">{mode.name}</span>
          </span>
        )}
        {settings.roundTimer > 0 && (
          <CountdownRing progress={left !== null ? left / full : 1} size={44} stroke={4} label="Round timer">
            <span className="text-xs">{Math.ceil((left ?? full) / 1000)}</span>
          </CountdownRing>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <div className="text-right leading-tight sm:mr-2">
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
        <IconButton aria-label="Keyboard shortcuts" icon={<CircleHelp />} size="sm" onClick={onHelp} className="hidden sm:inline-flex" />
        <IconButton aria-label="Quit game" icon={<X />} size="sm" onClick={onQuit} data-testid="scout-quit" />
      </div>
    </header>
  );
}
