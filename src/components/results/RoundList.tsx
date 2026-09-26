import { Pause, Play } from 'lucide-react';
import type { GameState, Round } from '@/types';
import { Badge, IconButton, cn } from '@/components/ui';
import { roundOutcome } from '@/stats/aggregate';
import { VERDICT_LABEL, VERDICT_TONE, clipLabel, points } from '@/components/play/format';
import { roundVerdict } from '@/components/play/RevealCard';
import type { PreviewPlayer } from './usePreviewPlayer';

export interface RoundListProps {
  state: GameState;
  player: PreviewPlayer;
}

const STRIPE = {
  correct: 'bg-success',
  partial: 'bg-warn',
  wrong: 'bg-danger',
  timeout: 'bg-danger',
  skipped: 'bg-fg/30',
} as const;

function RoundRow({ round, state, player }: { round: Round; state: GameState; player: PreviewPlayer }) {
  const { track } = round;
  const o = roundOutcome(round, state.settings);
  const verdict = round.status === 'playing' ? 'skipped' : roundVerdict(round);
  const playing = player.current === track.id;
  const detail = [
    o.clipHeard > 0 ? `heard ${clipLabel(o.clipHeard)}` : 'not played',
    o.triesUsed > 0 ? `${o.triesUsed} ${o.triesUsed === 1 ? 'try' : 'tries'}` : null,
    round.hintsUsed.length > 0 ? `${round.hintsUsed.length} hint${round.hintsUsed.length > 1 ? 's' : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="relative flex items-center gap-3 py-2.5 pl-3" data-testid="round-row">
      <span className={cn('absolute left-0 top-2 bottom-2 w-1 rounded-full', STRIPE[verdict])} aria-hidden />
      <span className="w-5 shrink-0 font-mono text-xs text-muted tabular">{round.index + 1}</span>
      {track.cover ? (
        <img src={track.cover} alt="" className="size-12 shrink-0 rounded-xl object-cover" loading="lazy" />
      ) : (
        <span className="size-12 shrink-0 rounded-xl bg-gradient-accent" aria-hidden />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-fg" title={track.titleFull}>
          {track.title}
        </div>
        <div className="truncate text-xs text-muted">{track.artist}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={VERDICT_TONE[verdict]} size="sm">
            {VERDICT_LABEL[verdict]}
          </Badge>
          <span className="font-mono text-[11px] text-muted">{detail}</span>
        </div>
      </div>
      <span className={cn('shrink-0 font-mono text-sm font-bold tabular', round.score > 0 ? 'text-fg' : 'text-muted')}>+{points(round.score)}</span>
      <IconButton
        aria-label={playing ? `Stop ${track.title}` : `Play ${track.title}`}
        icon={playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        size="sm"
        variant={playing ? 'primary' : 'secondary'}
        onClick={() => (playing ? player.stop() : player.play(track, round.startOffset))}
        aria-pressed={playing}
      />
    </li>
  );
}

/** Every round of the game with cover, verdict, what was heard, points and a play button. */
export function RoundList({ state, player }: RoundListProps) {
  const rounds = state.rounds.filter((r) => r.status !== 'playing' || r.guesses.length > 0);
  if (rounds.length === 0) return null;
  return (
    <section className="glass rounded-4xl p-4 sm:p-5" aria-labelledby="rounds-title" data-testid="round-list">
      <h2 id="rounds-title" className="font-display text-lg font-bold text-fg">
        The set list <span className="font-mono text-sm font-normal text-muted">· {rounds.length} songs</span>
      </h2>
      <ol className="mt-2 flex flex-col divide-y divide-border">
        {rounds.map((r) => (
          <RoundRow key={r.index} round={r} state={state} player={player} />
        ))}
      </ol>
    </section>
  );
}
