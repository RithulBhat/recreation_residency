import { cn } from '@/components/ui';
import { visibleCards } from '@/scout/stages';
import type { ScoutPersonCard, ScoutPuzzle } from '@/scout/types';
import { LockedCard, MysteryCard, PuzzleCard, type PuzzleCardDetail, type PuzzleCardPhoto } from './PuzzleCard';
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
  /** How the headshots are printed — `masked` for a round whose answer is the club. */
  photo?: PuzzleCardPhoto;
  /** Mystery tile: the question while the round is live. */
  mysteryLabel: string;
  /** Mystery tile on the reveal. */
  answerName?: string;
  answerImage?: string;
  answerBig?: string;
  tint?: 'accent' | 'accent-2' | 'accent-3';
  testId?: string;
  /** Reveal-time shape: the board stays, a third the height, beside the reveal card. */
  dense?: boolean;
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
  photo = 'plain',
  mysteryLabel,
  answerName,
  answerImage,
  answerBig,
  tint = 'accent-2',
  testId,
  dense = false,
  className,
}: CardSetStageProps) {
  const all: readonly ScoutPersonCard[] = visibleCards(puzzle, 1);
  const shown = revealed ? all : visibleCards(puzzle, visual);
  const locked = Math.max(0, all.length - shown.length);
  // Cells: the mystery tile plus every card the set will ever hold. An odd count spends its spare
  // column on the mystery tile rather than orphaning a card on a row of its own.
  const cells = all.length + 1;
  const wideMystery = (cells + 1) % 6 === 0;
  const size = dense ? 'sm' : 'md';
  // The club is only a secret while the round is live: at the reveal the photographs come back.
  const print: PuzzleCardPhoto = revealed ? 'plain' : photo;
  return (
    <PuzzleShell
      eyebrow={eyebrow}
      question={question}
      label={label}
      hint={locked > 0 ? hint : undefined}
      tint={tint}
      testId={testId}
      dense={dense}
      className={className}
    >
      <CardGrid cols={3} fill={!dense}>
        <MysteryCard
          label={mysteryLabel}
          revealed={revealed}
          answer={answerName}
          image={answerImage}
          big={answerBig}
          size={size}
          grow={!dense}
          className={wideMystery ? 'col-span-2' : undefined}
        />
        {shown.map((card) => (
          <PuzzleCard key={card.playerId} card={card} detail={detail} size={size} grow={!dense} photo={print} />
        ))}
        {Array.from({ length: locked }, (_, i) => (
          <LockedCard key={`locked-${i}`} size={size} grow={!dense} />
        ))}
      </CardGrid>
      {!dense && (
        <p className={cn('mt-3 shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-muted', locked === 0 && 'opacity-70')}>
          {shown.length} of {all.length} shown
        </p>
      )}
    </PuzzleShell>
  );
}
