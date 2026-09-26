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

/** One row of the phone-width standings: place, avatar, name, score, calls and streak. */
function Row({ player, place, winner }: { player: PlayerState; place: number; winner: boolean }) {
  return (
    <li
      className={cn('flex items-center gap-3 rounded-2xl px-2 py-2.5', winner && 'border border-border-strong')}
      style={winner ? { background: `linear-gradient(90deg, color-mix(in oklab, ${player.color} 28%, transparent), transparent 70%)` } : undefined}
      aria-label={`${place + 1}. ${player.name}, ${points(player.score)} points`}
    >
      <span className="w-7 shrink-0 text-center font-mono text-sm text-muted tabular" aria-hidden>
        {place < 3 ? MEDALS[place] : `${place + 1}.`}
      </span>
      <Avatar emoji={player.emoji} color={player.color} size="sm" name={player.name} active={winner} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{player.name}</span>
      <span className="shrink-0 text-right leading-tight">
        <span className="block font-mono text-base font-bold text-fg tabular">{points(player.score)}</span>
        <span className="block font-mono text-[11px] text-muted tabular">
          {player.correct} ✓ · 🔥{player.bestStreak}
        </span>
      </span>
    </li>
  );
}

/**
 * Standings for duel / party games: a podium from `sm` up, and a ranked list on phones — three
 * avatars at three heights never fit a 390 px column.
 */
export function Podium({ state }: PodiumProps) {
  const ranked = standings(state);
  if (ranked.length < 2) return null;
  const tie = isTie(state);
  const top = ranked.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const rest = ranked.slice(3);

  return (
    <section className="glass rounded-4xl p-4 sm:p-5" aria-label="Standings" data-testid="podium">
      <h2 className="text-center font-display text-lg font-bold text-fg sm:text-xl">{tie ? "It's a tie!" : `${ranked[0].name} takes it ${ranked[0].emoji}`}</h2>

      <ol className="mt-3 flex flex-col gap-1 sm:hidden" data-testid="standings-list">
        {ranked.map((p, i) => (
          <Row key={p.id} player={p} place={i} winner={i === 0 && !tie} />
        ))}
      </ol>

      <ol className="mt-6 hidden items-end justify-center gap-3 border-b border-border sm:flex" data-testid="podium-steps">
        {order.map((p, i) => {
          const place = ranked.indexOf(p);
          return <Step key={p.id} player={p} place={place} winner={place === 0 && !tie} delay={0.1 + i * 0.12} />;
        })}
      </ol>
      {rest.length > 0 && (
        <ol className="mt-3 hidden flex-col divide-y divide-border sm:flex" start={4}>
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
