import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Badge, Button, Kbd, cn } from '@/components/ui';
import type { PlayerClip } from '@/data/nfl';
import { roundSeenAt } from '@/scout/engine';
import { scoutMode } from '@/scout/packs';
import { scoreScoutRound, type ScoutScoreBreakdown } from '@/scout/scoring';
import type { ScoutRound, ScoutState } from '@/scout/types';
import { stageImage } from './SubjectStage';
import { WatchTape } from './WatchTape';
import {
  VERDICT_LABEL,
  VERDICT_TONE,
  buildLine,
  draftLine,
  espnPlayerUrl,
  espnTeamUrl,
  playerLine,
  points,
  roundVerdict,
  superBowlLine,
  teamLine,
} from './format';

export interface RevealCardProps {
  state: ScoutState;
  /** Verified clips by player id (`useScoutClips`). */
  clips: ReadonlyMap<string, PlayerClip>;
  onNext: () => void;
  /** Overrides the primary button's label — a rotating format hands the laptop over instead. */
  nextLabel?: string;
  /** Bump to open the tape from the T shortcut. */
  tapeSignal?: number;
  className?: string;
}

/** Whether pressing Next would end the session. */
export function isLastRound(state: ScoutState): boolean {
  if (state.settings.rounds > 0 && state.rounds.length >= state.settings.rounds) return true;
  return state.queue.length === 0;
}

/** Consecutive wins immediately before `index` — the streak the scorer saw. */
export function streakBefore(state: ScoutState, index: number): number {
  let n = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (state.rounds[i]?.status === 'won') n += 1;
    else break;
  }
  return n;
}

/**
 * Recompute a won round's breakdown for display. `total` always mirrors `round.score` — the engine
 * is the authority, this is only here to show the working.
 */
export function breakdownFor(state: ScoutState, round: ScoutRound): ScoutScoreBreakdown | null {
  const win = round.guesses.find((g) => g.verdict === 'correct');
  if (!win) return null;
  const from = roundSeenAt(round) ?? round.startedAt;
  const b = scoreScoutRound({
    mode: round.mode,
    tryIndex: win.tryIndex,
    elapsedMs: Math.max(0, win.at - from),
    streak: streakBefore(state, round.index),
  });
  return { ...b, total: round.score };
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'plus' | 'minus' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted">{label}</span>
      <span className={cn('font-mono tabular', tone === 'plus' && 'text-success', tone === 'minus' && 'text-danger')}>{value}</span>
    </div>
  );
}

