import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Square } from 'lucide-react';
import type { Round } from '@/types';
import { AUTOPLAY_BLOCKED, getSfx } from '@/audio';
import { AlbumArt } from '@/components/AlbumArt';
import { Vinyl } from '@/components/Vinyl';
import { Visualizer } from '@/components/Visualizer';
import { Button, Kbd, ProgressBar, cn } from '@/components/ui';
import { hasListened } from '@/game/selectors';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ClubStamp } from './ClubStamp';
import { Tonearm, type TonearmMode } from './Tonearm';
import { outcomeLabel, type ClubStampData, type OutcomeTone } from './outcome';
import type { GameAudio } from './useGameAudio';

export interface StageProps {
  round: Round;
  /** 0..1 cover blur (from `coverBlur`) */
  blur: number;
  audio: GameAudio;
  clipLabel: string;
  /** False once the round is over (the record still spins for the reveal). */
  live: boolean;
  onGiveUp: () => void;
  /** Landscape phones: a smaller record, no album art, tighter padding — the guess box sits beside it. */
  compact?: boolean;
  /** The 0.1 s Club stamp for a perfect round (null otherwise). */
  stamp?: ClubStampData | null;
  /** Desktop: the verdict pill sits under the record, inside the card. */
  feedback?: ReactNode;
}

const OUTCOME_TONE: Record<OutcomeTone, string> = { success: 'text-success', warn: 'text-warn', muted: 'text-muted' };

/** `fine`: a keyboard is likely, so the Space hint is worth showing. */
function statusLine(audio: GameAudio, live: boolean, round: Round, fine: boolean): ReactNode {
  if (audio.loading) return 'Dropping the needle…';
  if (audio.error) {
    // The record is the retry affordance: it re-fetches the preview (live) or replays the reveal.
    if (!live) return 'Tap the record to hear the song';
    return fine ? (
      <>
        Tap the record or press <Kbd size="sm">Space</Kbd> to retry
      </>
    ) : (
      'Tap the record to retry'
    );
  }
  if (!live) {
    const outcome = outcomeLabel(round);
    return outcome ? (
      <span className={cn('font-semibold', OUTCOME_TONE[outcome.tone])} data-testid="outcome">
        {outcome.clip ? (
          <>
            {outcome.text} · <span className="normal-case">{outcome.clip}</span>
          </>
        ) : (
          outcome.text
        )}
      </span>
    ) : (
      'Round over'
    );
  }
  if (audio.vinylState === 'playing') return 'Listening…';
  if (audio.vinylState === 'done') {
    return fine ? (
      <>
        Replay <Kbd size="sm">Space</Kbd>
      </>
    ) : (
      'Tap again to replay'
    );
  }
  return fine ? (
    <>
      Tap the record or press <Kbd size="sm">Space</Kbd>
    </>
  ) : (
    'Tap the record'
  );
}

/** Slim progress bar under the reveal — the whole strip is the stop button. */
function RevealProgress({ progress, onStop }: { progress: number; onStop: () => void }) {
  return (
    <button
      type="button"
      onClick={onStop}
      aria-label="Stop the song"
      data-testid="reveal-progress"
      className="group mt-2 flex w-full max-w-xs flex-col items-center gap-1 rounded-xl px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60"
    >
      <ProgressBar value={progress} size="xs" className="w-full" aria-hidden />
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted transition-colors group-hover:text-fg">
        <Square className="size-2.5 fill-current" aria-hidden />
        Tap to stop
      </span>
    </button>
  );
}

function needleClick(): void {
  getSfx().play('needle');
}

/** The record, the (blurred) cover and the live visualizer, on an ambient card built from the cover. */
export function Stage({ round, blur, audio, clipLabel, live, onGiveUp, compact = false, stamp = null, feedback }: StageProps) {
  const reduce = useReducedMotion();
  const fine = useMediaQuery('(pointer: fine)');
  const { track } = round;
  const cover = track.coverBig || track.cover;
  const playing = audio.vinylState === 'playing';
  const failed = audio.error !== null;
  // "Audio needs a tap" is the expected state after an auto-reveal outside a gesture — not worth red ink.
  const showError = failed && audio.error !== AUTOPLAY_BLOCKED;
  // The tonearm: on the groove while sound plays, hovering after a clip ends, parked otherwise.
  const tonearm: TonearmMode = playing ? 'down' : live && audio.vinylState === 'done' ? 'cue' : 'rest';

  return (
    <section
      className="glass noise relative overflow-hidden rounded-4xl"
      aria-label="Now playing"
      data-testid="stage"
      data-vinyl={audio.vinylState}
      data-tonearm={tonearm}
      data-error={failed ? '' : undefined}
      data-compact={compact ? '' : undefined}
    >
      {cover && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center transition-opacity duration-700"
          style={{
            backgroundImage: `url(${cover})`,
            filter: 'blur(48px) saturate(1.4)',
            transform: 'scale(1.3)',
            opacity: 0.18 + (1 - blur) * 0.3,
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_100%,transparent_40%,var(--sg-bg)_100%)] opacity-70" aria-hidden />

      <div className={cn('relative grid gap-5', compact ? 'p-3' : 'p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8 sm:p-7')}>
        {!compact && (
          <motion.div
            key={round.index}
            className="hidden sm:block"
            initial={reduce ? false : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <AlbumArt src={cover} alt={`${track.title} cover`} blur={blur} size={176} rounded="3xl" />
          </motion.div>
        )}

        <div className="flex flex-col items-center">
          <div data-coach="record" className="relative">
            <Vinyl
              state={audio.vinylState}
              progress={audio.progress}
              size={compact ? 'min(40vw, 50vh)' : 'min(62vw, 260px)'}
              clipLabel={clipLabel}
              coverUrl={track.cover || cover}
              blur={blur}
              // Live: play / replay (clears a failure and retries). Round over: only a failed reveal
              // makes the record tappable — it retries the full song, like the card's "Hear the song".
              onClick={live ? audio.play : audio.hear}
              disabled={!live && !failed}
              aria-label={failed ? (live ? `Retry clip (${clipLabel})` : 'Hear the song') : undefined}
              nudge={live && !hasListened(round)}
              overlay={
                <>
                  <Tonearm mode={tonearm} onContact={needleClick} />
                  {stamp && !live && <ClubStamp {...stamp} />}
                </>
              }
            />
          </div>
          <div className={cn('w-full max-w-xs transition-opacity', compact ? 'mt-3 h-7' : 'mt-5 h-12', playing ? 'opacity-100' : 'opacity-70')}>
            <Visualizer analyser={audio.analyser} active={playing} variant="bars" bars={compact ? 28 : 40} idleAmplitude={0.5} />
          </div>
          <p className="eyebrow-readable mt-2 min-h-5 text-center font-mono text-xs uppercase tracking-widest text-fg/70" aria-live="polite">
            {showError && <span className="block text-danger normal-case tracking-normal">{audio.error}</span>}
            {statusLine(audio, live, round, fine)}
          </p>
          {!live && playing && <RevealProgress progress={audio.progress} onStop={audio.stop} />}
          {failed && live && (
            <Button variant="danger" size="sm" className="mt-2" onClick={onGiveUp}>
              Give up &amp; next
            </Button>
          )}
          {feedback && <div className="mt-2 w-full text-center">{feedback}</div>}
        </div>
      </div>
    </section>
  );
}
