import { Clock, Ear, Flame, Target } from 'lucide-react';
import type { GameState } from '@/types';
import type { GameRecord } from '@/stats/types';
import { blitzTally, modeTitle, resultHeadline } from '@/stats/share';
import { winningGuess } from '@/stats/aggregate';
import { isTie, standings } from '@/game/selectors';
import { getPack } from '@/lib/catalog';
import { Avatar, CountdownRing, NumberTicker, cn } from '@/components/ui';
import { StatTile } from '@/components/StatTile';
import { clipLabel } from '@/components/play/format';

export interface ResultsHeroProps {
  state: GameState;
  record: GameRecord;
}

/** The one-line verdict on a solo game (lives in `@/stats/share` so the share card says the same). */
export const headline = resultHeadline;

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

/**
 * What the hero leads with. Solo: the verdict and the score. 2+ players: the winner and *their*
 * score — a combined total means nothing at a party.
 */
export function heroLead(state: GameState, record: GameRecord): { title: string; score: number; winner: GameState['players'][number] | null; tie: boolean } {
  const multi = record.players !== undefined && record.players.length >= 2;
  if (!multi) return { title: resultHeadline(record, state.endReason), score: record.score, winner: null, tie: false };
  const ranked = standings(state);
  const tie = isTie(state);
  const winner = ranked[0] ?? null;
  return {
    title: tie ? "It's a tie!" : winner ? `${winner.name} takes it.` : resultHeadline(record, state.endReason),
    score: winner ? winner.score : record.score,
    winner,
    tie,
  };
}

/** Same surface for every tile inside the glow hero, captions pinned to the bottom so all four line up. */
const TILE = 'bg-bg-elevated/70! min-h-28 [&>*:last-child]:mt-auto';

export function ResultsHero({ state, record }: ResultsHeroProps) {
  const packs = state.settings.packIds.map((id) => getPack(id)).filter((p) => p !== undefined);
  const packLine = packs.length > 0 ? packs.map((p) => `${p.emoji} ${p.name}`).join(' · ') : state.settings.packIds.join(', ');
  const accuracy = record.rounds > 0 ? record.correct / record.rounds : 0;
  const blitz = state.settings.mode === 'blitz';
  const lead = heroLead(state, record);

  return (
    <section className="glass noise relative overflow-hidden rounded-4xl p-5 sm:p-8" aria-labelledby="results-title" data-testid="results-hero">
      <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-accent opacity-25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -right-16 size-72 rounded-full bg-accent-2 opacity-20 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent" data-testid="results-eyebrow">
          {modeTitle(state)} <span className="text-muted">· {packLine}</span>
        </p>
        <div className="mt-3 flex items-center gap-5 sm:gap-8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {lead.winner && !lead.tie && (
                <>
                  <span className="shrink-0 sm:hidden">
                    <Avatar emoji={lead.winner.emoji} color={lead.winner.color} size="sm" name={lead.winner.name} active />
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <Avatar emoji={lead.winner.emoji} color={lead.winner.color} size="md" name={lead.winner.name} active />
                  </span>
                </>
              )}
              <h1
                id="results-title"
                className={cn('font-display font-black leading-tight tracking-tight text-fg sm:text-5xl', lead.winner && !lead.tie ? 'text-2xl' : 'text-3xl')}
              >
                {lead.winner && !lead.tie ? (
                  <>
                    <span className="block sm:inline">{lead.winner.name}</span>
                    <span className="block sm:inline"> takes it.</span>
                  </>
                ) : (
                  lead.title
                )}
              </h1>
            </div>
            {blitz && (
              <p className="mt-1.5 text-sm font-semibold text-fg/80" data-testid="blitz-summary">
                {blitzSummary(state, record)}
              </p>
            )}
            <div className="mt-2 flex items-baseline gap-2" data-testid="final-score">
              <NumberTicker value={lead.score} duration={1200} className="font-display text-5xl font-black text-gradient sm:text-6xl" />
              <span className="font-mono text-sm uppercase tracking-widest text-muted">pts</span>
            </div>
            {lead.winner && (
              <p className="mt-1 text-sm text-muted" data-testid="hero-players">
                {state.players.length} players · {record.rounds} songs
              </p>
            )}
          </div>
          <CountdownRing progress={accuracy} size={104} stroke={9} warnBelow={0} label={`${record.correct} of ${record.rounds} correct`} className="shrink-0">
            <span className="text-lg">
              {record.correct}
              <span className="text-muted">/{record.rounds}</span>
            </span>
          </CountdownRing>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-4 sm:gap-3" data-testid="hero-tiles">
          <StatTile size="sm" className={TILE} label="Accuracy" icon={<Target />} value={Math.round(accuracy * 100)} suffix="%" hint={`${record.correct} of ${record.rounds} right`} />
          <StatTile size="sm" className={TILE} label="Best streak" icon={<Flame />} value={record.bestStreak} hint="in a row" />
          <StatTile
            size="sm"
            className={TILE}
            label="Your ears"
            icon={<Ear />}
            value={record.correct > 0 ? clipLabel(record.avgClipLengthHeard) : '—'}
            hint={record.correct > 0 ? 'avg clip when right' : 'no correct guesses'}
          />
          {blitz ? (
            <StatTile size="sm" className={TILE} label="Clock" icon={<Clock />} value={formatDuration(state.settings.blitzDuration * 1000)} hint="on the clock" />
          ) : (
            <StatTile size="sm" className={TILE} label="Duration" icon={<Clock />} value={formatDuration(record.durationMs)} hint="start to finish" />
          )}
        </div>
      </div>
    </section>
  );
}
