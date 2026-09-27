import { useEffect } from 'react';
import { ODD_TRAIT_PROMPTS } from '@/scout/puzzles';
import { ruledOutCardIds } from '@/scout/stages';
import type { ScoutClue, ScoutOddOneOutPuzzle, ScoutOddTrait, ScoutPersonCard } from '@/scout/types';
import { PuzzleCard, type PuzzleCardDetail, type PuzzleCardState } from './PuzzleCard';
import { CardGrid, PuzzleShell } from './PuzzleShell';
import { isTypingTarget, sharedValueRevealed } from './puzzleReads';

/**
 * `oddOneOut` — four men, three of whom share something. Pick the one who does not.
 *
 * Another tap-only round, so the cards are buttons with `1`–`4` bound. Rung 0 names the CATEGORY
 * (without it the question is unanswerable); later rungs pay out the value the three share and
 * strike out a wrong card at a time — struck-out cards stay on the board, greyed and unpickable, so
 * the elimination reads as progress rather than as the board changing under you.
 */
/**
 * The card line that does not answer the question: never the club when the round is about clubs,
 * never the position when the round is about position groups.
 */
const DETAIL_FOR_TRAIT: Readonly<Record<ScoutOddTrait, PuzzleCardDetail>> = {
  college: 'position',
  team: 'jersey',
  draftRound: 'position',
  positionGroup: 'club',
};

export interface OddOneOutStageProps {
  puzzle: ScoutOddOneOutPuzzle;
  /** `stages[tryIndex].visual` — how many wrong cards have been struck out. */
  visual: number;
  /** `stages[tryIndex].clues` — the shared value rides in on one of them. */
  clues?: readonly ScoutClue[];
  revealed?: boolean;
  /** Fired with the card that was tapped. Feed it to the engine as `guess(card.name)`. */
  onChoose?: (card: ScoutPersonCard) => void;
  /** Cards already picked and missed this round. */
  pickedPlayerIds?: readonly string[];
  disabled?: boolean;
  /** Bind `1`–`4`. On by default — this mode has no text input to clash with. */
  hotkeys?: boolean;
  className?: string;
}

export function OddOneOutStage({
  puzzle,
  visual,
  clues = [],
  revealed = false,
  onChoose,
  pickedPlayerIds = [],
  disabled = false,
  hotkeys = true,
  className,
}: OddOneOutStageProps) {
  const ruledOut = revealed ? [] : ruledOutCardIds(puzzle, visual);
  const live = !disabled && !revealed && onChoose !== undefined;

  useEffect(() => {
    if (!live || !hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const index = ['1', '2', '3', '4'].indexOf(e.key);
      if (index < 0 || index >= puzzle.cards.length) return;
      const card = puzzle.cards[index];
      if (ruledOut.includes(card.playerId)) return;
      e.preventDefault();
      onChoose?.(card);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, hotkeys, onChoose, puzzle, ruledOut]);

  const shared = sharedValueRevealed(puzzle, clues);
  const stateOf = (card: ScoutPersonCard): PuzzleCardState => {
    if (revealed) return card.playerId === puzzle.answerPlayerId ? 'answer' : 'idle';
    if (pickedPlayerIds.includes(card.playerId)) return 'missed';
    return ruledOut.includes(card.playerId) ? 'ruledOut' : 'idle';
  };

  return (
    <PuzzleShell
      eyebrow={`Odd one out · ${puzzle.traitLabel}`}
      question={`Three of these four share ${ODD_TRAIT_PROMPTS[puzzle.trait]}. Which one does not?`}
      label="Odd one out"
      hint={revealed ? undefined : 'Tap the outlier — or press 1 to 4. Misses strike out a wrong card.'}
      tint="accent"
      testId="scout-stage-odd-one-out"
      className={className}
    >
      {shared && (
        <p className="mb-3 flex flex-wrap items-baseline gap-2">
          <span className="eyebrow-readable">The three share</span>
          <span className="rounded-xl border border-accent/40 bg-accent/10 px-2.5 py-1 font-semibold text-fg">
            {puzzle.sharedValue}
          </span>
        </p>
      )}
      <CardGrid min="9rem">
        {puzzle.cards.map((card, i) => (
          <PuzzleCard
            key={card.playerId}
            card={card}
            detail={DETAIL_FOR_TRAIT[puzzle.trait]}
            state={stateOf(card)}
            onPick={live ? onChoose : undefined}
            hotkey={i + 1}
          />
        ))}
      </CardGrid>
      {ruledOut.length > 0 && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {ruledOut.length} struck out · {puzzle.cards.length - ruledOut.length} still in
        </p>
      )}
    </PuzzleShell>
  );
}
