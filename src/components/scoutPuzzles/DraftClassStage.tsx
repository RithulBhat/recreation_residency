import type { ScoutDraftClassPuzzle } from '@/scout/types';
import { CardSetStage } from './CardSetStage';

/** `draftClass` — four men taken in the same draft. Name the year. */
export interface DraftClassStageProps {
  puzzle: ScoutDraftClassPuzzle;
  /** `stages[tryIndex].visual`. */
  visual: number;
  revealed?: boolean;
  /** Reveal-time shape: the board stays beside the reveal card. */
  dense?: boolean;
  className?: string;
}

export function DraftClassStage({ puzzle, visual, revealed, dense, className }: DraftClassStageProps) {
  return (
    <CardSetStage
      puzzle={puzzle}
      visual={visual}
      revealed={revealed}
      eyebrow="Draft class"
      question="All four came off the board in the same draft. Which year?"
      label="Draft class"
      hint="Every miss narrows the window — a decade, then five years, then two."
      detail="draft"
      mysteryLabel="Which year?"
      answerBig={String(puzzle.year)}
      answerName={`${puzzle.year} draft class`}
      tint="accent"
      testId="scout-stage-draft-class"
      dense={dense}
      className={className}
    />
  );
}
