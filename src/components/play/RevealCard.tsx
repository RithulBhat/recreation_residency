import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ExternalLink, Play, Square } from 'lucide-react';
import type { GameState, Round, ScoreBreakdown } from '@/types';
import { AlbumArt } from '@/components/AlbumArt';
import { Badge, Button, Kbd, cn } from '@/components/ui';
import { scoreGuess } from '@/game/scoring';
import { currentRound } from '@/game/selectors';
import { VERDICT_LABEL, VERDICT_TONE, clipLabel, points } from './format';

export interface RevealCardProps {
  state: GameState;
  onNext: () => void;
  onHear: () => void;
  onStop: () => void;
  hearing: boolean;
  className?: string;
}

/** Whether pressing Next would end the game. */
export function isLastRound(state: GameState): boolean {
  const { settings } = state;
  if (settings.mode === 'survival' && state.players.length > 0 && state.players.every((p) => (p.lives ?? 0) <= 0)) return true;
  if (settings.rounds > 0 && state.rounds.length >= settings.rounds) return true;
  return state.queue.length === 0;
}

/** Verdict of the round as a whole. */
export function roundVerdict(round: Round): keyof typeof VERDICT_LABEL {
  if (round.status === 'won') return 'correct';
  const last = round.guesses[round.guesses.length - 1];
  if (last?.verdict === 'timeout') return 'timeout';
  if (round.guesses.some((g) => g.verdict === 'partial')) return 'partial';
  if (last?.verdict === 'skipped' && round.guesses.every((g) => g.verdict === 'skipped')) return 'skipped';
  return 'wrong';
}

/** Recompute the breakdown of a won round for display (total always mirrors `round.score`). */
export function breakdownFor(state: GameState, round: Round): ScoreBreakdown | null {
  const win = round.guesses.find((g) => g.verdict === 'correct');
  if (!win) return null;
  const player = state.players.find((p) => p.id === (round.winnerPlayerId ?? win.playerId));
  const streakBefore = Math.max(0, (player?.streak ?? state.streak) - 1);
  const b = scoreGuess({
    clipLength: win.clipLength,
    tryIndex: win.tryIndex,
    tries: state.settings.tries,
    elapsedMs: Math.max(0, win.at - round.startedAt),
    hintsUsed: round.hintsUsed.length,
    streak: streakBefore,
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

export function RevealCard({ state, onNext, onHear, onStop, hearing, className }: RevealCardProps) {
  const reduce = useReducedMotion();
  const round = currentRound(state);
  if (!round || round.status === 'playing') return null;
  const { track } = round;
  const verdict = roundVerdict(round);
  const won = round.status === 'won';
  const breakdown = breakdownFor(state, round);
  const win = round.guesses.find((g) => g.verdict === 'correct');
  const last = isLastRound(state);
  const meta = [track.releaseYear, track.album].filter((v): v is string | number => !!v).join(' · ');

  return (
    <motion.section
      key={`${state.id}:${round.index}`}
      className={cn('glass-strong relative overflow-hidden rounded-4xl p-4 sm:p-5', won && 'glow', className)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      aria-label="Round result"
      data-testid="reveal"
    >
      <div className="flex gap-4">
        <motion.div
          className="shrink-0"
          initial={reduce ? false : { rotateY: 90, opacity: 0.4 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.05 }}
          style={{ perspective: 800 }}
        >
          <AlbumArt src={track.coverBig || track.cover} alt={`${track.title} cover`} blur={0} size="clamp(88px, 24vw, 132px)" rounded="2xl" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <Badge tone={VERDICT_TONE[verdict]} size="sm">
            {VERDICT_LABEL[verdict]}
          </Badge>
          <h2 className="mt-1.5 line-clamp-2 font-display text-lg font-bold leading-tight text-fg sm:text-xl" title={track.titleFull}>
            {track.title}
          </h2>
          <p className="truncate text-sm font-semibold text-fg/80">{track.artist}</p>
          {meta && <p className="truncate text-xs text-muted">{meta}</p>}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={hearing ? <Square className="fill-current" /> : <Play className="fill-current" />}
          onClick={hearing ? onStop : onHear}
          aria-pressed={hearing}
          className="flex-1 sm:flex-none"
        >
          {hearing ? 'Stop' : 'Hear the song'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          href={`https://www.deezer.com/track/${track.id}`}
          target="_blank"
          rel="noreferrer"
          trailingIcon={<ExternalLink />}
        >
          Open in Deezer
        </Button>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-surface p-3">
        {breakdown && win ? (
          <div className="flex flex-col gap-1">
            <Row label={`Base · clip ${clipLabel(win.clipLength)} ×${breakdown.clipFactor.toFixed(2)}`} value={`${points(breakdown.base * breakdown.clipFactor)}`} />
            <Row label={`Try ${win.tryIndex + 1} ×${breakdown.tryFactor.toFixed(2)}`} value={`${points(breakdown.base * breakdown.clipFactor * breakdown.tryFactor)}`} />
            {breakdown.timeBonus > 0 && <Row label="Speed bonus" value={`+${points(breakdown.timeBonus)}`} tone="plus" />}
            {breakdown.streakBonus > 0 && <Row label="Streak bonus" value={`+${points(breakdown.streakBonus)}`} tone="plus" />}
            {breakdown.hintPenalty > 0 && <Row label={`Hints ×${round.hintsUsed.length}`} value={`−${points(breakdown.hintPenalty)}`} tone="minus" />}
            <div className="mt-1 flex items-baseline justify-between border-t border-border pt-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Round score</span>
              <span className="font-display text-lg font-bold text-gradient">+{points(round.score)}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted">
              {round.score > 0 ? 'Artist credit (30 %)' : verdict === 'timeout' ? 'The clock beat you.' : 'No points this round.'}
            </span>
            <span className={cn('font-display text-lg font-bold', round.score > 0 ? 'text-warn' : 'text-muted')}>+{points(round.score)}</span>
          </div>
        )}
      </div>

      <Button variant="glow" size="lg" fullWidth className="mt-4" onClick={onNext} trailingIcon={<ArrowRight />} data-autofocus data-testid="next">
        {last ? 'See results' : 'Next song'}
        <span className="ml-2 hidden sm:inline-flex">
          <Kbd size="sm" className="bg-black/20 text-accent-fg border-white/20">Enter</Kbd>
        </span>
      </Button>
    </motion.section>
  );
}
