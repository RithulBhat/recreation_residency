import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceRecognitionResult } from '@/types/voice';
import { createRecognizer, friendlyRecognitionError } from './recognizer';

type Handler<E> = ((this: SpeechRecognition, ev: E) => void) | null;

/** Minimal stand-in for the browser engine, with hooks to drive it from tests. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static throwOnStart = false;

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;

  startCalls = 0;
  stopCalls = 0;
  abortCalls = 0;

  onresult: Handler<SpeechRecognitionEvent> = null;
  onerror: Handler<SpeechRecognitionErrorEvent> = null;
  onend: Handler<Event> = null;
  onnomatch: Handler<SpeechRecognitionEvent> = null;
  onstart: Handler<Event> = null;
  onaudiostart: Handler<Event> = null;
  onaudioend: Handler<Event> = null;
  onspeechstart: Handler<Event> = null;
  onspeechend: Handler<Event> = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }

  start(): void {
    this.startCalls += 1;
    if (FakeRecognition.throwOnStart) throw new Error('InvalidStateError');
  }
  stop(): void {
    this.stopCalls += 1;
  }
  abort(): void {
    this.abortCalls += 1;
  }

  private get self(): SpeechRecognition {
    return this as unknown as SpeechRecognition;
  }

  emitResult(transcript: string, isFinal: boolean, confidence = 0.9): void {
    const alternative = { transcript, confidence };
    const result = { 0: alternative, length: 1, isFinal, item: () => alternative };
    const results = { 0: result, length: 1, item: () => result };
    const ev = { resultIndex: 0, results } as unknown as SpeechRecognitionEvent;
    this.onresult?.call(this.self, ev);
  }

  emitError(code: string): void {
    const ev = { error: code, message: '' } as unknown as SpeechRecognitionErrorEvent;
    this.onerror?.call(this.self, ev);
  }

  emitEnd(): void {
    this.onend?.call(this.self, new Event('end'));
  }
}

function install(): void {
  window.SpeechRecognition = FakeRecognition as unknown as SpeechRecognitionConstructor;
}
function uninstall(): void {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
}

function spyHandlers() {
  const results: VoiceRecognitionResult[] = [];
  const errors: string[] = [];
  const onEnd = vi.fn();
  return {
    results,
    errors,
    onEnd,
    handlers: {
      onResult: (r: VoiceRecognitionResult) => results.push(r),
      onError: (m: string) => errors.push(m),
      onEnd,
    },
  };
}

function latest(): FakeRecognition {
  const last = FakeRecognition.instances.at(-1);
  if (!last) throw new Error('no FakeRecognition was constructed');
  return last;
}

beforeEach(() => {
  FakeRecognition.instances = [];
  FakeRecognition.throwOnStart = false;
  install();
});

afterEach(() => {
  uninstall();
  vi.useRealTimers();
});

describe('friendlyRecognitionError', () => {
  it('maps the codes players actually hit', () => {
    expect(friendlyRecognitionError('not-allowed')).toBe('Microphone permission denied');
    expect(friendlyRecognitionError('no-speech')).toBe("Didn't catch that");
    expect(friendlyRecognitionError('network')).toBe('Speech service unavailable');
    expect(friendlyRecognitionError('audio-capture')).toBe('No microphone found');
    expect(friendlyRecognitionError('aborted')).toBe('Listening stopped');
  });

  it('has a fallback for unknown codes', () => {
    expect(friendlyRecognitionError('flux-capacitor')).toBe('Voice input failed');
  });
});

describe('createRecognizer support detection', () => {
  it('is supported when the standard constructor exists', () => {
    expect(createRecognizer().supported).toBe(true);
  });

  it('is supported via the webkit prefix', () => {
    delete window.SpeechRecognition;
    window.webkitSpeechRecognition = FakeRecognition as unknown as SpeechRecognitionConstructor;
    expect(createRecognizer().supported).toBe(true);
  });

  it('is unsupported when neither constructor exists (Firefox)', () => {
    uninstall();
    expect(createRecognizer().supported).toBe(false);
  });

  it('reports a friendly error and ends once when unsupported', () => {
    uninstall();
    const { errors, onEnd, handlers } = spyHandlers();
    const rec = createRecognizer();
    expect(() => rec.start(handlers)).not.toThrow();
    expect(errors).toEqual(["Voice input isn't supported in this browser"]);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(rec.isListening()).toBe(false);
  });
});

describe('createRecognizer session flow', () => {
  it('configures a single-utterance session with interim results', () => {
    const { handlers } = spyHandlers();
    createRecognizer({ lang: 'en-GB' }).start(handlers);
    const engine = latest();
    expect(engine.startCalls).toBe(1);
    expect(engine.lang).toBe('en-GB');
    expect(engine.continuous).toBe(false);
    expect(engine.interimResults).toBe(true);
    expect(engine.maxAlternatives).toBe(1);
  });

  it('can turn interim results off', () => {
    const { handlers } = spyHandlers();
    createRecognizer({ interim: false }).start(handlers);
    expect(latest().interimResults).toBe(false);
  });

  it('emits interim partials without ending', () => {
    const { results, onEnd, handlers } = spyHandlers();
    const rec = createRecognizer().start(handlers);
    expect(rec).toBeUndefined();
    latest().emitResult('bohemian rap', false, 0.4);
    expect(results).toEqual([{ transcript: 'bohemian rap', isFinal: false, confidence: 0.4 }]);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('auto-stops on a final result', () => {
    const { results, handlers } = spyHandlers();
    createRecognizer().start(handlers);
    const engine = latest();
    engine.emitResult('bohemian rhapsody', true, 0.95);
    expect(results.at(-1)).toEqual({
      transcript: 'bohemian rhapsody',
      isFinal: true,
      confidence: 0.95,
    });
    expect(engine.stopCalls).toBe(1);
  });

  it('calls onEnd exactly once, even if the engine ends twice', () => {
    const { onEnd, handlers } = spyHandlers();
    const rec = createRecognizer();
    rec.start(handlers);
    const engine = latest();
    engine.emitResult('africa', true);
    engine.emitEnd();
    engine.emitEnd();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(rec.isListening()).toBe(false);
  });

  it('guards against a double start', () => {
    const { handlers, onEnd } = spyHandlers();
    const rec = createRecognizer();
    rec.start(handlers);
    rec.start(handlers);
    rec.start(handlers);
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(latest().startCalls).toBe(1);
    expect(onEnd).not.toHaveBeenCalled();
    expect(rec.isListening()).toBe(true);
    latest().emitEnd();
  });

  it('can start again after the previous session ended', () => {
    const { handlers, onEnd } = spyHandlers();
    const rec = createRecognizer();
    rec.start(handlers);
    latest().emitEnd();
    rec.start(handlers);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(onEnd).toHaveBeenCalledTimes(1);
    latest().emitEnd();
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it('tracks isListening across the session', () => {
    const { handlers } = spyHandlers();
    const rec = createRecognizer();
    expect(rec.isListening()).toBe(false);
    rec.start(handlers);
    expect(rec.isListening()).toBe(true);
    latest().emitEnd();
    expect(rec.isListening()).toBe(false);
  });

  it('stop() is a no-op when not listening', () => {
    const rec = createRecognizer();
    expect(() => rec.stop()).not.toThrow();
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it('stop() asks the engine to finalise', () => {
    const { handlers, onEnd } = spyHandlers();
    const rec = createRecognizer();
    rec.start(handlers);
    rec.stop();
    expect(latest().stopCalls).toBe(1);
    expect(onEnd).not.toHaveBeenCalled();
    latest().emitEnd();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('self-ends if the engine never fires end after stop()', () => {
    vi.useFakeTimers();
    const { handlers, onEnd } = spyHandlers();
    const rec = createRecognizer();
    rec.start(handlers);
    rec.stop();
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(rec.isListening()).toBe(false);
  });
});

describe('createRecognizer error handling', () => {
  it('maps engine errors to friendly messages', () => {
    const { errors, onEnd, handlers } = spyHandlers();
    createRecognizer().start(handlers);
    const engine = latest();
    engine.emitError('not-allowed');
    engine.emitEnd();
    expect(errors).toEqual(['Microphone permission denied']);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('reports no-speech', () => {
    const { errors, handlers } = spyHandlers();
    createRecognizer().start(handlers);
    latest().emitError('no-speech');
    latest().emitEnd();
    expect(errors).toEqual(["Didn't catch that"]);
  });

  it('reports network trouble', () => {
    const { errors, handlers } = spyHandlers();
    createRecognizer().start(handlers);
    latest().emitError('network');
    latest().emitEnd();
    expect(errors).toEqual(['Speech service unavailable']);
  });

  it('only reports the first error of a session', () => {
    const { errors, handlers } = spyHandlers();
    createRecognizer().start(handlers);
    latest().emitError('network');
    latest().emitError('no-speech');
    latest().emitEnd();
    expect(errors).toEqual(['Speech service unavailable']);
  });

  it('swallows the "aborted" noise that follows our own stop()', () => {
    const { errors, onEnd, handlers } = spyHandlers();
    const rec = createRecognizer();
    rec.start(handlers);
    rec.stop();
    latest().emitError('aborted');
    latest().emitEnd();
    expect(errors).toEqual([]);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('swallows "aborted" after a final result too', () => {
    const { errors, handlers } = spyHandlers();
    createRecognizer().start(handlers);
    latest().emitResult('africa', true);
    latest().emitError('aborted');
    latest().emitEnd();
    expect(errors).toEqual([]);
  });

  it('still surfaces an unsolicited abort', () => {
    const { errors, handlers } = spyHandlers();
    createRecognizer().start(handlers);
    latest().emitError('aborted');
    latest().emitEnd();
    expect(errors).toEqual(['Listening stopped']);
  });

  it('treats nomatch as "didn\'t catch that"', () => {
    const { errors, handlers } = spyHandlers();
    createRecognizer().start(handlers);
    latest().onnomatch?.call(
      latest() as unknown as SpeechRecognition,
      {} as unknown as SpeechRecognitionEvent,
    );
    latest().emitEnd();
    expect(errors).toEqual(["Didn't catch that"]);
  });

  it('degrades gracefully when the mic meter is unavailable', () => {
    // jsdom has no navigator.mediaDevices / AudioContext — the session must still run.
    const levels: number[] = [];
    const { handlers, onEnd } = spyHandlers();
    const rec = createRecognizer();
    expect(() =>
      rec.start({ ...handlers, onLevel: (l: number) => levels.push(l) }),
    ).not.toThrow();
    latest().emitResult('africa', true);
    latest().emitEnd();
    expect(onEnd).toHaveBeenCalledTimes(1);
    // The meter is reset to zero on teardown so the UI ring collapses.
    expect(levels).toEqual([0]);
  });

  it('never throws when the engine throws on start()', () => {
    FakeRecognition.throwOnStart = true;
    const { errors, onEnd, handlers } = spyHandlers();
    const rec = createRecognizer();
    expect(() => rec.start(handlers)).not.toThrow();
    expect(errors).toEqual(["Couldn't start listening — try again"]);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(rec.isListening()).toBe(false);
  });
});
