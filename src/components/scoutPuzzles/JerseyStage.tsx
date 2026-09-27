import { useState } from 'react';
import { cn } from '@/components/ui';
import { GROUP_LABELS, GROUP_PERSON_LABELS } from '@/scout/stages';
import type { ScoutJerseyPuzzle } from '@/scout/types';
import { PuzzleShell } from './PuzzleShell';
import { inkOn } from './puzzleReads';

/**
 * `jersey` — a number, a position and two club colours. No photograph at all.
 *
 * Numbers repeat across the league (there are 32 number 12s), so the COLOURS are load-bearing and
 * get the whole plate: the primary as the shirt, the secondary as its trim and the number in whatever
 * ink stays readable on it (see `inkOn` — club colours come from the dataset, so this is the one place
 * a literal colour is the correct answer rather than a token).
 */
export interface JerseyStageProps {
  puzzle: ScoutJerseyPuzzle;
  revealed?: boolean;
  /** The answer's name, for the reveal. */
  answerName?: string;
  /** The answer's headshot, for the reveal. */
  answerImage?: string;
  /** Reveal-time shape: the plate stays beside the reveal card, a third the size. */
  dense?: boolean;
  className?: string;
}

export function JerseyStage({ puzzle, revealed = false, answerName, answerImage, dense = false, className }: JerseyStageProps) {
  const [broken, setBroken] = useState(false);
  const [primary, secondary] = puzzle.colors;
  const ink = inkOn(primary);
  return (
    <PuzzleShell
      eyebrow="Numbers game"
      question={`Which ${GROUP_PERSON_LABELS[puzzle.group]} wears this?`}
      label="Jersey number"
      hint={revealed ? undefined : 'No photo. The number, the position, and the club’s two colours.'}
      tint="accent"
      testId="scout-stage-jersey"
      dense={dense}
      className={className}
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-center gap-4 sm:gap-6',
          !dense && 'min-h-0 flex-1',
        )}
      >
        <div
          className={cn(
            'relative grid shrink-0 place-items-center self-center overflow-hidden rounded-[2rem] border border-border-strong shadow-lg',
            dense
              ? 'h-24 w-[5.5rem]'
              : 'h-40 w-36 sm:h-48 sm:w-44 lg:h-full lg:max-h-[26rem] lg:min-h-48 lg:w-auto lg:[aspect-ratio:9/11] 2xl:max-h-[34rem]',
          )}
          style={{ background: primary }}
          data-testid="scout-jersey-plate"
        >
          <span aria-hidden className="absolute inset-x-0 top-0 h-3" style={{ background: secondary }} />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-3" style={{ background: secondary }} />
          <span
            className={cn(
              'relative font-mono font-bold leading-none tabular-nums',
              dense ? 'text-4xl' : 'text-6xl sm:text-7xl lg:text-[clamp(3.75rem,17vh,9rem)]',
            )}
            style={{ color: ink, textShadow: `0 2px 0 ${secondary}` }}
          >
            {puzzle.number}
          </span>
        </div>

        <dl className={cn('grid min-w-0 gap-2.5 text-sm', dense && 'gap-1.5 text-xs')}>
          <div className="rounded-2xl border border-border bg-surface px-3 py-2">
            <dt className="eyebrow-readable">Position</dt>
            <dd className="mt-0.5 font-semibold text-fg">
              {GROUP_LABELS[puzzle.group]} <span className="font-mono text-xs text-muted">({puzzle.pos})</span>
            </dd>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-3 py-2">
            <dt className="eyebrow-readable">Club colours</dt>
            <dd className="mt-1 flex items-center gap-2">
              {[primary, secondary].map((hex) => (
                <span key={hex} className="inline-flex items-center gap-1.5 font-mono text-xs text-fg">
                  <span className="size-4 rounded-full border border-border-strong" style={{ background: hex }} aria-hidden />
                  {hex}
                </span>
              ))}
            </dd>
          </div>
          {revealed && answerName !== undefined && (
            <div className="flex items-center gap-3 rounded-2xl border border-success bg-success/10 px-3 py-2">
              {answerImage !== undefined && answerImage !== '' && !broken && (
                <img
                  src={answerImage}
                  alt=""
                  className="size-10 shrink-0 rounded-xl bg-surface object-contain"
                  loading="lazy"
                  decoding="async"
                  onError={() => setBroken(true)}
                />
              )}
              <div className="min-w-0">
                <div className="eyebrow-readable">The answer</div>
                <div className="truncate font-semibold text-fg">{answerName}</div>
              </div>
            </div>
          )}
        </dl>
      </div>
    </PuzzleShell>
  );
}
