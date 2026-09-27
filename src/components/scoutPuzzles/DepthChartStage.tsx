import type { ScoutDepthChartPuzzle } from '@/scout/types';
import { CardSetStage } from './CardSetStage';

/** `depthChart` — five men off one roster. Name the club. */
export interface DepthChartStageProps {
  puzzle: ScoutDepthChartPuzzle;
  /** `stages[tryIndex].visual`. */
  visual: number;
  revealed?: boolean;
  /** The club's name, for the reveal tile. */
  answerName?: string;
  /** The club's logo, for the reveal tile. */
  answerImage?: string;
  className?: string;
}

export function DepthChartStage({ puzzle, visual, revealed, answerName, answerImage, className }: DepthChartStageProps) {
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
      mysteryLabel="Which club?"
      answerName={answerName}
      answerImage={answerImage}
      tint="accent-3"
      testId="scout-stage-depth-chart"
      className={className}
    />
  );
}
