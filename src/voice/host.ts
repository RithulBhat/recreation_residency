import type { HostEvent, HostPersonality, VoiceHost } from '@/types/voice';
import { pickLine, RECENT_MEMORY, type HostEventKind } from './phrases';

/** Per-personality delivery. Rate/pitch are SpeechSynthesisUtterance units. */
export const HOST_TUNING: Readonly<Record<HostPersonality, { rate: number; pitch: number }>> = {
  hype: { rate: 1.15, pitch: 1.2 },
  chill: { rate: 0.9, pitch: 0.9 },
  savage: { rate: 1.05, pitch: 1.0 },
  radio: { rate: 1.0, pitch: 0.8 },
};

/** Names that sound like a person rather than a 1998 speech card, best first. */
export const PREFERRED_VOICE_NAMES: readonly string[] = [
  'Samantha',
  'Daniel',
  'Karen',
  'Google US English',
  'Microsoft Aria',
  'Microsoft Guy',
  'Google UK English Female',
  'Google UK English Male',
  'Moira',
  'Tessa',
  'Alex',
];

/** Events urgent enough to cut off whatever chatter is still queued. */
const INTERRUPTING: ReadonlySet<HostEventKind> = new Set<HostEventKind>(['roundStart', 'reveal']);

/** Keep the queue short — stale commentary is worse than no commentary. */
export const MAX_PENDING = 2;

export interface VoiceHostOptions {
  personality?: HostPersonality;
  /** Hosts start silent; the settings store turns them on. */
  enabled?: boolean;
  voiceURI?: string | null;
}

/**
 * The `VoiceHost` contract plus the observable bits React needs (voice list
 * arrives async, speaking state drives the bubble animation).
 */
export interface VoiceHostController extends VoiceHost {
  isSpeaking(): boolean;
  /** The last line handed to the synth — render it so muted players still read it. */
  currentLine(): string | null;
  /**
   * iOS/Safari only allows `speak()` inside a user gesture. Call this from the
   * click handler that enables the host; it's a no-op elsewhere.
   */
  prime(): void;
  onVoicesChanged(cb: (voices: SpeechSynthesisVoice[]) => void): () => void;
  onSpeakingChanged(cb: (speaking: boolean) => void): () => void;
  onLine(cb: (line: string) => void): () => void;
  dispose(): void;
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  if (!('speechSynthesis' in window)) return null;
  return window.speechSynthesis;
}

function getUtteranceCtor(): typeof SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined') return null;
  const ctor = window.SpeechSynthesisUtterance;
  return typeof ctor === 'function' ? ctor : null;
}

/** Only Apple's WebKit needs the silent-utterance unlock. */
function needsGestureUnlock(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Safari/.test(ua) && !/Chrome|Chromium|Android|CriOS|FxiOS|Edg/.test(ua);
}

