import { useMemo, type RefObject } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CornerDownLeft, Flag, SkipForward } from 'lucide-react';
import type { GameState, HintKind, Track } from '@/types';
import { Button, Combobox, HighlightMatch, IconButton, cn } from '@/components/ui';
import { MicButton, type UseVoiceGuess } from '@/voice';
import { isBuzzerDuel } from '@/game/presets';
import { canGuess, currentRound, nextClipLength } from '@/game/selectors';
import { HintChips } from './HintChips';
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
  hintRef?: RefObject<HTMLButtonElement | null>;
  className?: string;
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

function Option({ track, query }: { track: Track; query: string }) {
  return (
    <div className="flex items-center gap-3">
      {track.cover ? (
        <img src={track.cover} alt="" className="size-9 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <span className="size-9 shrink-0 rounded-lg bg-gradient-accent" aria-hidden />
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

/** The guess field with suggestions, mic, hint chips and the skip / give-up row. */
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
}: GuessBoxProps) {
  const reduce = useReducedMotion();
  const round = currentRound(state);
  const allowed = canGuess(state);
  const live = state.status === 'playing' && round?.status === 'playing';
  const skip = useMemo(() => skipLabel(state), [state]);
  if (!round) return null;

  return (
    <motion.div
      key={shakeKey}
      className={cn('flex flex-col gap-3', className)}
      animate={shakeKey > 0 && !reduce ? { x: [0, -10, 9, -7, 5, -2, 0] } : { x: 0 }}
      transition={{ duration: 0.42, ease: 'easeInOut' }}
      data-testid="guess-box"
    >
      <div className="flex items-start gap-2">
        <Combobox<Track>
          className="min-w-0 flex-1"
          value={query}
          onChange={onQueryChange}
          options={options}
          loading={loading}
          getKey={(t) => String(t.id)}
          getLabel={(t) => `${t.artist} - ${t.title}`}
          onSelect={(t) => onSubmit(`${t.artist} - ${t.title}`)}
          onSubmit={onSubmit}
          renderOption={(t, ctx) => <Option track={t} query={ctx.query} />}
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
            size={52}
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

      <HintChips ref={hintRef} settings={state.settings} round={round} onHint={onHint} disabled={!live || !allowed} />

      <div className="flex items-center gap-2">
        {state.settings.allowSkip && (
          <Button variant="secondary" size="md" leadingIcon={<SkipForward />} onClick={onSkip} disabled={!live} className="flex-1 sm:flex-none">
            {skip}
          </Button>
        )}
        <Button variant="ghost" size="md" leadingIcon={<Flag />} onClick={onGiveUp} disabled={!live} className="text-muted">
          Give up
        </Button>
      </div>
    </motion.div>
  );
}
