import { useMemo, type RefObject } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CornerDownLeft, Flag, SkipForward } from 'lucide-react';
import type { GameState, HintKind, Track } from '@/types';
import { Button, Combobox, HighlightMatch, IconButton, cn } from '@/components/ui';
import { MicButton, type UseVoiceGuess } from '@/voice';
import { isBuzzerDuel } from '@/game/presets';
import { canGuess, currentRound, nextClipLength } from '@/game/selectors';
import { useCoarsePointer } from '@/hooks/useMediaQuery';
import { HintMenu, UsedHints, type HintMenuHandle } from './HintMenu';
import { clipLabel } from './format';

export interface GuessBoxProps {
  state: GameState;
  query: string;
  onQueryChange: (q: string) => void;
  options: Track[];
  loading: boolean;
  onSubmit: (text: string) => void;
  onSkip: () => void;
  onGiveUp: () => void;
  onHint: (kind: HintKind) => void;
  /** Bump to trigger the wrong-guess shake. */
  shakeKey: number;
  voice: UseVoiceGuess;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Imperative handle of the hint menu (the H shortcut opens it). */
  hintRef?: RefObject<HintMenuHandle | null>;
  className?: string;
  /** Short landscape viewports: tighter gaps. */
  compact?: boolean;
}

export function skipLabel(state: GameState): string {
  if (state.settings.mode === 'blitz') return 'Skip (−3s)';
  const next = nextClipLength(state);
  if (next === undefined) return 'Skip · reveal';
  return state.settings.clipMode === 'escalating' ? `Skip → ${clipLabel(next)}` : 'Skip try';
}

function placeholderFor(state: GameState): string {
  if (isBuzzerDuel(state.settings) && !canGuess(state)) return 'Buzz in first — A or L';
  switch (state.settings.guessTarget) {
    case 'artist':
      return 'Who is this? Artist name…';
    case 'both':
      return 'Artist - Title…';
    default:
      return 'Song title…';
  }
}

function Option({ track, query, big }: { track: Track; query: string; big: boolean }) {
  const thumb = big ? 'size-10' : 'size-9';
  return (
    <div className="flex min-w-0 items-center gap-3">
      {track.cover ? (
        <img src={track.cover} alt="" className={cn(thumb, 'shrink-0 rounded-lg object-cover')} loading="lazy" />
      ) : (
        <span className={cn(thumb, 'shrink-0 rounded-lg bg-gradient-accent')} aria-hidden />
      )}
      <div className="min-w-0">
        <div className="truncate font-semibold">
          <HighlightMatch text={track.title} query={query} />
        </div>
        <div className="truncate text-xs text-muted">
          <HighlightMatch text={track.artist} query={query} />
        </div>
      </div>
    </div>
  );
}

/** The guess field with suggestions, the mic, taken hints, and the skip / hint / give-up row. */
export function GuessBox({
  state,
  query,
  onQueryChange,
  options,
  loading,
  onSubmit,
  onSkip,
  onGiveUp,
  onHint,
  shakeKey,
  voice,
  inputRef,
  hintRef,
  className,
  compact = false,
}: GuessBoxProps) {
  const reduce = useReducedMotion();
  const coarse = useCoarsePointer();
  const round = currentRound(state);
  const allowed = canGuess(state);
  const live = state.status === 'playing' && round?.status === 'playing';
  const skip = useMemo(() => skipLabel(state), [state]);
  if (!round) return null;

  // After a hint, a keyboard user is straight back in the field; on touch the keyboard stays down.
  const refocus = () => {
    if (!coarse) inputRef?.current?.focus();
  };

  return (
    <motion.div
      key={shakeKey}
      className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3', className)}
      animate={shakeKey > 0 && !reduce ? { x: [0, -10, 9, -7, 5, -2, 0] } : { x: 0 }}
      transition={{ duration: 0.42, ease: 'easeInOut' }}
      data-testid="guess-box"
    >
      <UsedHints round={round} />

      <div className="flex items-start gap-2" data-coach="guess">
        <Combobox<Track>
          className="guess-field min-w-0 flex-1"
          value={query}
          onChange={onQueryChange}
          options={options}
          loading={loading}
          getKey={(t) => String(t.id)}
          getLabel={(t) => `${t.artist} - ${t.title}`}
          onSelect={(t) => onSubmit(`${t.artist} - ${t.title}`)}
          onSubmit={onSubmit}
          renderOption={(t, ctx) => <Option track={t} query={ctx.query} big={coarse} />}
          touchAffordance={coarse}
          placeholder={placeholderFor(state)}
          disabled={!live || !allowed}
          size="lg"
          inputMode="search"
          minChars={1}
          aria-label="Your guess"
          inputRef={inputRef}
          clearOnSelect
          emptyMessage="No matches — press Enter to guess anyway"
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
        {voice.supported && (
          <MicButton
            size={56}
            listening={voice.listening}
            level={voice.level}
            interim={voice.interim}
            supported={voice.supported}
            error={voice.error}
            onPress={voice.start}
            onRelease={voice.stop}
            disabled={!live || !allowed}
            className="-mb-5 shrink-0"
          />
        )}
      </div>

      {/* Action row: the hint panel anchors to this row (relative), so it never leaves a phone's viewport. */}
      <div className="relative flex items-center gap-2">
        {state.settings.allowSkip && (
          <Button variant="secondary" size="md" leadingIcon={<SkipForward />} onClick={onSkip} disabled={!live} className="min-w-0 flex-1 sm:flex-none" data-coach="skip">
            {skip}
          </Button>
        )}
        <HintMenu ref={hintRef} settings={state.settings} round={round} onHint={onHint} onSelected={refocus} disabled={!live || !allowed} className={state.settings.allowSkip ? undefined : 'flex-1 sm:flex-none'} />
        <Button variant="ghost" size="md" leadingIcon={<Flag />} onClick={onGiveUp} disabled={!live} aria-label="Give up" className="ml-auto shrink-0 text-muted">
          <span className="hidden sm:inline">Give up</span>
        </Button>
      </div>
    </motion.div>
  );
}