/** Score the available voices and return the nicest English one. */
export function pickDefaultVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  if (english.length === 0) return null;

  const score = (v: SpeechSynthesisVoice): number => {
    let s = 0;
    const name = v.name.toLowerCase();
    const idx = PREFERRED_VOICE_NAMES.findIndex((n) => name.includes(n.toLowerCase()));
    if (idx !== -1) s += (PREFERRED_VOICE_NAMES.length - idx) * 100;
    if (v.localService) s += 40;
    if (/^google /i.test(v.name) || /^microsoft /i.test(v.name)) s += 20;
    if (v.default) s += 10;
    if (/^en[-_]us/i.test(v.lang)) s += 8;
    else if (/^en[-_]gb/i.test(v.lang)) s += 4;
    if (/compact|eloquence|novelty|whisper|bells|bubbles|organ|zarvox|trinoids/i.test(v.name)) s -= 60;
    return s;
  };

  let best = english[0];
  let bestScore = score(best);
  for (const v of english.slice(1)) {
    const s = score(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

/**
 * A game-show host driven by SpeechSynthesis.
 *
 * Behaviour worth knowing:
 * - silent whenever `enabled` is false — `announce`/`say` do nothing at all.
 * - when speech is unsupported (Firefox) but the host is enabled, lines are still
 *   picked and published through `onLine` so the UI can show them as text.
 * - at most `MAX_PENDING` lines queue up; the oldest is dropped, and a fresh
 *   `roundStart`/`reveal` cancels whatever is still talking.
 */
export function createVoiceHost(opts: VoiceHostOptions = {}): VoiceHostController {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  let enabled = opts.enabled ?? false;
  let personality: HostPersonality = opts.personality ?? 'hype';
  let voiceURI: string | null = opts.voiceURI ?? null;

  let voices: SpeechSynthesisVoice[] = [];
  let pending: string[] = [];
  let current: SpeechSynthesisUtterance | null = null;
  let speaking = false;
  let line: string | null = null;
  let primed = false;
  let disposed = false;

  const recentByKind = new Map<HostEventKind, string[]>();
  const voiceListeners = new Set<(v: SpeechSynthesisVoice[]) => void>();
  const speakingListeners = new Set<(s: boolean) => void>();
  const lineListeners = new Set<(l: string) => void>();

  function emitVoices(): void {
    for (const cb of voiceListeners) cb(voices);
  }
  function setSpeaking(next: boolean): void {
    if (speaking === next) return;
    speaking = next;
    for (const cb of speakingListeners) cb(next);
  }
  function emitLine(next: string): void {
    line = next;
    for (const cb of lineListeners) cb(next);
  }

  function refreshVoices(): void {
    const synth = getSynth();
    if (!synth) return;
    let list: SpeechSynthesisVoice[] = [];
    try {
      list = synth.getVoices();
    } catch {
      return;
    }
    if (!Array.isArray(list) || list.length === 0) return;
    voices = list;
    emitVoices();
  }

  const onVoicesChangedEvent = (): void => {
    if (disposed) return;
    refreshVoices();
  };

  if (supported) {
    const synth = getSynth();
    refreshVoices();
    // Chrome/Safari populate the list asynchronously after the first call.
    synth?.addEventListener?.('voiceschanged', onVoicesChangedEvent);
  }

  function resolveVoice(): SpeechSynthesisVoice | null {
    if (voices.length === 0) return null;
    if (voiceURI !== null) {
      const exact = voices.find((v) => v.voiceURI === voiceURI) ?? voices.find((v) => v.name === voiceURI);
      if (exact) return exact;
    }
    return pickDefaultVoice(voices);
  }

  function finishUtterance(u: SpeechSynthesisUtterance): void {
    if (current !== u) return;
    current = null;
    setSpeaking(false);
    flush();
  }

  function flush(): void {
    if (!enabled || disposed || current !== null) return;
    const synth = getSynth();
    const Utterance = getUtteranceCtor();
    if (!synth || !Utterance) {
      pending = [];
      return;
    }
    const next = pending.shift();
    if (next === undefined) return;

    let u: SpeechSynthesisUtterance;
    try {
      u = new Utterance(next);
    } catch {
      return;
    }
    const tuning = HOST_TUNING[personality];
    u.rate = tuning.rate;
    u.pitch = tuning.pitch;
    u.volume = 1;
    const voice = resolveVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = 'en-US';
    }
    u.onend = () => finishUtterance(u);
    u.onerror = () => finishUtterance(u);

    current = u;
    setSpeaking(true);
    try {
      synth.speak(u);
    } catch {
      finishUtterance(u);
    }
  }

  function enqueue(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    emitLine(trimmed);
    if (!supported) return; // text-only mode: the bubble still shows the line
    pending.push(trimmed);
    // Drop the stalest line rather than letting commentary fall behind the game.
    while (pending.length > MAX_PENDING) pending.shift();
    flush();
  }

  function hardCancel(): void {
    pending = [];
    current = null;
    setSpeaking(false);
    const synth = getSynth();
    if (!synth) return;
    try {
      synth.cancel();
    } catch {
      /* some engines throw when nothing is speaking */
    }
  }

  function remember(kind: HostEventKind, text: string): void {
    const list = recentByKind.get(kind) ?? [];
    list.push(text);
    while (list.length > RECENT_MEMORY) list.shift();
    recentByKind.set(kind, list);
  }

  return {
    supported,

    setEnabled(on: boolean): void {
      if (enabled === on) return;
      enabled = on;
      if (!on) hardCancel();
    },
    isEnabled(): boolean {
      return enabled;
    },
    setPersonality(p: HostPersonality): void {
      personality = p;
    },
    setVoice(uri: string | null): void {
      voiceURI = uri;
    },
    listVoices(): SpeechSynthesisVoice[] {
      return voices.slice();
    },

    announce(e: HostEvent): void {
      if (!enabled || disposed) return;
      const recent = recentByKind.get(e.kind) ?? [];
      const text = pickLine(personality, e, recent);
      if (text.length === 0) return;
      remember(e.kind, text);
      if (INTERRUPTING.has(e.kind)) hardCancel();
      enqueue(text);
    },

    say(text: string): void {
      if (!enabled || disposed) return;
      enqueue(text);
    },

    cancel(): void {
      hardCancel();
    },

    isSpeaking(): boolean {
      return speaking;
    },
    currentLine(): string | null {
      return line;
    },
    prime(): void {
      if (primed || !supported || !needsGestureUnlock()) return;
      const synth = getSynth();
      const Utterance = getUtteranceCtor();
      if (!synth || !Utterance) return;
      try {
        const warmup = new Utterance(' ');
        warmup.volume = 0;
        synth.speak(warmup);
        synth.resume();
        primed = true;
      } catch {
        /* unlock is best-effort */
      }
    },

    onVoicesChanged(cb: (v: SpeechSynthesisVoice[]) => void): () => void {
      voiceListeners.add(cb);
      if (voices.length > 0) cb(voices);
      return () => voiceListeners.delete(cb);
    },
    onSpeakingChanged(cb: (s: boolean) => void): () => void {
      speakingListeners.add(cb);
      return () => speakingListeners.delete(cb);
    },
    onLine(cb: (l: string) => void): () => void {
      lineListeners.add(cb);
      return () => lineListeners.delete(cb);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      hardCancel();
      getSynth()?.removeEventListener?.('voiceschanged', onVoicesChangedEvent);
      voiceListeners.clear();
      speakingListeners.clear();
      lineListeners.clear();
    },
  };
}
