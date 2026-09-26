import { useCallback, useRef, type ReactElement } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Mic, MicOff } from 'lucide-react';

export interface MicButtonProps {
  /** True while an utterance is being captured. */
  listening: boolean;
  /** 0..1 mic level — drives the pulsing ring. */
  level: number;
  /** Live partial transcript, rendered as a caption. */
  interim: string;
  /** False on browsers without SpeechRecognition (Firefox). */
  supported: boolean;
  /** Begin listening. Also used as "toggle" when `onRelease` is omitted. */
  onPress: () => void;
  /** Stop listening. Provide it to enable hold-to-talk. */
  onRelease?: () => void;
  /** Diameter in px. Default 72 (well above the 44px touch target floor). */
  size?: number;
  /** Friendly error from the recognizer, shown as a tooltip. */
  error?: string | null;
  className?: string;
  disabled?: boolean;
}

/** Held longer than this and the release stops listening; shorter is a tap-toggle. */
const HOLD_MS = 280;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Round push-to-talk mic button.
 *
 * Two interaction models, both live:
 * - **hold-to-talk** — press and hold, release to submit (needs `onRelease`).
 * - **tap-to-toggle** — a quick tap starts listening, the next tap stops it.
 *
 * Keyboard: Space/Enter behave exactly like pointer press/release.
 */
export function MicButton({
  listening,
  level,
  interim,
  supported,
  onPress,
  onRelease,
  size = 72,
  error = null,
  className,
  disabled = false,
}: MicButtonProps): ReactElement {
  const reduceMotion = useReducedMotion();
  const pressedAt = useRef<number | null>(null);
  const handledOnDown = useRef(false);
  const inactive = disabled || !supported;

  const stopNow = useCallback(() => {
    // Without onRelease the parent treats onPress as a toggle.
    if (onRelease) onRelease();
    else onPress();
  }, [onRelease, onPress]);

  const begin = useCallback(() => {
    if (inactive) return;
    if (listening) {
      // Second tap of a tap-toggle (or interrupting a hold) — stop right away.
      handledOnDown.current = true;
      pressedAt.current = null;
      stopNow();
      return;
    }
    handledOnDown.current = false;
    pressedAt.current = now();
    onPress();
  }, [inactive, listening, onPress, stopNow]);

  const end = useCallback(() => {
    if (handledOnDown.current) {
      handledOnDown.current = false;
      return;
    }
    const startedAt = pressedAt.current;
    pressedAt.current = null;
    if (startedAt === null) return;
    // A real hold releases; a quick tap leaves it listening until the next tap.
    if (now() - startedAt >= HOLD_MS) stopNow();
  }, [stopNow]);

  const clamped = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  const ringScale = listening ? 1 + clamped * 0.55 : 1;
  const label = !supported
    ? 'Voice guessing not supported in this browser'
    : listening
      ? 'Stop listening'
      : 'Guess by voice — hold to talk';

  return (
    <div className={`flex flex-col items-center gap-2 ${className ?? ''}`}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        {/* Level ring: CSS transform, cheap enough to drive at 30fps. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-accent/25"
          style={{
            transform: `scale(${reduceMotion ? 1 : ringScale})`,
            opacity: listening ? 0.35 + clamped * 0.5 : 0,
            transition: 'transform 80ms linear, opacity 120ms linear',
          }}
        />

        {/* Breathing halo while listening. */}
        <AnimatePresence>
          {listening && !reduceMotion ? (
            <motion.span
              key="halo"
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border border-accent"
              initial={{ scale: 1, opacity: 0.55 }}
              animate={{ scale: [1, 1.45], opacity: [0.55, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
            />
          ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          aria-label={label}
          aria-pressed={listening}
          aria-disabled={inactive}
          title={supported ? label : "This browser can't do voice input — type your guess instead"}
          disabled={inactive}
          className={[
            'relative z-10 flex touch-none select-none items-center justify-center rounded-full',
            'border border-border text-fg outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            listening ? 'bg-accent text-fg shadow-lg' : 'bg-surface',
            inactive ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          ].join(' ')}
          style={{ width: size, height: size, minWidth: 44, minHeight: 44 }}
          animate={
            reduceMotion || !listening
              ? { scale: 1 }
              : { scale: [1, 1.06, 1] }
          }
          transition={
            reduceMotion || !listening
              ? { duration: 0.15 }
              : { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
          }
          whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          onPointerDown={begin}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          onKeyDown={(e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            if (e.repeat) return;
            begin();
          }}
          onKeyUp={(e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            end();
          }}
        >
          {supported ? (
            <Mic size={Math.round(size * 0.42)} aria-hidden />
          ) : (
            <MicOff size={Math.round(size * 0.42)} aria-hidden />
          )}
        </motion.button>

        {/* Error tooltip. */}
        <AnimatePresence>
          {error ? (
            <motion.span
              key={error}
              role="status"
              className="absolute -bottom-2 left-1/2 z-20 w-max max-w-[16rem] -translate-x-1/2 translate-y-full rounded-xl border border-border bg-surface px-2.5 py-1 text-center text-xs text-danger shadow-lg"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {error}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Live partial transcript. */}
      <div className="min-h-[1.25rem] max-w-[18rem] text-center" aria-live="polite">
        <AnimatePresence mode="wait">
          {interim ? (
            <motion.p
              key="interim"
              className="line-clamp-2 text-xs text-muted italic"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 2 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {interim}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
