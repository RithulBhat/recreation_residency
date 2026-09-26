import { Clock, Flame, Layers, Target } from 'lucide-react';
import { CountdownRing, NumberTicker } from '@/components/ui';
import { StatTile } from '@/components/StatTile';
import { scoutMode, scoutPack } from '@/scout/packs';
import type { ScoutGameRecord } from '@/store/scoutResultStore';

export interface ResultsHeroProps {
  record: ScoutGameRecord;
}

/** The one-line verdict on a session. */
export function scoutHeadline(record: ScoutGameRecord): string {
  if (record.endReason === 'quit') return 'Called it early.';
  if (record.played === 0) return 'Nothing on tape.';
  const ratio = record.correct / record.played;
  if (record.correct === record.played) return record.played >= 5 ? 'Perfect board.' : 'Clean sheet.';
  if (ratio >= 0.8) return 'Elite eye.';
  if (ratio >= 0.6) return 'Solid film session.';
  if (ratio >= 0.4) return 'You know some guys.';
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
export function ResultsHero({ record }: ResultsHeroProps) {
  const accuracy = record.played > 0 ? record.correct / record.played : 0;

  return (
    <section
      className="glass noise relative overflow-hidden rounded-4xl p-5 sm:p-8"
      aria-labelledby="scout-results-title"
      data-testid="scout-results-hero"
    >
      <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-accent opacity-25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -right-16 size-72 rounded-full bg-accent-2 opacity-20 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent" data-testid="scout-results-eyebrow">
          {sessionLine(record)}
        </p>
        <div className="mt-3 flex items-center gap-5 sm:gap-8">
          <div className="min-w-0 flex-1">
            <h1
              id="scout-results-title"
              className="font-display text-3xl font-black leading-tight tracking-tight text-fg sm:text-5xl"
            >
              {scoutHeadline(record)}
            </h1>
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
          <StatTile
            size="sm"
            className={TILE}
            label="Avg look"
            icon={<Layers />}
            value={record.avgTryWhenRight > 0 ? `try ${record.avgTryWhenRight.toFixed(1)}` : '—'}
            hint={record.correct > 0 ? `of ${record.tries} rungs` : 'nothing named'}
          />
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
