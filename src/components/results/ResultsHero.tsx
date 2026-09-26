import { Clock, Ear, Flame, Target } from 'lucide-react';
import type { GameState } from '@/types';
import type { GameRecord } from '@/stats/types';
import { blitzTally, modeLabel } from '@/stats/share';
import { winningGuess } from '@/stats/aggregate';
import { getPack } from '@/lib/catalog';
import { CountdownRing, NumberTicker } from '@/components/ui';
import { StatTile } from '@/components/StatTile';
import { clipLabel } from '@/components/play/format';

export interface ResultsHeroProps {
  state: GameState;
  record: GameRecord;
}

export function headline(record: GameRecord, endReason: GameState['endReason']): string {
  if (endReason === 'quit') return 'Called it early.';
  if (record.rounds === 0) return 'Nothing played.';
  const acc = record.correct / record.rounds;
  if (acc === 1) return 'Flawless.';
  if (acc >= 0.8) return 'Golden ears.';
  if (acc >= 0.5) return 'Solid set.';
  if (acc > 0) return 'Warming up.';
  return 'Rough one.';
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Seconds from the round's first listen to the winning guess, for the quickest won round. */
export function fastestWinSec(state: GameState): number | null {
  let best = Number.POSITIVE_INFINITY;
  for (const round of state.rounds) {
    const win = winningGuess(round);
    if (!win) continue;
    best = Math.min(best, Math.max(0, win.at - round.startedAt) / 1000);
  }
  return Number.isFinite(best) ? best : null;
}

/** "7 songs in 60 s · fastest 0.3 s · best streak 4" */
export function blitzSummary(state: GameState, record: GameRecord): string {
  const fastest = fastestWinSec(state);
  return [
    blitzTally(record.correct, state.settings.blitzDuration, true),
    fastest !== null ? `fastest ${fastest < 10 ? fastest.toFixed(1) : Math.round(fastest)} s` : null,
    `best streak ${record.bestStreak}`,
  ]
    .filter((p): p is string => p !== null)
    .join(' · ');
}

export function ResultsHero({ state, record }: ResultsHeroProps) {
  const packs = state.settings.packIds.map((id) => getPack(id)).filter((p) => p !== undefined);
  const packLine = packs.length > 0 ? packs.map((p) => `${p.emoji} ${p.name}`).join(' · ') : state.settings.packIds.join(', ');
  const accuracy = record.rounds > 0 ? record.correct / record.rounds : 0;
  const blitz = state.settings.mode === 'blitz';

  return (
    <section className="glass noise relative overflow-hidden rounded-4xl p-5 sm:p-8" aria-labelledby="results-title" data-testid="results-hero">
      <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-accent opacity-25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -right-16 size-72 rounded-full bg-accent-2 opacity-20 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
          {modeLabel(state)} <span className="text-muted">· {packLine}</span>
        </p>
        <div className="mt-3 flex items-center gap-5 sm:gap-8">
          <div className="min-w-0 flex-1">
            <h1 id="results-title" className="font-display text-3xl font-black tracking-tight text-fg sm:text-5xl">
              {headline(record, state.endReason)}
            </h1>
            {blitz && (
              <p className="mt-1.5 text-sm font-semibold text-fg/80" data-testid="blitz-summary">
                {blitzSummary(state, record)}
              </p>
            )}
            <div className="mt-2 flex items-baseline gap-2" data-testid="final-score">
              <NumberTicker value={record.score} duration={1200} className="font-display text-5xl font-black text-gradient sm:text-6xl" />
              <span className="font-mono text-sm uppercase tracking-widest text-muted">pts</span>
            </div>
          </div>
          <CountdownRing progress={accuracy} size={104} stroke={9} warnBelow={0} label={`${record.correct} of ${record.rounds} correct`} className="shrink-0">
            <span className="text-lg">
              {record.correct}
              <span className="text-muted">/{record.rounds}</span>
            </span>
          </CountdownRing>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <StatTile size="sm" label="Accuracy" icon={<Target />} value={Math.round(accuracy * 100)} suffix="%" tone={accuracy >= 0.8 ? 'success' : 'neutral'} />
          <StatTile size="sm" label="Best streak" icon={<Flame />} value={record.bestStreak} tone={record.bestStreak >= 5 ? 'warn' : 'neutral'} />
          <StatTile
            size="sm"
            label="Your ears"
            icon={<Ear />}
            value={record.correct > 0 ? clipLabel(record.avgClipLengthHeard) : '—'}
            hint={record.correct > 0 ? 'avg clip on correct guesses' : 'no correct guesses'}
            tone="accent"
          />
          {blitz ? (
            <StatTile size="sm" label="Clock" icon={<Clock />} value={formatDuration(state.settings.blitzDuration * 1000)} hint="blitz timer" />
          ) : (
            <StatTile size="sm" label="Duration" icon={<Clock />} value={formatDuration(record.durationMs)} />
          )}
        </div>
      </div>
    </section>
  );
}
