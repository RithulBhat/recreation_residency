import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Wifi } from 'lucide-react';
import type { GameState } from '@/types';
import type { UseOnlineDuel } from '@/net';
import { Avatar, Badge, cn } from '@/components/ui';
import { wonRounds } from '@/game/selectors';
import { VERDICT_LABEL, VERDICT_TONE, points } from './format';

export interface OpponentPanelProps {
  duel: UseOnlineDuel;
  state: GameState;
  className?: string;
}

export const EMOTES = ['🔥', '😂', '😭', '👏', '💀'] as const;

function latencyTone(ms: number): 'success' | 'warn' | 'danger' {
  if (ms < 150) return 'success';
  if (ms < 400) return 'warn';
  return 'danger';
}

/** Live scoreboard of the online opponent, plus the emote bar. */
export function OpponentPanel({ duel, state, className }: OpponentPanelProps) {
  const reduce = useReducedMotion();
  const them = duel.opponent;
  const prog = duel.opponentProgress;
  const done = duel.opponentFinished;
  const mine = state.totalScore;
  const theirs = done?.score ?? prog?.score ?? 0;
  const lead = mine === theirs ? 'level' : mine > theirs ? 'ahead' : 'behind';

  return (
    <section className={cn('glass relative overflow-visible rounded-3xl p-3', className)} aria-label="Opponent" data-testid="opponent">
      <div className="flex items-center gap-2.5">
        {them ? <Avatar emoji={them.emoji} color={them.color} size="sm" name={them.name} /> : <Avatar emoji="❔" color="#9b9bb4" size="sm" />}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">{them?.name ?? 'Opponent'}</span>
            <Badge tone={latencyTone(duel.latencyMs)} size="sm" icon={<Wifi />}>
              {Math.round(duel.latencyMs)} ms
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted tabular">
            <span>
              <span className="text-fg">{points(theirs)}</span> pts
            </span>
            <span>round {done ? done.rounds : (prog?.round ?? 0)}</span>
            <span>{done ? done.correct : (prog?.correct ?? 0)} ✓</span>
            {(prog?.streak ?? 0) >= 2 && <span className="text-warn">🔥 {prog?.streak}</span>}
            {done && <span className="text-success">finished</span>}
          </div>
        </div>
        <div className="text-right leading-tight">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">You</div>
          <div className={cn('font-display text-base font-bold', lead === 'ahead' ? 'text-success' : lead === 'behind' ? 'text-danger' : 'text-fg')}>
            {points(mine)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        {prog?.lastVerdict && (
          <Badge tone={VERDICT_TONE[prog.lastVerdict]} size="sm">
            {VERDICT_LABEL[prog.lastVerdict]}
          </Badge>
        )}
        <span className="text-[11px] text-muted">{wonRounds(state)} ✓ for you</span>
        <div className="ml-auto flex gap-1" role="group" aria-label="Send an emote">
          {EMOTES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => duel.emote(e)}
              aria-label={`Send ${e}`}
              className="grid size-9 place-items-center rounded-full text-lg transition-transform hover:scale-110 hover:bg-surface active:scale-95"
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute -top-2 right-3 h-0" aria-live="polite">
        <AnimatePresence>
          {duel.incomingEmotes.map((e) => (
            <motion.span
              key={e.id}
              className="absolute right-0 text-3xl drop-shadow"
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.6 }}
              animate={reduce ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: -70, scale: 1.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, ease: 'easeOut' }}
              aria-label={`${them?.name ?? 'Opponent'} sent ${e.emoji}`}
            >
              {e.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
