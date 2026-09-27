import type { ScoutTeammatesPuzzle } from '@/scout/types';
import { CardSetStage } from './CardSetStage';

/** `teammates` — four of his current teammates are on the board. Name the man who is missing. */
export interface TeammatesStageProps {
  puzzle: ScoutTeammatesPuzzle;
  /** `stages[tryIndex].visual`. */
  visual: number;
  revealed?: boolean;
  /** The answer's name, for the reveal tile. */
  answerName?: string;
  /** The answer's headshot, for the reveal tile. */
  answerImage?: string;
  className?: string;
}

export function TeammatesStage({ puzzle, visual, revealed, answerName, answerImage, className }: TeammatesStageProps) {
  return (
    <CardSetStage
      puzzle={puzzle}
      visual={visual}
      revealed={revealed}
      eyebrow="Locker room"
      question="These men share a locker room. Name the one who is missing."
      label="Teammates"
      hint="Every miss walks another teammate in."
      detail="jersey"
      mysteryLabel="Who is he?"
      answerName={answerName}
      answerImage={answerImage}
      tint="accent-2"
      testId="scout-stage-teammates"
      className={className}
    />
  );
}
