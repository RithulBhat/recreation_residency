import { useEffect, useMemo, useRef } from 'react';
import { headshotUrl, logoUrl } from '@/data/nfl';
import { cropFocus, type ScoutFocus, type ScoutFocusStage } from '@/scout/stages';
import type { ScoutMode, ScoutStage, ScoutSubject } from '@/scout/types';
import { CareerTimeline } from './CareerTimeline';
import { PhotoStage } from './PhotoStage';
import { RedactedPlay } from './RedactedPlay';
import { StatTable } from './StatTable';
import { TriviaStack } from './TriviaStack';
import { stageClues } from './format';
import { isVisualMode } from './visuals';

export interface SubjectStageProps {
  mode: ScoutMode;
  subject: ScoutSubject;
  /** The rung on screen: `stages[tryIndex]`. */
  stage: ScoutStage;
  /** The LAST rung of the ladder — used only to draw how many clues are still locked. */
  lastStage?: ScoutStage;
  /** Round over: the image modes ease to the clean photo. */
  revealed?: boolean;
  /** `settings.seed`, for the deterministic crop centre when the stage carries no focus. */
  seed?: string;
  /** Fired when the stage is ready to be looked at — the round clock waits for it. */
  onReady?: () => void;
  className?: string;
}

/** The image a mode needs: the record's own URL, or one rebuilt from the id. */
export function stageImage(subject: ScoutSubject): string {
  if (subject.image) return subject.image;
  if (subject.kind === 'team') return subject.team ? logoUrl(subject.team.abbr) : '';
  return headshotUrl(subject.id);
}

function focusOf(stage: ScoutStage, subject: ScoutSubject, mode: ScoutMode, seed?: string): ScoutFocus {
  const carried = (stage as ScoutFocusStage).focus;
  if (carried && typeof carried.x === 'number' && typeof carried.y === 'number') return carried;
  return cropFocus(subject, mode, seed);
}

/**
 * The centrepiece: whatever this round's mode actually shows you.
 *
 * Image modes (`silhouette`, `faceZoom`, `logoZoom`) get {@link PhotoStage} — the tested treatment
 * ladder from the visual spec. Text modes get their own typography: a redacted play sheet, a stat
 * sheet that fills in, a franchise dossier of cards, a career timeline that extends. Every one of
 * them takes exactly `stages[tryIndex]` and nothing else, because the engine's clue arrays are
 * cumulative.
 */
export function SubjectStage({ mode, subject, stage, lastStage, revealed = false, seed, onReady, className }: SubjectStageProps) {
  const clues = useMemo(() => stageClues(mode, stage.clues), [mode, stage.clues]);
  const allClues = useMemo(() => stageClues(mode, (lastStage ?? stage).clues), [mode, lastStage, stage]);
  const image = isVisualMode(mode);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  // Text modes have no bitmap to decode: they are on screen as soon as they render.
  useEffect(() => {
    if (!image) readyRef.current?.();
  }, [image, mode, subject.id]);

  if (image) {
    return (
      <PhotoStage
        mode={mode}
        src={stageImage(subject)}
        visual={stage.visual}
        revealed={revealed}
        focus={focusOf(stage, subject, mode, seed)}
        onReady={onReady}
        alt={subject.kind === 'team' ? `${subject.name} logo` : subject.name}
        className={className}
      />
    );
  }
  if (mode === 'highlight') return <RedactedPlay clues={clues} className={className} />;
  if (mode === 'statLine') return <StatTable clues={clues} allClues={allClues} className={className} />;
  if (mode === 'teamTrivia') return <TriviaStack clues={clues} allClues={allClues} className={className} />;
  return <CareerTimeline clues={clues} allClues={allClues} className={className} />;
}
