import { Clock, Flame, Layers, Target } from 'lucide-react';
import { CountdownRing, NumberTicker, cn } from '@/components/ui';
import { StatTile } from '@/components/StatTile';
import { scoutMode, scoutPack } from '@/scout/packs';
import type { ScoutState } from '@/scout/types';
import type { ScoutGameRecord } from '@/store/scoutResultStore';
import { SCOUT_FORMAT_ACCENT, scoutOutcome } from './formatCopy';

export interface ResultsHeroProps {
  record: ScoutGameRecord;
  /**
   * The finished run. Optional, and only for the FORMAT's own headline — "14 in 90 seconds" beats
   * "Elite eye" when the whole point of the run was the clock. `standard` has no format headline, so
   * it keeps the accuracy verdict it always had.
   */
  state?: ScoutState;
}

/** The one-line verdict on a session. */
export function scoutHeadline(record: ScoutGameRecord): string {
  if (record.endReason === 'quit') return 'Called it early.';
  if (record.played === 0) return 'Nothing on tape.';
  const ratio = record.correct / record.played;
  if (record.correct === record.played) return record.played >= 5 ? 'Perfect board.' : 'Clean sheet.';
  if (ratio >= 0.8) return 'Elite eye.';
  if (ratio >= 0.6) return 'Solid film session.';
  if (ratio >= 0.4) return 'You know the league.';
  if (record.correct > 0) return 'Rough tape.';
  return 'Back to the film room.';
}

/** `🕶️ Silhouette · ⭐ Superstars` — what was played. */
export function sessionLine(record: ScoutGameRecord): string {
  const mode = scoutMode(record.mode);
  const packs = record.packIds.map((id) => scoutPack(id)).filter((p) => p !== undefined);
  const left = record.mixModes ? 'Mixed modes' : mode ? `${mode.emoji} ${mode.name}` : record.mode;
  const right = packs.length > 0 ? packs.map((p) => `${p.emoji} ${p.name}`).join(' · ') : record.packIds.join(', ');
  return `${left} — ${right}`;
}

function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const TILE = 'bg-bg-elevated/70! min-h-28 [&>*:last-child]:mt-auto';

/** Score, accuracy, streak — the top of the results screen. */
export function ResultsHero({ record, state }: ResultsHeroProps) {
  const accuracy = record.played > 0 ? record.correct / record.played : 0;
  const outcome = state ? scoutOutcome(state) : null;
  const headline = outcome?.headline ?? scoutHeadline(record);
  // "You got to round 23 before the deep cuts got you" is four lines at the verdict's type size, which
  // pushes the score and the actions off the fold. Long headlines step down a size.
  const longHeadline = headline.length > 32;
  const accent = outcome ? SCOUT_FORMAT_ACCENT[outcome.format] : undefined;

  return (
    <section
      className="glass noise relative overflow-hidden rounded-4xl p-5 sm:p-8"
      aria-labelledby="scout-results-title"
      data-testid="scout-results-hero"
    >
      <div
        className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-accent opacity-25 blur-3xl"
        style={accent ? { background: accent } : undefined}
        aria-hidden
      />
      <div className="pointer-events-none absolute -bottom-24 -right-16 size-72 rounded-full bg-accent-2 opacity-20 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent" data-testid="scout-results-eyebrow">
          {outcome && outcome.format !== 'standard' ? `${outcome.emoji} ${outcome.name} · ` : ''}
          {sessionLine(record)}
        </p>
        <div className="mt-3 flex items-center gap-5 sm:gap-8">
          <div className="min-w-0 flex-1">
            <h1
              id="scout-results-title"
              className={cn(
                'text-balance font-display font-black leading-tight tracking-tight text-fg',
                longHeadline ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-3xl sm:text-4xl lg:text-5xl',
              )}
              data-testid="scout-results-headline"
              data-format={outcome?.format ?? 'standard'}
            >
              {headline}
            </h1>
            {outcome?.headline && (
              <p className="mt-1 text-sm font-semibold text-muted" data-testid="scout-results-verdict">
                {scoutHeadline(record)}
              </p>
            )}
            <div className="mt-2 flex items-baseline gap-2" data-testid="scout-final-score">
              <NumberTicker value={record.score} duration={1200} className="font-display text-5xl font-black text-gradient sm:text-6xl" />
              <span className="font-mono text-sm uppercase tracking-widest text-muted">pts</span>
            </div>
            {record.grid !== '' && (
              <p className="mt-2 whitespace-pre-line font-mono text-lg leading-tight" aria-hidden data-testid="scout-grid">
                {record.grid}
              </p>
            )}
          </div>
          <CountdownRing
            progress={accuracy}
            size={104}
            stroke={9}
            warnBelow={0}
            label={`${record.correct} of ${record.played} correct`}
            className="shrink-0"
          >
            <span className="text-lg">
              {record.correct}
              <span className="text-muted">/{record.played}</span>
            </span>
          </CountdownRing>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-4 sm:gap-3" data-testid="scout-hero-tiles">
          <StatTile
            size="sm"
            className={TILE}
            label="Accuracy"
            icon={<Target />}
            value={Math.round(accuracy * 100)}
            suffix="%"
            hint={`${record.correct} of ${record.played} named`}
          />
          <StatTile size="sm" className={TILE} label="Best streak" icon={<Flame />} value={record.bestStreak} hint="in a row" />
          {/* Blitz freezes every subject on ONE rung, so an average try index is a number about the
              format rather than about the player. It gets the rule instead. */}
          {outcome?.format === 'blitz' ? (
            <StatTile size="sm" className={TILE} label="Reveal" icon={<Layers />} value="one look" hint="same rung, every subject" />
          ) : (
            <StatTile
              size="sm"
              className={TILE}
              label="Avg look"
              icon={<Layers />}
              value={record.avgTryWhenRight > 0 ? `try ${record.avgTryWhenRight.toFixed(1)}` : '—'}
              hint={record.correct > 0 ? `of ${record.tries} rungs` : 'nothing named'}
            />
          )}
          <StatTile size="sm" className={TILE} label="Duration" icon={<Clock />} value={duration(record.durationMs)} hint="start to finish" />
        </div>
        {record.close > 0 && (
          <p className="mt-3 text-sm font-semibold text-warn" data-testid="scout-close-line">
            {record.close} {record.close === 1 ? 'round' : 'rounds'} you were one name away from.
          </p>
        )}
      </div>
    </section>
  );
}
