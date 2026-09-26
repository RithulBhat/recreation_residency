import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostEvent } from '@/types/voice';
import { HOST_TUNING, MAX_PENDING, createVoiceHost, pickDefaultVoice } from './host';
import { PHRASES } from './phrases';

class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onstart: (() => void) | null = null;

  constructor(text = '') {
    this.text = text;
  }
}

class FakeSynth extends EventTarget {
  spoken: FakeUtterance[] = [];
  cancelCalls = 0;
  resumeCalls = 0;
  voices: SpeechSynthesisVoice[] = [];

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }
  speak(u: SpeechSynthesisUtterance): void {
    this.spoken.push(u as unknown as FakeUtterance);
  }
  cancel(): void {
    this.cancelCalls += 1;
  }
  pause(): void {}
  resume(): void {
    this.resumeCalls += 1;
  }
}

function makeVoice(
  name: string,
  lang: string,
  localService: boolean,
  isDefault = false,
): SpeechSynthesisVoice {
  return {
    name,
    lang,
    localService,
    default: isDefault,
    voiceURI: `urn:${name}`,
  } as SpeechSynthesisVoice;
}

let synth: FakeSynth;

function install(withVoices: SpeechSynthesisVoice[] = []): void {
  synth = new FakeSynth();
  synth.voices = withVoices;
  Object.defineProperty(window, 'speechSynthesis', {
    value: synth,
    configurable: true,
    writable: true,
  });
  window.SpeechSynthesisUtterance = FakeUtterance as unknown as typeof SpeechSynthesisUtterance;
}

function uninstall(): void {
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
}

/** Pretend the current utterance finished so the queue advances. */
function finishCurrent(): void {
  const u = synth.spoken.at(-1);
  u?.onend?.();
}

beforeEach(() => {
  install();
});

afterEach(() => {
  uninstall();
});

describe('pickDefaultVoice', () => {
  it('prefers the good named voices', () => {
    const voices = [
      makeVoice('Albert', 'en-US', true),
      makeVoice('Google US English', 'en-US', false),
      makeVoice('Samantha', 'en-US', true),
    ];
    expect(pickDefaultVoice(voices)?.name).toBe('Samantha');
  });

  it('prefers local voices among equals', () => {
    const voices = [makeVoice('Aria Online', 'en-US', false), makeVoice('Aria Local', 'en-US', true)];
    expect(pickDefaultVoice(voices)?.name).toBe('Aria Local');
  });

  it('only considers en-* voices', () => {
    const voices = [makeVoice('Amelie', 'fr-CA', true), makeVoice('Nobody', 'en-AU', false)];
    expect(pickDefaultVoice(voices)?.name).toBe('Nobody');
  });

  it('returns null when there is no English voice', () => {
    expect(pickDefaultVoice([makeVoice('Amelie', 'fr-CA', true)])).toBeNull();
    expect(pickDefaultVoice([])).toBeNull();
  });

  it('avoids the novelty voices', () => {
    const voices = [makeVoice('Zarvox', 'en-US', true, true), makeVoice('Plain', 'en-US', true)];
    expect(pickDefaultVoice(voices)?.name).toBe('Plain');
  });
});

describe('createVoiceHost support', () => {
  it('is supported when speechSynthesis exists', () => {
    expect(createVoiceHost().supported).toBe(true);
  });

  it('is unsupported when it does not', () => {
    uninstall();
    expect(createVoiceHost().supported).toBe(false);
    install();
  });

  it('still publishes lines as text when unsupported (so the bubble works)', () => {
    uninstall();
    const host = createVoiceHost({ enabled: true });
    const seen: string[] = [];
    host.onLine((l) => seen.push(l));
    host.announce({ kind: 'skip' });
    expect(seen).toHaveLength(1);
    expect(PHRASES.hype.skip).toContain(seen[0]);
    expect(host.currentLine()).toBe(seen[0]);
    install();
  });
});

describe('createVoiceHost enable gate', () => {
  it('is silent by default', () => {
    const host = createVoiceHost();
    host.announce({ kind: 'skip' });
    host.say('hello');
    expect(synth.spoken).toHaveLength(0);
    expect(host.isSpeaking()).toBe(false);
  });

  it('is silent again once disabled, and cancels what was queued', () => {
    const host = createVoiceHost({ enabled: true });
    host.say('one');
    expect(synth.spoken).toHaveLength(1);
    host.setEnabled(false);
    expect(synth.cancelCalls).toBe(1);
    host.say('two');
    host.announce({ kind: 'timeout' });
    expect(synth.spoken).toHaveLength(1);
  });

  it('reports its enabled state', () => {
    const host = createVoiceHost();
    expect(host.isEnabled()).toBe(false);
    host.setEnabled(true);
    expect(host.isEnabled()).toBe(true);
  });
});

