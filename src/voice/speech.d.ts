/**
 * Minimal ambient declarations for the recognition half of the Web Speech API.
 *
 * The TS DOM lib ships `SpeechRecognitionEvent`, `SpeechRecognitionErrorEvent`,
 * `SpeechRecognitionResult*` and the whole synthesis side, but it does NOT ship
 * the `SpeechRecognition` interface itself, nor the `webkit`-prefixed
 * constructor Chrome/Safari actually expose. We declare only what src/voice uses
 * so no part of the voice module needs `any`.
 */

interface SpeechRecognition extends EventTarget {
  /** BCP-47 tag, e.g. 'en-US'. */
  lang: string;
  /** Keep recognising after the first final result. We always use `false`. */
  continuous: boolean;
  /** Emit low-confidence partials while the user is still talking. */
  interimResults: boolean;
  /** How many alternatives per result. We use 1. */
  maxAlternatives: number;

  start(): void;
  /** Finalise the current utterance (fires `result` then `end`). */
  stop(): void;
  /** Throw away the current utterance (fires `end`, maybe `error: aborted`). */
  abort(): void;

  onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
  readonly prototype: SpeechRecognition;
}

interface Window {
  /** Standards-track name (Chrome 133+, Edge). */
  SpeechRecognition?: SpeechRecognitionConstructor;
  /** Legacy prefixed name (Chrome, Safari, most Chromium forks). */
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
