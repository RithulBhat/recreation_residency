/**
 * The choice-shaped stage components.
 *
 * `ScoutPuzzleStage` is the only thing the Play screen needs — it routes a round to the right board.
 * The leaves are exported too, because they are pure and take a payload plus a rung, which is what
 * makes them testable and what the screenshot harness in `__harness__` drives.
 */

export { ScoutPuzzleStage, type ScoutPuzzleStageProps } from './PuzzleStage';
export { TeammatesStage, type TeammatesStageProps } from './TeammatesStage';
export { DepthChartStage, type DepthChartStageProps } from './DepthChartStage';
export { DraftClassStage, type DraftClassStageProps } from './DraftClassStage';
export { HigherLowerStage, type HigherLowerStageProps } from './HigherLowerStage';
export { OddOneOutStage, type OddOneOutStageProps } from './OddOneOutStage';
export { JerseyStage, type JerseyStageProps } from './JerseyStage';
export { CardSetStage, type CardSetStageProps } from './CardSetStage';
export { PuzzleShell, CardGrid, type PuzzleShellProps } from './PuzzleShell';
export {
  PuzzleCard,
  LockedCard,
  MysteryCard,
  type PuzzleCardProps,
  type PuzzleCardDetail,
  type PuzzleCardPhoto,
  type PuzzleCardState,
  type MysteryCardProps,
} from './PuzzleCard';
export { revealedValueIndex, sharedValueRevealed, hexLuminance, inkOn, isTypingTarget, INK_CROSSOVER, STAT_PHRASES, statPhrase } from './puzzleReads';
