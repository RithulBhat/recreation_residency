import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Film } from 'lucide-react';
import { Badge, IconButton, cn } from '@/components/ui';
import type { PlayerClip } from '@/data/nfl';
import { scoutMode } from '@/scout/packs';
import type { ScoutRound, ScoutState } from '@/scout/types';
import { stageImage } from './SubjectStage';
import { WatchTape } from './WatchTape';
import { VERDICT_LABEL, VERDICT_TONE, espnPlayerUrl, espnTeamUrl, points, roundVerdict, triesUsed } from './format';

export interface RoundListProps {
  state: ScoutState;
  /** Verified clips by player id. */
  clips: ReadonlyMap<string, PlayerClip>;
  className?: string;
}

const STRIPE: Record<string, string> = {
  correct: 'bg-success',
  close: 'bg-warn',
  wrong: 'bg-danger',
  timeout: 'bg-danger',
  skipped: 'bg-fg/30',
};

function seconds(ms: number): string {
  const s = ms / 1000;
  if (s < 10) return `${Math.round(s * 10) / 10}s`;
  return `${Math.round(s)}s`;
}

function Row({
  round,
  clip,
  expanded,
  onToggle,
}: {
  round: ScoutRound;
  clip?: PlayerClip;
  expanded: boolean;
  onToggle: () => void;
}) {
  const reduce = useReducedMotion();
  const verdict = roundVerdict(round);
  const mode = scoutMode(round.mode);
  const used = triesUsed(round);
  const player = round.subject.player;
  const team = round.subject.team;
  const elapsed = round.endedAt ? Math.max(0, round.endedAt - round.startedAt) : 0;
  const detail = [
    mode?.name,
    used > 0 ? `${used} ${used === 1 ? 'try' : 'tries'}` : null,
    elapsed > 0 ? seconds(elapsed) : null,
  ]
    .filter((s): s is string => typeof s === 'string' && s !== '')
    .join(' · ');

  return (
    <li className="relative flex flex-col py-2.5 pl-3" data-testid="scout-round-row">
      <span className={cn('absolute bottom-2 left-0 top-2 w-1 rounded-full', STRIPE[verdict] ?? 'bg-fg/30')} aria-hidden />
      <div className="flex items-center gap-3">
        <span className="w-5 shrink-0 font-mono text-xs text-muted tabular">{round.index + 1}</span>
        <img
          src={stageImage(round.subject)}
          alt=""
          className="size-12 shrink-0 rounded-xl bg-surface object-contain"
          loading="lazy"
          decoding="async"
        />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-fg" data-testid="scout-round-name">
            {round.subject.name}
          </div>
          <div className="truncate text-xs text-muted">
            {round.subject.kind === 'team'
              ? team
                ? `${team.conference} ${team.division}`
                : ''
              : [player?.pos, team?.abbr].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={VERDICT_TONE[verdict]} size="sm">
              {VERDICT_LABEL[verdict]}
            </Badge>
            <span className="font-mono text-[11px] text-muted">{detail}</span>
          </div>
        </div>
        <span className={cn('shrink-0 font-mono text-sm font-bold tabular', round.score > 0 ? 'text-fg' : 'text-muted')}>
          +{points(round.score)}
        </span>
        <IconButton
          aria-label={expanded ? `Hide ${round.subject.name}'s tape` : `Watch ${round.subject.name}'s tape`}
          icon={<Film />}
          size="sm"
          variant={expanded ? 'primary' : 'secondary'}
          onClick={onToggle}
          aria-expanded={expanded}
          disabled={!clip}
          title={clip ? undefined : 'No verified clip for this one'}
          data-testid="scout-round-tape"
        />
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-2.5">
              <WatchTape
                clip={clip}
                defaultOpen
                fallbackHref={player ? espnPlayerUrl(player.id) : team ? espnTeamUrl(team.abbr) : 'https://www.espn.com/nfl/'}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/**
 * Every round of the session: who it was, how it went, what it paid — and the tape, which is only
 * mounted for the row you opened (so ten rounds never mean ten YouTube frames).
 */
export function RoundList({ state, clips, className }: RoundListProps) {
  const [open, setOpen] = useState<number | null>(null);
  const rounds = state.rounds.filter((r) => r.status !== 'playing' || r.guesses.length > 0);
  if (rounds.length === 0) return null;

  return (
    <section className={cn('glass rounded-4xl p-4 sm:p-5', className)} aria-labelledby="scout-rounds-title" data-testid="scout-round-list">
      <h2 id="scout-rounds-title" className="font-display text-lg font-bold text-fg">
        The board <span className="font-mono text-sm font-normal text-muted">· {rounds.length} rounds</span>
      </h2>
      <ol className="mt-2 flex flex-col divide-y divide-border">
        {rounds.map((r) => (
          <Row
            key={r.index}
            round={r}
            clip={r.subject.player ? clips.get(r.subject.player.id) : undefined}
            expanded={open === r.index}
            onToggle={() => setOpen((cur) => (cur === r.index ? null : r.index))}
          />
        ))}
      </ol>
    </section>
  );
}
