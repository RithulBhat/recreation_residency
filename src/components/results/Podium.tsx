import { motion, useReducedMotion } from 'motion/react';
import type { GameState, PlayerState } from '@/types';
import { Avatar, cn } from '@/components/ui';
import { isTie, standings } from '@/game/selectors';
import { points } from '@/components/play/format';

export interface PodiumProps {
  state: GameState;
}

const HEIGHTS = ['h-24 sm:h-28', 'h-16 sm:h-20', 'h-12 sm:h-14'] as const;
const MEDALS = ['🥇', '🥈', '🥉'] as const;

function Step({ player, place, winner, delay }: { player: PlayerState; place: number; winner: boolean; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      className="flex min-w-0 flex-1 flex-col items-center"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 24 }}
      aria-label={`${place + 1}. ${player.name}, ${points(player.score)} points`}
    >
      <div className="relative">
        {winner && (
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xl" aria-hidden>
            👑
          </span>
        )}
        <Avatar emoji={player.emoji} color={player.color} size={place === 0 ? 'lg' : 'md'} name={player.name} active={winner} />
      </div>
      <div className="mt-2 max-w-full truncate text-sm font-semibold text-fg">{player.name}</div>
      <div className="font-mono text-xs text-muted tabular">
        {points(player.score)} · {player.correct} ✓ · 🔥{player.bestStreak}
      </div>
      <div
        className={cn('mt-2 w-full rounded-t-2xl border border-b-0 border-border bg-surface-strong text-center font-display text-xl', HEIGHTS[place])}
        style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${player.color} 45%, transparent), transparent)` }}
      >
        <span className="inline-block pt-2">{MEDALS[place]}</span>
      </div>
    </motion.li>
  );
}

/** Winner podium + the rest of the field for duel / party games. */
export function Podium({ state }: PodiumProps) {
  const ranked = standings(state);
  if (ranked.length < 2) return null;
  const tie = isTie(state);
  const top = ranked.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const rest = ranked.slice(3);

  return (
    <section className="glass rounded-4xl p-5" aria-label="Standings" data-testid="podium">
      <p className="text-center font-display text-xl font-bold text-fg">
        {tie ? "It's a tie!" : `${ranked[0].name} takes it ${ranked[0].emoji}`}
      </p>
      <ol className="mt-6 flex items-end justify-center gap-3 border-b border-border">
        {order.map((p, i) => {
          const place = ranked.indexOf(p);
          return <Step key={p.id} player={p} place={place} winner={place === 0 && !tie} delay={0.1 + i * 0.12} />;
        })}
      </ol>
      {rest.length > 0 && (
        <ol className="mt-3 flex flex-col divide-y divide-border" start={4}>
          {rest.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-5 font-mono text-muted">{i + 4}.</span>
              <Avatar emoji={p.emoji} color={p.color} size="xs" name={p.name} />
              <span className="flex-1 truncate font-semibold text-fg">{p.name}</span>
              <span className="font-mono text-muted tabular">
                {points(p.score)} · {p.correct} ✓
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
