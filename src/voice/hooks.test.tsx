import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceGuess } from './useVoiceGuess';
import { useVoiceHost } from './useVoiceHost';
import { PHRASES } from './phrases';

/* ---------------------------- SpeechRecognition ---------------------------- */

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null = null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null = null;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null = null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null = null;
  onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null = null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null = null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
  start(): void {}
  stop(): void {}
  abort(): void {}

  private get self(): SpeechRecognition {
    return this as unknown as SpeechRecognition;
  }
  emitResult(transcript: string, isFinal: boolean): void {
    const alt = { transcript, confidence: 0.9 };
    const result = { 0: alt, length: 1, isFinal, item: () => alt };
    const results = { 0: result, length: 1, item: () => result };
    this.onresult?.call(this.self, { resultIndex: 0, results } as unknown as SpeechRecognitionEvent);
  }
  emitError(code: string): void {
    this.onerror?.call(this.self, { error: code, message: '' } as unknown as SpeechRecognitionErrorEvent);
  }
  emitEnd(): void {
    this.onend?.call(this.self, new Event('end'));
  }
}

function engine(): FakeRecognition {
  const last = FakeRecognition.instances.at(-1);
  if (!last) throw new Error('no recognizer was constructed');
  return last;
}

/* ---------------------------- SpeechSynthesis ----------------------------- */

class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text = '') {
    this.text = text;
  }
}

class FakeSynth extends EventTarget {
  spoken: FakeUtterance[] = [];
  cancelCalls = 0;
  getVoices(): SpeechSynthesisVoice[] {
    return [];
  }
  speak(u: SpeechSynthesisUtterance): void {
    this.spoken.push(u as unknown as FakeUtterance);
  }
  cancel(): void {
    this.cancelCalls += 1;
  }
  pause(): void {}
  resume(): void {}
}

let synth: FakeSynth;

beforeEach(() => {
  FakeRecognition.instances = [];
  window.SpeechRecognition = FakeRecognition as unknown as SpeechRecognitionConstructor;
  synth = new FakeSynth();
  Object.defineProperty(window, 'speechSynthesis', {
    value: synth,
    configurable: true,
    writable: true,
  });
  window.SpeechSynthesisUtterance = FakeUtterance as unknown as typeof SpeechSynthesisUtterance;
});

afterEach(() => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
});

/* --------------------------------- tests ---------------------------------- */

