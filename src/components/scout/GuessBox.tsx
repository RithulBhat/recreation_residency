import { type RefObject } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CornerDownLeft, Flag, SkipForward } from 'lucide-react';
import { Button, Combobox, HighlightMatch, IconButton, cn } from '@/components/ui';
import { GROUP_LABELS } from '@/scout/stages';
import type { ScoutAnswerShape } from '@/scout/packs';
import type { ScoutState, ScoutSubject, SubjectKind } from '@/scout/types';
import { useCoarsePointer } from '@/hooks/useMediaQuery';
import { awaitingBuzz, canGuess as canGuessNow, currentFormat, triesLeft } from '@/scout/selectors';
import { BLITZ_PENALTY_SECONDS } from './formatCopy';
import { stageImage } from './SubjectStage';

export interface GuessBoxProps {
  state: ScoutState;
  /** What this round is asking for. */
  kind: SubjectKind;
  /**
   * What the answer IS, which is not the same as the pool it came from: a `draftClass` round is built
   * out of players but the answer is a YEAR, so the player index has nothing to suggest and the
   * placeholder must not ask for a name. Defaults to the subject kind.
   */
  answerShape?: ScoutAnswerShape;
  query: string;
  onQueryChange: (q: string) => void;
  /** Ranked suggestions from `suggestSubjects` over the whole league. */
  options: readonly ScoutSubject[];
  loading: boolean;
  onSubmit: (text: string) => void;
  onSkip: () => void;
  onGiveUp: () => void;
  /** Bump to trigger the wrong-guess shake. */
  shakeKey: number;
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}

/**
 * `Skip → clue` / `Skip · reveal` on the last rung — and in BLITZ neither, because a skip there buys
 * no clue and reveals nothing: it burns the subject and five seconds of clock.
 */
export function skipLabel(state: ScoutState): string {
  if (currentFormat(state) === 'blitz') return `Skip · −${BLITZ_PENALTY_SECONDS}s`;
  return triesLeft(state) <= 1 ? 'Skip · reveal' : 'Skip → clue';
}

function placeholderFor(kind: SubjectKind, shape: ScoutAnswerShape): string {
  if (shape === 'year') return 'Which year?';
  return kind === 'team' ? 'Which franchise?' : 'Which player?';
}

/** A dead box needs to say WHY it is dead: in a buzzer duel the answer is "nobody has the buzzer". */
function buzzPlaceholder(): string {
  return 'Buzz in first — A or L';
}

function labelFor(kind: SubjectKind, shape: ScoutAnswerShape): string {
  if (shape === 'year') return 'Your guess — which draft year';
  return kind === 'team' ? 'Your guess — which team' : 'Your guess — which player';
}

function Option({ subject, query, big }: { subject: ScoutSubject; query: string; big: boolean }) {
  const thumb = big ? 'size-10' : 'size-9';
  const player = subject.player;
  const team = subject.team;
  const sub =
    subject.kind === 'team'
      ? team
        ? `${team.conference} ${team.division}`
        : ''
      : [player ? GROUP_LABELS[player.group] : '', team?.abbr, player?.jersey ? `#${player.jersey}` : '']
          .filter((s) => s !== '' && s !== undefined)
          .join(' · ');
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src={stageImage(subject)}
        alt=""
        className={cn(thumb, 'shrink-0 rounded-lg bg-surface object-contain')}
        loading="lazy"
        decoding="async"
      />
      <div className="min-w-0">
        <div className="truncate font-semibold">
          <HighlightMatch text={subject.name} query={query} />
        </div>
        {sub !== '' && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
    </div>
  );
}

/**
 * The guess field: a combobox over every player (or all 32 franchises) in the dataset — never over
 * the run's own queue, which would turn the autocomplete into the answer sheet. Free text always
 * submits, so a name the index spells differently still counts (the matcher is typo-tolerant).
 *
 * A wrong guess shakes the whole box. The `close` verdict's amber card is rendered by
 * {@link Feedback} right above it.
 */
export function GuessBox({
  state,
  kind,
  answerShape,
  query,
  onQueryChange,
  options,
  loading,
  onSubmit,
  onSkip,
  onGiveUp,
  shakeKey,
  inputRef,
  className,
}: GuessBoxProps) {
  const reduce = useReducedMotion();
  const coarse = useCoarsePointer();
  const round = state.rounds[state.currentRound];
  const live = state.status === 'playing' && round?.status === 'playing';
  const allowed = canGuessNow(state);
  const shape: ScoutAnswerShape = answerShape ?? kind;
  const year = shape === 'year';
  const waiting = awaitingBuzz(state);
  if (!round) return null;

  return (
    <motion.div
      key={shakeKey}
      className={cn('flex flex-col gap-3', className)}
      animate={shakeKey > 0 && !reduce ? { x: [0, -10, 9, -7, 5, -2, 0] } : { x: 0 }}
      transition={{ duration: 0.42, ease: 'easeInOut' }}
      data-testid="scout-guess-box"
      data-waiting={waiting ? 'buzz' : undefined}
    >
      <Combobox<ScoutSubject>
        className="min-w-0 flex-1"
        value={query}
        onChange={onQueryChange}
        options={year ? [] : options}
        loading={year ? false : loading}
        getKey={(s) => `${s.kind}:${s.id}`}
        getLabel={(s) => s.name}
        onSelect={(s) => onSubmit(s.name)}
        onSubmit={onSubmit}
        renderOption={(s, ctx) => <Option subject={s} query={ctx.query} big={coarse} />}
        touchAffordance={coarse}
        placeholder={waiting ? buzzPlaceholder() : placeholderFor(kind, shape)}
        disabled={!live || !allowed}
        size="lg"
        inputMode={year ? 'text' : 'search'}
        minChars={1}
        aria-label={labelFor(kind, shape)}
        inputRef={inputRef}
        clearOnSelect
        emptyMessage={year ? 'Type the year and press Enter' : 'No match — press Enter to guess it anyway'}
        trailing={
          <IconButton
            aria-label="Submit guess"
            icon={<CornerDownLeft />}
            size="sm"
            variant={query.trim() ? 'primary' : 'ghost'}
            disabled={!live || !allowed || !query.trim()}
            onClick={() => onSubmit(query)}
          />
        }
      />

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="md"
          leadingIcon={<SkipForward />}
          onClick={onSkip}
          disabled={!live}
          className="min-w-0 flex-1 sm:flex-none"
          data-testid="scout-skip"
        >
          {skipLabel(state)}
        </Button>
        <Button
          variant="ghost"
          size="md"
          leadingIcon={<Flag />}
          onClick={onGiveUp}
          disabled={!live}
          aria-label="Give up on this one"
          className="ml-auto min-w-0 shrink text-muted"
          data-testid="scout-give-up"
        >
          <span className="hidden sm:inline">Give up</span>
        </Button>
      </div>
    </motion.div>
  );
}
