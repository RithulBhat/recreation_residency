import { useEffect, useRef } from 'react';
import type { ScoutMode, ScoutPersonCard, ScoutStage, ScoutSubject } from '@/scout/types';
import { DepthChartStage } from './DepthChartStage';
import { DraftClassStage } from './DraftClassStage';
import { HigherLowerStage } from './HigherLowerStage';
import { JerseyStage } from './JerseyStage';
import { OddOneOutStage } from './OddOneOutStage';
import { TeammatesStage } from './TeammatesStage';

/**
 * The one component the Play screen needs: hand it the round and it renders whichever choice-shaped
 * board the round is, or `null` when the round is one of the seven reveal modes (those stay with
 * `SubjectStage`).
 *
 * ```tsx
 * isScoutPuzzleMode(round.mode) ? (
 *   <ScoutPuzzleStage
 *     mode={round.mode}
 *     subject={round.subject}
 *     stage={round.stages[round.tryIndex]}
 *     revealed={round.status !== 'playing'}
 *     onChoose={(card) => guess(card.name)}
 *     pickedPlayerIds={wrongPicks}
 *     disabled={round.status !== 'playing'}
 *     onReady={onReady}
 *   />
 * ) : (
 *   <SubjectStage … />
 * )
 * ```
 *
 * Nothing here reads a store: every one of these is a pure function of (payload, rung), which is why
 * a screenshot harness and a unit test can drive them with a fixture.
 */
export interface ScoutPuzzleStageProps {
  /** `round.mode`. Anything that is not one of the six choice-shaped modes renders nothing. */
  mode: ScoutMode;
  /** `round.subject` — it must carry the `puzzle` payload `buildPool` attached. */
  subject: ScoutSubject;
  /** `round.stages[round.tryIndex]`. */
  stage: ScoutStage;
  /** Round over: the answer is marked and both `higherLower` numbers show. */
  revealed?: boolean;
  /**
   * `higherLower` / `oddOneOut`: the round is answered by tapping a card. Wire it straight to the
   * engine — `guess(card.name)` — because the card's name is an accepted spelling of the answer.
   */
  onChoose?: (card: ScoutPersonCard) => void;
  /** Cards this player has already tapped and missed. */
  pickedPlayerIds?: readonly string[];
  /** Round over, someone else's turn, or a locked-out buzzer seat. */
  disabled?: boolean;
  /** Bind the number keys on the two tap-only modes. Default on. */
  hotkeys?: boolean;
  /** Fires once the board is on screen — the round clock waits for it, as with `SubjectStage`. */
  onReady?: () => void;
  className?: string;
}

export function ScoutPuzzleStage({
  mode,
  subject,
  stage,
  revealed = false,
  onChoose,
  pickedPlayerIds,
  disabled,
  hotkeys,
  onReady,
  className,
}: ScoutPuzzleStageProps) {
  const puzzle = subject.puzzle;
  // The board is legible the moment it renders — the names are the clue and the photos are the
  // decoration — so it is ready on mount, exactly as the text stages are.
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    if (puzzle) readyRef.current?.();
  }, [puzzle, subject.id]);

  if (!puzzle || puzzle.type !== mode) return null;

  switch (puzzle.type) {
    case 'teammates':
      return (
        <TeammatesStage
          puzzle={puzzle}
          visual={stage.visual}
          revealed={revealed}
          answerName={subject.name}
          answerImage={subject.image}
          className={className}
        />
      );
    case 'depthChart':
      return (
        <DepthChartStage
          puzzle={puzzle}
          visual={stage.visual}
          revealed={revealed}
          answerName={subject.name}
          answerImage={subject.image}
          className={className}
        />
      );
    case 'draftClass':
      return <DraftClassStage puzzle={puzzle} visual={stage.visual} revealed={revealed} className={className} />;
    case 'higherLower':
      return (
        <HigherLowerStage
          puzzle={puzzle}
          clues={stage.clues}
          revealed={revealed}
          onChoose={onChoose}
          pickedPlayerIds={pickedPlayerIds}
          disabled={disabled}
          hotkeys={hotkeys}
          className={className}
        />
      );
    case 'oddOneOut':
      return (
        <OddOneOutStage
          puzzle={puzzle}
          visual={stage.visual}
          clues={stage.clues}
          revealed={revealed}
          onChoose={onChoose}
          pickedPlayerIds={pickedPlayerIds}
          disabled={disabled}
          hotkeys={hotkeys}
          className={className}
        />
      );
    default:
      return (
        <JerseyStage
          puzzle={puzzle}
          revealed={revealed}
          answerName={subject.name}
          answerImage={subject.image}
          className={className}
        />
      );
  }
}
