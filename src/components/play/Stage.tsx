import { motion, useReducedMotion } from 'motion/react';
import type { Round } from '@/types';
import { AlbumArt } from '@/components/AlbumArt';
import { Vinyl } from '@/components/Vinyl';
import { Visualizer } from '@/components/Visualizer';
import { Button, Kbd, cn } from '@/components/ui';
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
}

function statusLine(audio: GameAudio, live: boolean): React.ReactNode {
  if (audio.loading) return 'Dropping the needle…';
  if (!live) return 'Round over';
  if (audio.vinylState === 'playing') return 'Listening…';
  if (audio.vinylState === 'done')
    return (
      <>
        Replay <Kbd size="sm">Space</Kbd>
      </>
    );
  return (
    <>
      Tap the record or press <Kbd size="sm">Space</Kbd>
    </>
  );
}

/** The record, the (blurred) cover and the live visualizer, on an ambient card built from the cover. */
export function Stage({ round, blur, audio, clipLabel, live, onGiveUp }: StageProps) {
  const reduce = useReducedMotion();
  const { track } = round;
  const cover = track.coverBig || track.cover;
  const playing = audio.vinylState === 'playing';

  return (
    <section
      className="glass noise relative overflow-hidden rounded-4xl"
      aria-label="Now playing"
      data-testid="stage"
      data-vinyl={audio.vinylState}
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

      <div className="relative grid gap-5 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8 sm:p-7">
        <motion.div
          key={round.index}
          className="hidden sm:block"
          initial={reduce ? false : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <AlbumArt src={cover} alt={`${track.title} cover`} blur={blur} size={176} rounded="3xl" />
        </motion.div>

        <div className="flex flex-col items-center">
          <Vinyl
            state={audio.vinylState}
            progress={audio.progress}
            size="min(58vw, 236px)"
            clipLabel={clipLabel}
            coverUrl={track.cover || cover}
            blur={blur}
            onClick={audio.play}
            disabled={!live || !!audio.error}
          />
          <div className={cn('mt-5 h-12 w-full max-w-xs transition-opacity', playing ? 'opacity-100' : 'opacity-70')}>
            <Visualizer analyser={audio.analyser} active={playing} variant="bars" bars={40} idleAmplitude={0.5} />
          </div>
          <p className="mt-2 min-h-5 font-mono text-[11px] uppercase tracking-widest text-muted" aria-live="polite">
            {audio.error ? <span className="text-danger normal-case tracking-normal">{audio.error}</span> : statusLine(audio, live)}
          </p>
          {audio.error && live && (
            <Button variant="danger" size="sm" className="mt-2" onClick={onGiveUp}>
              Give up &amp; next
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
