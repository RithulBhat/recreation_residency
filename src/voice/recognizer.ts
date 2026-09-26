import type { VoiceRecognitionResult, VoiceRecognizer } from '@/types/voice';

export interface RecognizerOptions {
  /** BCP-47 language tag. Default 'en-US'. */
  lang?: string;
  /** Emit `isFinal: false` partials while the player is still talking. Default true. */
  interim?: boolean;
  /** Alternatives to ask the engine for. Default 1. */
  maxAlternatives?: number;
}

export interface RecognizerHandlers {
  onResult: (r: VoiceRecognitionResult) => void;
  onEnd: () => void;
  onError: (message: string) => void;
  /** Provide to get a 0..1 RMS mic level (~30fps) for a VU meter. */
  onLevel?: (level: number) => void;
}

/** How long we wait for a browser `end` event after `stop()` before self-finishing. */
const END_FALLBACK_MS = 1500;
/** Mic meter sample period — ~30fps. */
const METER_INTERVAL_MS = 33;
/** RMS is tiny for speech; scale it into a usable 0..1 meter range. */
const METER_GAIN = 5;
/** Per-sample decay so the ring falls off smoothly instead of strobing. */
const METER_DECAY = 0.82;

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'not-allowed': 'Microphone permission denied',
  'service-not-allowed': 'Speech service blocked — check browser settings',
  'no-speech': "Didn't catch that",
  network: 'Speech service unavailable',
  'audio-capture': 'No microphone found',
  aborted: 'Listening stopped',
  'language-not-supported': 'That language is not supported',
  'phrases-not-supported': 'Speech hints are not supported here',
  'bad-grammar': 'Speech engine had a hiccup',
  unsupported: "Voice input isn't supported in this browser",
  'start-failed': "Couldn't start listening — try again",
};

/** Map a SpeechRecognition error code onto something a player can act on. */
export function friendlyRecognitionError(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Voice input failed';
}

function resolveConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/** Pull the best transcript + confidence out of a result event. */
function readResults(ev: SpeechRecognitionEvent): { text: string; confidence: number; isFinal: boolean } {
  let text = '';
  let confidence = 0;
  let isFinal = false;
  const from = typeof ev.resultIndex === 'number' ? ev.resultIndex : 0;
  for (let i = from; i < ev.results.length; i += 1) {
    const result = ev.results[i];
    if (!result || result.length === 0) continue;
    const alt = result[0];
    if (!alt) continue;
    text += alt.transcript;
    confidence = Math.max(confidence, typeof alt.confidence === 'number' ? alt.confidence : 0);
    if (result.isFinal) isFinal = true;
  }
  return { text, confidence, isFinal };
}

/**
 * A one-utterance-at-a-time wrapper around SpeechRecognition.
 *
 * Guarantees, because callers wire UI state to them:
 * - `start()` never throws synchronously (unsupported / already-listening / engine
 *   throw all surface through `onError` + `onEnd`).
 * - `onEnd` fires exactly once per `start()`.
 * - a final result auto-stops the session.
 */
