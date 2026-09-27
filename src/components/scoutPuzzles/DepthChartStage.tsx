import type { ScoutDepthChartPuzzle } from '@/scout/types';
import { CardSetStage } from './CardSetStage';

/**
 * `depthChart` — five men off one roster. Name the club.
 *
 * The photographs are printed MASKED (see `PuzzleCardPhoto`): the round asks which club these men
 * play for, and a full-colour bust with the crest on the collar answers that before a single clue is
 * spent. Zoomed to the head, faded above the collar, drained of colour — the faces are the question.
 */
export interface DepthChartStageProps {
  puzzle: ScoutDepthChartPuzzle;
  /** `stages[tryIndex].visual`. */
  visual: number;
  revealed?: boolean;
  /** The club's name, for the reveal tile. */
  answerName?: string;
  /** The club's logo, for the reveal tile. */
  answerImage?: string;
  /** Reveal-time shape: the board stays beside the reveal card. */
  dense?: boolean;
  className?: string;
}

export function DepthChartStage({ puzzle, visual, revealed, answerName, answerImage, dense, className }: DepthChartStageProps) {
  return (
    <CardSetStage
      puzzle={puzzle}
      visual={visual}
      revealed={revealed}
      eyebrow="Depth chart"
      question="Five men off one depth chart. Which club signs their cheques?"
      label="Depth chart"
      hint="Every miss adds another name off the same roster."
      detail="jersey"
      photo="masked"
      mysteryLabel="Which club?"
      answerName={answerName}
      answerImage={answerImage}
      tint="accent-3"
      testId="scout-stage-depth-chart"
      dense={dense}
      className={className}
    />
  );
}
