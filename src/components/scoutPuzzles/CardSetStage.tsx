import { cn } from '@/components/ui';
import { visibleCards } from '@/scout/stages';
import type { ScoutPersonCard, ScoutPuzzle } from '@/scout/types';
import { LockedCard, MysteryCard, PuzzleCard, type PuzzleCardDetail } from './PuzzleCard';
import { CardGrid, PuzzleShell } from './PuzzleShell';

/**
 * The shared body of the three typed-answer card modes (`teammates`, `depthChart`, `draftClass`).
 *
 * All three ask the same shape of question — here is a set of real men, name the thing they have in
 * common — so they share one board: the mystery tile that holds the answer, the cards the ladder has
 * paid out so far, and a dashed slot for every card still to come, so you can see how much rope is
 * left (the same promise `TriviaStack` makes).
 */
export interface CardSetStageProps {
  puzzle: ScoutPuzzle;
  /** `stages[tryIndex].visual` — how much of the set is on the board. */
  visual: number;
  revealed?: boolean;
  eyebrow: string;
  question: string;
  label: string;
  hint?: string;
  /** What the line under each name says. */
  detail?: PuzzleCardDetail;
  /** Mystery tile: the question while the round is live. */
  mysteryLabel: string;
  /** Mystery tile on the reveal. */
  answerName?: string;
  answerImage?: string;
  answerBig?: string;
  tint?: 'accent' | 'accent-2' | 'accent-3';
  testId?: string;
  className?: string;
}

export function CardSetStage({
  puzzle,
  visual,
  revealed = false,
  eyebrow,
  question,
  label,
  hint,
  detail = 'position',
  mysteryLabel,
  answerName,
  answerImage,
  answerBig,
  tint = 'accent-2',
  testId,
  className,
}: CardSetStageProps) {
  const all: readonly ScoutPersonCard[] = visibleCards(puzzle, 1);
  const shown = revealed ? all : visibleCards(puzzle, visual);
  const locked = Math.max(0, all.length - shown.length);
  return (
    <PuzzleShell
      eyebrow={eyebrow}
      question={question}
      label={label}
      hint={locked > 0 ? hint : undefined}
      tint={tint}
      testId={testId}
      className={className}
    >
      <CardGrid>
        <MysteryCard label={mysteryLabel} revealed={revealed} answer={answerName} image={answerImage} big={answerBig} />
        {shown.map((card) => (
          <PuzzleCard key={card.playerId} card={card} detail={detail} />
        ))}
        {Array.from({ length: locked }, (_, i) => (
          <LockedCard key={`locked-${i}`} />
        ))}
      </CardGrid>
      <p className={cn('mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted', locked === 0 && 'opacity-70')}>
        {shown.length} of {all.length} shown
      </p>
    </PuzzleShell>
  );
}