describe('createVoiceHost speaking', () => {
  it('speaks an announced line with the personality tuning', () => {
    const host = createVoiceHost({ enabled: true, personality: 'chill' });
    host.announce({ kind: 'timeout' });
    expect(synth.spoken).toHaveLength(1);
    const u = synth.spoken[0];
    expect(PHRASES.chill.timeout).toContain(u.text);
    expect(u.rate).toBe(HOST_TUNING.chill.rate);
    expect(u.pitch).toBe(HOST_TUNING.chill.pitch);
    expect(host.isSpeaking()).toBe(true);
  });

  it('applies hype tuning', () => {
    const host = createVoiceHost({ enabled: true, personality: 'hype' });
    host.say('go');
    expect(synth.spoken[0].rate).toBe(1.15);
    expect(synth.spoken[0].pitch).toBe(1.2);
  });

  it('uses the selected voice', () => {
    const chosen = makeVoice('Daniel', 'en-GB', true);
    install([makeVoice('Samantha', 'en-US', true), chosen]);
    const host = createVoiceHost({ enabled: true, voiceURI: chosen.voiceURI });
    host.say('hi');
    expect(synth.spoken[0].voice?.name).toBe('Daniel');
    expect(synth.spoken[0].lang).toBe('en-GB');
  });

  it('falls back to the best default voice', () => {
    install([makeVoice('Zarvox', 'en-US', true), makeVoice('Samantha', 'en-US', true)]);
    const host = createVoiceHost({ enabled: true });
    host.say('hi');
    expect(synth.spoken[0].voice?.name).toBe('Samantha');
  });

  it('flips speaking back off when the utterance ends', () => {
    const host = createVoiceHost({ enabled: true });
    const states: boolean[] = [];
    host.onSpeakingChanged((s) => states.push(s));
    host.say('hi');
    expect(host.isSpeaking()).toBe(true);
    finishCurrent();
    expect(host.isSpeaking()).toBe(false);
    expect(states).toEqual([true, false]);
  });

  it('recovers when an utterance errors', () => {
    const host = createVoiceHost({ enabled: true });
    host.say('one');
    host.say('two');
    synth.spoken[0].onerror?.();
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1].text).toBe('two');
  });

  it('ignores empty text', () => {
    const host = createVoiceHost({ enabled: true });
    host.say('   ');
    expect(synth.spoken).toHaveLength(0);
  });
});

describe('createVoiceHost queue', () => {
  it(`keeps at most ${MAX_PENDING} pending lines and drops the stalest`, () => {
    const host = createVoiceHost({ enabled: true });
    host.say('A'); // speaks immediately
    host.say('B'); // pending
    host.say('C'); // pending
    host.say('D'); // pushes B out
    expect(synth.spoken.map((u) => u.text)).toEqual(['A']);

    finishCurrent();
    expect(synth.spoken.map((u) => u.text)).toEqual(['A', 'C']);
    finishCurrent();
    expect(synth.spoken.map((u) => u.text)).toEqual(['A', 'C', 'D']);
    finishCurrent();
    expect(synth.spoken.map((u) => u.text)).toEqual(['A', 'C', 'D']);
    expect(host.isSpeaking()).toBe(false);
  });

  it('cancel() empties the queue and stops the engine', () => {
    const host = createVoiceHost({ enabled: true });
    host.say('A');
    host.say('B');
    host.cancel();
    expect(synth.cancelCalls).toBe(1);
    expect(host.isSpeaking()).toBe(false);
    finishCurrent();
    expect(synth.spoken.map((u) => u.text)).toEqual(['A']);
  });

  it('a new roundStart cuts off older chatter', () => {
    const host = createVoiceHost({ enabled: true });
    host.say('old chatter one');
    host.say('old chatter two');
    const round: HostEvent = { kind: 'roundStart', round: 2, total: 5, clipLength: 0.1 };
    host.announce(round);
    expect(synth.cancelCalls).toBe(1);
    expect(synth.spoken).toHaveLength(2);
    expect(PHRASES.hype.roundStart.some((l) => l.includes('{round}') || l.length > 0)).toBe(true);
    expect(synth.spoken[1].text).not.toBe('old chatter one');
  });

  it('a reveal also interrupts', () => {
    const host = createVoiceHost({ enabled: true });
    host.say('chatter');
    host.announce({ kind: 'reveal', title: 'Africa', artist: 'Toto' });
    expect(synth.cancelCalls).toBe(1);
    expect(synth.spoken[1].text).toContain('Africa');
  });

  it('ordinary events do not interrupt', () => {
    const host = createVoiceHost({ enabled: true });
    host.say('chatter');
    host.announce({ kind: 'skip' });
    expect(synth.cancelCalls).toBe(0);
    expect(synth.spoken).toHaveLength(1);
  });
});

describe('createVoiceHost voices', () => {
  it('picks up voices that arrive asynchronously', () => {
    const host = createVoiceHost();
    expect(host.listVoices()).toEqual([]);
    const received: SpeechSynthesisVoice[][] = [];
    host.onVoicesChanged((v) => received.push(v));
    synth.voices = [makeVoice('Samantha', 'en-US', true)];
    synth.dispatchEvent(new Event('voiceschanged'));
    expect(host.listVoices().map((v) => v.name)).toEqual(['Samantha']);
    expect(received.at(-1)?.map((v) => v.name)).toEqual(['Samantha']);
  });

  it('reads voices already available at construction', () => {
    install([makeVoice('Daniel', 'en-GB', true)]);
    expect(createVoiceHost().listVoices().map((v) => v.name)).toEqual(['Daniel']);
  });
});

describe('createVoiceHost lines', () => {
  it('avoids repeating recent lines for the same event', () => {
    const host = createVoiceHost({ enabled: true, personality: 'radio' });
    const seen: string[] = [];
    host.onLine((l) => seen.push(l));
    for (let i = 0; i < 12; i += 1) {
      host.announce({ kind: 'skip' });
      finishCurrent();
    }
    for (let i = 3; i < seen.length; i += 1) {
      expect(seen.slice(i - 3, i)).not.toContain(seen[i]);
    }
  });

  it('speaks custom text verbatim', () => {
    const host = createVoiceHost({ enabled: true });
    host.announce({ kind: 'custom', text: 'Straight to the point.' });
    expect(synth.spoken[0].text).toBe('Straight to the point.');
  });

  it('dispose() cancels and detaches listeners', () => {
    const host = createVoiceHost({ enabled: true });
    let lines = 0;
    host.onLine(() => {
      lines += 1;
    });
    host.dispose();
    host.announce({ kind: 'skip' });
    expect(lines).toBe(0);
    expect(synth.cancelCalls).toBe(1);
  });
});