describe('useVoiceGuess', () => {
  it('reports support', () => {
    const { result } = renderHook(() => useVoiceGuess({ meter: false }));
    expect(result.current.supported).toBe(true);
  });

  it('reports lack of support without throwing', () => {
    delete window.SpeechRecognition;
    const { result } = renderHook(() => useVoiceGuess({ meter: false }));
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.error).toBe("Voice input isn't supported in this browser");
    expect(result.current.listening).toBe(false);
  });

  it('tracks listening across a session', () => {
    const { result } = renderHook(() => useVoiceGuess({ meter: false }));
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    act(() => engine().emitEnd());
    expect(result.current.listening).toBe(false);
  });

  it('surfaces interim partials', () => {
    const { result } = renderHook(() => useVoiceGuess({ meter: false }));
    act(() => result.current.start());
    act(() => engine().emitResult('bohemian rap', false));
    expect(result.current.interim).toBe('bohemian rap');
    act(() => engine().emitEnd());
  });

  it('cleans the final transcript and calls onFinal with the cleaned and the raw text', () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useVoiceGuess({ meter: false, onFinal }));
    act(() => result.current.start());
    act(() => engine().emitResult("um, I think it's Africa by Toto ", true));
    expect(onFinal).toHaveBeenCalledWith('Africa - Toto', "um, I think it's Africa by Toto");
    expect(result.current.transcript).toBe('Africa - Toto');
    expect(result.current.interim).toBe('');
    act(() => engine().emitEnd());
  });

  it('exposes friendly errors', () => {
    const { result } = renderHook(() => useVoiceGuess({ meter: false }));
    act(() => result.current.start());
    act(() => engine().emitError('not-allowed'));
    expect(result.current.error).toBe('Microphone permission denied');
    act(() => engine().emitEnd());
  });

  it('toggle() starts then stops', () => {
    const { result } = renderHook(() => useVoiceGuess({ meter: false }));
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(true);
    act(() => result.current.toggle());
    act(() => engine().emitEnd());
    expect(result.current.listening).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it('reset() clears transcript and error', () => {
    const { result } = renderHook(() => useVoiceGuess({ meter: false }));
    act(() => result.current.start());
    act(() => engine().emitResult('africa', true));
    act(() => engine().emitEnd());
    act(() => result.current.reset());
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('does not start twice', () => {
    const { result } = renderHook(() => useVoiceGuess({ meter: false }));
    act(() => result.current.start());
    act(() => result.current.start());
    expect(FakeRecognition.instances).toHaveLength(1);
    act(() => engine().emitEnd());
  });
});

describe('useVoiceHost', () => {
  it('starts disabled and silent', () => {
    const { result } = renderHook(() => useVoiceHost());
    expect(result.current.supported).toBe(true);
    expect(result.current.enabled).toBe(false);
    act(() => result.current.announce({ kind: 'skip' }));
    expect(synth.spoken).toHaveLength(0);
    expect(result.current.line).toBe('');
  });

  it('holds its own state when uncontrolled', () => {
    const { result } = renderHook(() => useVoiceHost({ defaultEnabled: true }));
    expect(result.current.enabled).toBe(true);
    act(() => result.current.setPersonality('savage'));
    expect(result.current.personality).toBe('savage');
    act(() => result.current.announce({ kind: 'timeout' }));
    expect(PHRASES.savage.timeout).toContain(synth.spoken[0].text);
    expect(result.current.line).toBe(synth.spoken[0].text);
    expect(result.current.speaking).toBe(true);
  });

  it('defers to the settings store when controlled', () => {
    const onEnabledChange = vi.fn();
    const onPersonalityChange = vi.fn();
    const { result } = renderHook(() =>
      useVoiceHost({
        enabled: false,
        personality: 'radio',
        onEnabledChange,
        onPersonalityChange,
      }),
    );
    act(() => result.current.setEnabled(true));
    expect(onEnabledChange).toHaveBeenCalledWith(true);
    expect(result.current.enabled).toBe(false); // the store owns it
    act(() => result.current.setPersonality('chill'));
    expect(onPersonalityChange).toHaveBeenCalledWith('chill');
    expect(result.current.personality).toBe('radio');
  });

  it('announces, says, and cancels', () => {
    const { result } = renderHook(() => useVoiceHost({ defaultEnabled: true }));
    act(() => result.current.say('testing one two'));
    expect(synth.spoken[0].text).toBe('testing one two');
    act(() => result.current.cancel());
    expect(synth.cancelCalls).toBe(1);
    expect(result.current.speaking).toBe(false);
  });

  it('reports speaking false once the utterance ends', () => {
    const { result } = renderHook(() => useVoiceHost({ defaultEnabled: true }));
    act(() => result.current.say('hi'));
    expect(result.current.speaking).toBe(true);
    act(() => synth.spoken[0].onend?.());
    expect(result.current.speaking).toBe(false);
  });

  it('forwards lines through onLine', () => {
    const onLine = vi.fn();
    const { result } = renderHook(() => useVoiceHost({ defaultEnabled: true, onLine }));
    act(() => result.current.announce({ kind: 'reveal', title: 'Africa', artist: 'Toto' }));
    expect(onLine).toHaveBeenCalledTimes(1);
    expect(onLine.mock.calls[0][0]).toContain('Africa');
  });

  it('cancels on unmount', () => {
    const { result, unmount } = renderHook(() => useVoiceHost({ defaultEnabled: true }));
    act(() => result.current.say('hi'));
    unmount();
    expect(synth.cancelCalls).toBe(1);
  });

  it('is disposed on unmount: nothing is spoken or published afterwards', () => {
    const onLine = vi.fn();
    const { result, unmount } = renderHook(() => useVoiceHost({ defaultEnabled: true, onLine }));
    const { announce } = result.current;
    unmount();
    act(() => announce({ kind: 'skip' }));
    expect(synth.spoken).toHaveLength(0);
    expect(onLine).not.toHaveBeenCalled();
  });

  it('survives a StrictMode remount with a fresh controller (not a disposed one)', () => {
    const onLine = vi.fn();
    const { result } = renderHook(() => useVoiceHost({ defaultEnabled: true, onLine }), { wrapper: StrictMode });
    expect(result.current.supported).toBe(true);
    act(() => result.current.announce({ kind: 'reveal', title: 'Africa', artist: 'Toto' }));
    expect(onLine).toHaveBeenCalledTimes(1);
    expect(synth.spoken).toHaveLength(1);
    expect(result.current.line).toBe(synth.spoken[0].text);
    expect(result.current.speaking).toBe(true);
    act(() => result.current.setPersonality('savage'));
    act(() => result.current.announce({ kind: 'timeout' }));
    expect(PHRASES.savage.timeout).toContain(result.current.line);
  });
});
