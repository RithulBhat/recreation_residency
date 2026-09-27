import { useEffect } from 'react';
import { cn } from '@/components/ui';
import { GROUP_PEOPLE_LABELS } from '@/scout/stages';
import type { ScoutClue, ScoutHigherLowerPuzzle, ScoutPersonCard } from '@/scout/types';
import { PuzzleCard, type PuzzleCardState } from './PuzzleCard';
import { PuzzleShell } from './PuzzleShell';
import { isTypingTarget, revealedValueIndex, statPhrase } from './puzzleReads';

/**
 * `higherLower` — two men, one stat, one tap.
 *
 * There is no guess box in this round: the cards ARE the answer, so they are real buttons (keyboard
 * reachable, `1` / `2` and the arrow keys as a shortcut). Both numbers stay hidden until the ladder
 * pays one out or the round ends, because the whole question is which one is bigger.
 */
export interface HigherLowerStageProps {
  puzzle: ScoutHigherLowerPuzzle;
  /** `stages[tryIndex].clues` — one of the two numbers rides in on the last rung. */
  clues?: readonly ScoutClue[];
  /** Round over: both numbers show and the answer is marked. */
  revealed?: boolean;
  /** Fired with the card that was tapped. Feed it to the engine as `guess(card.name)`. */
  onChoose?: (card: ScoutPersonCard) => void;
  /** Cards already picked and missed this round. */
  pickedPlayerIds?: readonly string[];
  disabled?: boolean;
  /** Bind `1` / `2` and the arrow keys. On by default — this mode has no text input to clash with. */
  hotkeys?: boolean;
  /** Reveal-time shape: the board stays beside the reveal card. */
  dense?: boolean;
  className?: string;
}

export function HigherLowerStage({
  puzzle,
  clues = [],
  revealed = false,
  onChoose,
  pickedPlayerIds = [],
  disabled = false,
  hotkeys = true,
  dense = false,
  className,
}: HigherLowerStageProps) {
  const live = !disabled && !revealed && onChoose !== undefined;

  useEffect(() => {
    if (!live || !hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const index: 0 | 1 | null = e.key === '1' || e.key === 'ArrowLeft' ? 0 : e.key === '2' || e.key === 'ArrowRight' ? 1 : null;
      if (index === null) return;
      e.preventDefault();
      onChoose?.(puzzle.cards[index]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, hotkeys, onChoose, puzzle]);

  const paidOut = revealedValueIndex(puzzle, clues);
  const stateOf = (card: ScoutPersonCard): PuzzleCardState => {
    // On the reveal the winner is marked and the other card is simply the other card — it is only
    // drawn as a miss when this player actually picked it.
    if (card.playerId === puzzle.answerPlayerId) return revealed ? 'answer' : 'idle';
    if (pickedPlayerIds.includes(card.playerId)) return 'missed';
    return revealed ? 'dimmed' : 'idle';
  };
  const valueOf = (i: 0 | 1): string | undefined => (revealed || paidOut === i ? puzzle.values[i] : undefined);

  return (
    <PuzzleShell
      eyebrow={`${GROUP_PEOPLE_LABELS[puzzle.group]} · ${puzzle.season}`}
      question={`Who had more ${statPhrase(puzzle.statLabel)}?`}
      label="Higher or lower"
      hint={revealed ? undefined : 'No typing. Tap a card — or press 1 or 2.'}
      tint="accent-3"
      testId="scout-stage-higher-lower"
      dense={dense}
      className={className}
    >
      {/* One row of two, so the pair is capped rather than stretched into a 700 px column of card:
          the glass fills the slot, the cards stay in proportion and centre in it. */}
      <div className={cn('grid min-h-0 items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]', !dense && 'my-auto max-h-[32rem] flex-1')}>
        <PuzzleCard
          card={puzzle.cards[0]}
          detail="position"
          size={dense ? 'sm' : 'lg'}
          grow={!dense}
          state={stateOf(puzzle.cards[0])}
          onPick={live ? onChoose : undefined}
          hotkey={1}
          value={valueOf(0)}
        />
        <span
          className="my-auto mx-auto hidden size-9 place-items-center rounded-full border border-border bg-surface font-mono text-[11px] font-bold uppercase text-muted sm:grid"
          aria-hidden
        >
          vs
        </span>
        <PuzzleCard
          card={puzzle.cards[1]}
          detail="position"
          size={dense ? 'sm' : 'lg'}
          grow={!dense}
          state={stateOf(puzzle.cards[1])}
          onPick={live ? onChoose : undefined}
          hotkey={2}
          value={valueOf(1)}
        />
      </div>
      <p className={cn('mt-3 shrink-0 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted', revealed && 'text-success', dense && 'mt-2')}>
        {revealed
          ? `${puzzle.statLabel} · ${puzzle.season}`
          : paidOut === null
            ? `${puzzle.statLabel} · both hidden`
            : `${puzzle.statLabel} · one number is out`}
      </p>
    </PuzzleShell>
  );
}