/** Two dots of the franchise's real colours, then its name — safe on every theme. */
function TeamChip({ name, color, altColor }: { name: string; color: string; altColor?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-fg">
      <span className="inline-flex shrink-0 items-center -space-x-1" aria-hidden>
        <span className="size-3 rounded-full border border-border-strong" style={{ background: color }} />
        {altColor && <span className="size-3 rounded-full border border-border-strong" style={{ background: altColor }} />}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * The payoff frame: the clean photo, who it was, the tape, and what the round paid.
 *
 * This card OWNS the hero slot when a round ends — the same slot the puzzle stage had — at both
 * breakpoints. On a phone that is what keeps the answer and "Next round" above the fold (they used
 * to land under a full-height stage, with nothing scrolling); on a laptop it is what lets the tape
 * be the size of the reward rather than a 336 px thumbnail in a sidebar.
 *
 * "Watch the tape" mounts a YouTube iframe only after a click, and the clip's own title and channel
 * are credited under it — a clip may live on a former team's channel, so it never captions who the
 * player plays for now (that comes from the dataset above it).
 */
export function RevealCard({ state, clips, onNext, nextLabel, tapeSignal, className }: RevealCardProps) {
  const reduce = useReducedMotion();
  const round = state.rounds[state.currentRound];
  if (!round || round.status === 'playing') return null;

  const { subject } = round;
  const verdict = roundVerdict(round);
  const won = round.status === 'won';
  const breakdown = breakdownFor(state, round);
  const win = round.guesses.find((g) => g.verdict === 'correct');
  const last = isLastRound(state);
  const player = subject.player;
  const team = subject.team;
  const clip = player ? clips.get(player.id) : undefined;

  return (
    <motion.section
      key={`${state.id}:${round.index}`}
      className={cn(
        'glass-strong relative flex min-h-0 flex-col rounded-4xl p-4 sm:p-5',
        won && 'glow',
        className,
      )}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      aria-label="Round result"
      data-testid="scout-reveal"
      data-verdict={verdict}
    >
      {/* Everything above "Next round" scrolls; the button itself never does. A reveal that pushed
          the answer and the way onward below the fold is exactly what this card is here to fix.
          On a laptop the identity block and the score breakdown share a row, which is what leaves
          the tape a full-width band underneath instead of a thumbnail wedged between them. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto',
          // With no tape there is nothing tall to fill the slot, so the card centres what it has
          // rather than leaving a void under it. (Safe: that case never overflows.)
          !clip && 'justify-center',
        )}
      >
      <div className="flex gap-4">
        <motion.div
          className="shrink-0 overflow-hidden rounded-3xl border border-border bg-bg-elevated"
          // The reveal card is now the only place the clean photo appears, so it is sized to be
          // looked at rather than glanced at.
          style={{ width: 'clamp(104px, 20vw, 136px)', height: 'clamp(104px, 20vw, 136px)' }}
          initial={reduce ? false : { rotateY: 80, opacity: 0.4 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.05 }}
        >
          <img
            src={stageImage(subject)}
            alt={subject.kind === 'team' ? `${subject.name} logo` : subject.name}
            className="size-full object-contain p-1"
            decoding="async"
            data-testid="scout-reveal-image"
          />
        </motion.div>
        <div className="min-w-0 flex-1">
          <Badge tone={VERDICT_TONE[verdict]} size="sm">
            {VERDICT_LABEL[verdict]}
          </Badge>
          <h2 className="mt-1.5 font-display text-xl font-bold leading-tight text-fg sm:text-2xl" data-testid="scout-reveal-name">
            {subject.name}
          </h2>
          {player && <p className="truncate text-sm font-semibold text-fg/80">{playerLine(player)}</p>}
          {team && (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
              <TeamChip name={team.displayName} color={team.color} altColor={team.altColor} />
              {subject.kind === 'team' && <span className="font-mono text-[11px] text-muted">est. {team.founded}</span>}
            </div>
          )}
          {player ? (
            <p className="mt-1.5 text-xs text-muted">
              {draftLine(player)}
              {buildLine(player) !== '' && <span className="block">{buildLine(player)}</span>}
            </p>
          ) : (
            team && (
              <p className="mt-1.5 text-xs text-muted">
                {teamLine(team)}
                <span className="block">{superBowlLine(team)}</span>
              </p>
            )
          )}
        </div>
      </div>

      <WatchTape
        clip={clip}
        fallbackHref={player ? espnPlayerUrl(player.id) : team ? espnTeamUrl(team.abbr) : 'https://www.espn.com/nfl/'}
        fallbackLabel={subject.kind === 'team' ? 'Open the team on ESPN' : 'Open the player on ESPN'}
        openSignal={tapeSignal}
        size="hero"
      />

      </div>

      {/* Pinned: the score and the way onward are never what scrolls. Side by side on a laptop, so
          the tape above them keeps its height. */}
      <div className="mt-3 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-stretch">
      <div className="flex-1 rounded-2xl border border-border bg-surface p-3">
        {breakdown && win ? (
          <div className="flex flex-col gap-1">
            <Row
              label={`Base · ${scoutMode(round.mode)?.name ?? round.mode} ×${breakdown.modeWeight.toFixed(2)}`}
              value={points(breakdown.base * breakdown.modeWeight)}
            />
            {breakdown.tryFactor < 1 ? (
              <Row
                label={`Try ${win.tryIndex + 1} ×${breakdown.tryFactor.toFixed(2)}`}
                value={`−${points(breakdown.base * breakdown.modeWeight * (1 - breakdown.tryFactor))}`}
                tone="minus"
              />
            ) : (
              <Row label="First look" value="×1.00" />
            )}
            {breakdown.timeBonus > 0 && <Row label="Speed bonus" value={`+${points(breakdown.timeBonus)}`} tone="plus" />}
            {breakdown.streakBonus > 0 && <Row label="Streak bonus" value={`+${points(breakdown.streakBonus)}`} tone="plus" />}
            <div className="mt-1 flex items-baseline justify-between border-t border-border pt-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Round score</span>
              <span className="font-display text-lg font-bold text-gradient">+{points(round.score)}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted">
              {verdict === 'timeout'
                ? 'The clock beat you.'
                : verdict === 'skipped'
                  ? 'Skipped past that one.'
                  : verdict === 'close'
                    ? 'You were one name away.'
                    : 'No points this round.'}
            </span>
            <span className="font-display text-lg font-bold text-muted">+0</span>
          </div>
        )}
      </div>


      <Button
        variant="glow"
        size="lg"
        fullWidth
        className="shrink-0 lg:h-auto lg:w-auto lg:self-stretch lg:px-10"
        onClick={onNext}
        trailingIcon={<ArrowRight />}
        data-autofocus
        data-testid="scout-next"
      >
        {nextLabel ?? (last ? 'See results' : 'Next round')}
        <span className="ml-2 hidden sm:inline-flex">
          <Kbd size="sm" className="border-white/20 bg-black/20 text-accent-fg">
            Enter
          </Kbd>
        </span>
      </Button>
      </div>
    </motion.section>
  );
}
