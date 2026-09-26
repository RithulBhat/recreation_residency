import type { ReactElement } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { HostPersonality } from '@/types/voice';

export interface HostBubbleProps {
  personality: HostPersonality;
  /** The line the host is saying. Empty string hides the bubble. */
  line: string;
  speaking: boolean;
  className?: string;
}

const AVATAR: Readonly<Record<HostPersonality, string>> = {
  hype: '🎤',
  chill: '🎧',
  savage: '😈',
  radio: '📻',
};

const HOST_NAME: Readonly<Record<HostPersonality, string>> = {
  hype: 'Hype host',
  chill: 'Chill host',
  savage: 'Savage host',
  radio: 'Radio host',
};

const BAR_DELAYS = [0, 0.12, 0.24];

/**
 * The host's talking head. The line is always rendered as text, so the
 * commentary still lands for muted players, screen readers, and Firefox
 * (where SpeechSynthesis exists but recognition doesn't).
 */
export function HostBubble({
  personality,
  line,
  speaking,
  className,
}: HostBubbleProps): ReactElement {
  const reduceMotion = useReducedMotion();
  const name = HOST_NAME[personality];

  return (
    <div className={`flex items-start gap-2 ${className ?? ''}`} aria-live="polite">
      <AnimatePresence initial={false}>
        {line ? (
          <motion.div
            key="host"
            className="flex items-start gap-2"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {/* Avatar */}
            <motion.div
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-lg"
              role="img"
              aria-label={name}
              animate={
                reduceMotion || !speaking ? { scale: 1 } : { scale: [1, 1.08, 1] }
              }
              transition={
                reduceMotion || !speaking
                  ? { duration: 0.2 }
                  : { duration: 0.75, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              <span aria-hidden>{AVATAR[personality]}</span>
              {speaking ? (
                <span
                  aria-hidden
                  className="absolute -inset-0.5 rounded-full border border-accent opacity-60"
                />
              ) : null}
            </motion.div>

            {/* Speech bubble */}
            <div className="relative max-w-[22rem] rounded-2xl rounded-tl-sm border border-border bg-surface px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[0.625rem] font-semibold tracking-wide text-muted uppercase">
                  {name}
                </span>
                {speaking ? (
                  <span aria-hidden className="flex items-end gap-0.5">
                    {BAR_DELAYS.map((delay) => (
                      <motion.span
                        key={delay}
                        className="w-0.5 rounded-full bg-accent"
                        style={{ height: 8 }}
                        animate={reduceMotion ? { scaleY: 1 } : { scaleY: [0.4, 1, 0.4] }}
                        transition={
                          reduceMotion
                            ? { duration: 0.2 }
                            : { duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay }
                        }
                      />
                    ))}
                  </span>
                ) : null}
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={line}
                  className="text-sm leading-snug text-fg"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 3 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  {line}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
