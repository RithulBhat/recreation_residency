import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceRecognitionResult } from '@/types/voice';
import { cleanTranscript } from './cleanup';
import { createRecognizer, type RecognizerOptions } from './recognizer';

export interface UseVoiceGuessOptions extends RecognizerOptions {
  /** Called with the cleaned transcript when the engine finalises an utterance. */
  onFinal?: (text: string) => void;
  /** Called with each raw partial, if you want to mirror it somewhere else. */
  onInterim?: (text: string) => void;
  /** Sample the microphone for a VU meter. Default true. */
  meter?: boolean;
  /** Override the transcript cleaner. Default `cleanTranscript`. */
  clean?: (t: string) => string;
}

export interface UseVoiceGuess {
  supported: boolean;
  listening: boolean;
  /** Last cleaned final transcript. */
  transcript: string;
  /** Live partial straight from the engine (uncleaned, so the caption stays honest). */
  interim: string;
  /** 0..1 mic level, 0 when not listening. */
  level: number;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  reset: () => void;
}

/** Ignore level jitter smaller than this to keep re-renders down. */
const LEVEL_EPSILON = 0.02;

/**
 * Push-to-talk voice guessing.
 *
 * `start()` runs one utterance: partials land in `interim`, and the final
 * transcript is cleaned and handed to `onFinal`. Safe to call on Firefox —
 * `supported` is false and `start()` just reports a friendly error.
 */
export function useVoiceGuess(options: UseVoiceGuessOptions = {}): UseVoiceGuess {
  const { lang, interim: wantInterim = true, maxAlternatives, meter = true } = options;

  const recognizer = useMemo(
    () => createRecognizer({ lang, interim: wantInterim, maxAlternatives }),
    [lang, wantInterim, maxAlternatives],
  );

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Keep callbacks in refs so an in-flight session always sees the latest ones.
  const onFinalRef = useRef(options.onFinal);
  const onInterimRef = useRef(options.onInterim);
  const cleanRef = useRef(options.clean ?? cleanTranscript);
  useEffect(() => {
    onFinalRef.current = options.onFinal;
    onInterimRef.current = options.onInterim;
    cleanRef.current = options.clean ?? cleanTranscript;
  }, [options.onFinal, options.onInterim, options.clean]);

  const lastLevel = useRef(0);
  const pushLevel = useCallback((next: number) => {
    if (next !== 0 && Math.abs(next - lastLevel.current) < LEVEL_EPSILON) return;
    lastLevel.current = next;
    setLevel(next);
  }, []);

  const start = useCallback(() => {
    if (recognizer.isListening()) return;
    setError(null);
    setInterim('');
    pushLevel(0);
    setListening(true);

    recognizer.start({
      onResult: (r: VoiceRecognitionResult) => {
        if (!r.isFinal) {
          const partial = r.transcript.trim();
          setInterim(partial);
          onInterimRef.current?.(partial);
          return;
        }
        setInterim('');
        const cleaned = cleanRef.current(r.transcript);
        setTranscript(cleaned);
        if (cleaned.length > 0) onFinalRef.current?.(cleaned);
      },
      onEnd: () => {
        setListening(false);
        setInterim('');
        pushLevel(0);
      },
      onError: (message: string) => {
        setError(message);
      },
      onLevel: meter ? pushLevel : undefined,
    });
  }, [recognizer, meter, pushLevel]);

  const stop = useCallback(() => {
    recognizer.stop();
  }, [recognizer]);

  const toggle = useCallback(() => {
    if (recognizer.isListening()) recognizer.stop();
    else start();
  }, [recognizer, start]);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
    pushLevel(0);
  }, [pushLevel]);

  // Stop a live session when the recognizer is replaced or the screen unmounts.
  useEffect(
    () => () => {
      recognizer.stop();
    },
    [recognizer],
  );

  return {
    supported: recognizer.supported,
    listening,
    transcript,
    interim,
    level,
    error,
    start,
    stop,
    toggle,
    reset,
  };
}