export function createRecognizer(opts: RecognizerOptions = {}): VoiceRecognizer {
  const Ctor = resolveConstructor();
  const supported = Ctor !== undefined;

  let listening = false;
  /** Guards `onEnd` so it fires exactly once per session. */
  let finished = true;
  let rec: SpeechRecognition | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;

  // Session-scoped bookkeeping so we can suppress the bogus 'aborted' error that
  // Chrome fires when *we* stopped the session on purpose.
  let sawFinal = false;
  let stopRequested = false;
  let reportedError = false;

  // Mic meter resources.
  let meterStream: MediaStream | null = null;
  let meterCtx: AudioContext | null = null;
  let meterTimer: ReturnType<typeof setInterval> | null = null;
  let meterLevel = 0;
  let meterGeneration = 0;

  function teardownMeter(onLevel?: (level: number) => void): void {
    meterGeneration += 1;
    if (meterTimer !== null) {
      clearInterval(meterTimer);
      meterTimer = null;
    }
    if (meterStream) {
      for (const track of meterStream.getTracks()) track.stop();
      meterStream = null;
    }
    if (meterCtx) {
      const closing = meterCtx;
      meterCtx = null;
      void Promise.resolve(closing.close()).catch(() => undefined);
    }
    meterLevel = 0;
    onLevel?.(0);
  }

  async function startMeter(onLevel: (level: number) => void, generation: number): Promise<void> {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!media || typeof media.getUserMedia !== 'function') return;
    if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;

    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({ audio: true });
    } catch {
      // Recognition raises its own (better worded) permission error — stay quiet here.
      return;
    }
    // The session ended (or was restarted) while we were awaiting permission.
    if (generation !== meterGeneration || !listening) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    try {
      const ctx = new window.AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);

      meterStream = stream;
      meterCtx = ctx;
      meterTimer = setInterval(() => {
        if (generation !== meterGeneration) return;
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length);
        const raw = Math.min(1, rms * METER_GAIN);
        meterLevel = Math.max(raw, meterLevel * METER_DECAY);
        onLevel(Math.round(meterLevel * 1000) / 1000);
      }, METER_INTERVAL_MS);
    } catch {
      for (const track of stream.getTracks()) track.stop();
      meterStream = null;
      meterCtx = null;
    }
  }

  function detach(): void {
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.onnomatch = null;
    rec = null;
  }

  function finish(handlers: RecognizerHandlers): void {
    if (finished) return;
    finished = true;
    listening = false;
    if (endTimer !== null) {
      clearTimeout(endTimer);
      endTimer = null;
    }
    teardownMeter(handlers.onLevel);
    detach();
    handlers.onEnd();
  }

  function start(handlers: RecognizerHandlers): void {
    if (!supported || Ctor === undefined) {
      handlers.onError(friendlyRecognitionError('unsupported'));
      handlers.onEnd();
      return;
    }
    // Double-start guard: a second start() while listening is a no-op.
    if (listening) return;

    listening = true;
    finished = false;
    sawFinal = false;
    stopRequested = false;
    reportedError = false;

    let instance: SpeechRecognition;
    try {
      instance = new Ctor();
    } catch {
      handlers.onError(friendlyRecognitionError('start-failed'));
      listening = false;
      finished = true;
      handlers.onEnd();
      return;
    }
    rec = instance;

    instance.lang = opts.lang ?? 'en-US';
    instance.continuous = false;
    instance.interimResults = opts.interim ?? true;
    instance.maxAlternatives = opts.maxAlternatives ?? 1;

    instance.onresult = (ev: SpeechRecognitionEvent) => {
      const { text, confidence, isFinal } = readResults(ev);
      if (text.length === 0 && !isFinal) return;
      handlers.onResult({ transcript: text, isFinal, confidence });
      if (!isFinal) return;
      // Auto-stop: one utterance per start().
      sawFinal = true;
      stopRequested = true;
      try {
        instance.stop();
      } catch {
        finish(handlers);
        return;
      }
      armEndFallback(handlers);
    };

    instance.onnomatch = () => {
      if (reportedError) return;
      reportedError = true;
      handlers.onError(friendlyRecognitionError('no-speech'));
    };

    instance.onerror = (ev: SpeechRecognitionErrorEvent) => {
      const code = typeof ev.error === 'string' ? ev.error : 'unknown';
      // We asked it to stop (or already got the answer) — 'aborted' is expected noise.
      if (code === 'aborted' && (stopRequested || sawFinal)) return;
      if (reportedError) return;
      reportedError = true;
      handlers.onError(friendlyRecognitionError(code));
    };

    instance.onend = () => {
      finish(handlers);
    };

    if (handlers.onLevel) {
      meterGeneration += 1;
      void startMeter(handlers.onLevel, meterGeneration);
    }

    try {
      instance.start();
    } catch {
      // Chrome throws InvalidStateError if an engine session is still tearing down.
      if (!reportedError) {
        reportedError = true;
        handlers.onError(friendlyRecognitionError('start-failed'));
      }
      finish(handlers);
    }
  }

  function armEndFallback(handlers: RecognizerHandlers): void {
    if (endTimer !== null) clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      endTimer = null;
      finish(handlers);
    }, END_FALLBACK_MS);
  }

  // `stop()` has no handlers in scope, so remember the live ones.
  let live: RecognizerHandlers | null = null;

  return {
    supported,
    start(handlers: RecognizerHandlers): void {
      live = handlers;
      start(handlers);
    },
    stop(): void {
      if (!listening) return;
      stopRequested = true;
      const handlers = live;
      try {
        rec?.stop();
      } catch {
        if (handlers) finish(handlers);
        return;
      }
      if (handlers) armEndFallback(handlers);
    },
    isListening(): boolean {
      return listening;
    },
  };
}
