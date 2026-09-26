import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostEvent, HostPersonality } from '@/types/voice';
import { createVoiceHost, type VoiceHostController } from './host';

export interface UseVoiceHostOptions {
  /** Controlled on/off — feed `GameSettings.voiceHost` here. */
  enabled?: boolean;
  defaultEnabled?: boolean;
  /** Controlled personality. */
  personality?: HostPersonality;
  defaultPersonality?: HostPersonality;
  /** Controlled `SpeechSynthesisVoice.voiceURI` (or a voice name). */
  voiceURI?: string | null;
  defaultVoiceURI?: string | null;
  onEnabledChange?: (on: boolean) => void;
  onPersonalityChange?: (p: HostPersonality) => void;
  onVoiceURIChange?: (uri: string | null) => void;
  /** Fires with every line the host publishes, spoken or text-only. */
  onLine?: (line: string) => void;
}

export interface UseVoiceHost {
  supported: boolean;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  personality: HostPersonality;
  setPersonality: (p: HostPersonality) => void;
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  setVoiceURI: (uri: string | null) => void;
  announce: (e: HostEvent) => void;
  say: (text: string) => void;
  cancel: () => void;
  speaking: boolean;
  /** Latest line — pass straight to `<HostBubble line={line} />`. */
  line: string;
}

/**
 * React wrapper over `createVoiceHost`.
 *
 * Every knob is prop-driven: pass `enabled` / `personality` / `voiceURI` to have
 * the settings store own them (the `set*` functions then only call the matching
 * `on*Change`), or pass the `default*` variants to let the hook hold state.
 */
export function useVoiceHost(options: UseVoiceHostOptions = {}): UseVoiceHost {
  const hostRef = useRef<VoiceHostController | null>(null);
  if (hostRef.current === null) {
    hostRef.current = createVoiceHost({
      enabled: options.enabled ?? options.defaultEnabled ?? false,
      personality: options.personality ?? options.defaultPersonality ?? 'hype',
      voiceURI: options.voiceURI ?? options.defaultVoiceURI ?? null,
    });
  }
  const host = hostRef.current;

  const [enabledState, setEnabledState] = useState(options.defaultEnabled ?? false);
  const [personalityState, setPersonalityState] = useState<HostPersonality>(
    options.defaultPersonality ?? 'hype',
  );
  const [voiceURIState, setVoiceURIState] = useState<string | null>(options.defaultVoiceURI ?? null);

  const enabled = options.enabled ?? enabledState;
  const personality = options.personality ?? personalityState;
  const voiceURI = options.voiceURI ?? voiceURIState;

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => host.listVoices());
  const [speaking, setSpeaking] = useState(false);
  const [line, setLine] = useState<string>(() => host.currentLine() ?? '');

  const onLineRef = useRef(options.onLine);
  useEffect(() => {
    onLineRef.current = options.onLine;
  }, [options.onLine]);

  useEffect(() => {
    const offVoices = host.onVoicesChanged((next) => setVoices(next.slice()));
    const offSpeaking = host.onSpeakingChanged(setSpeaking);
    const offLine = host.onLine((next) => {
      setLine(next);
      onLineRef.current?.(next);
    });
    return () => {
      offVoices();
      offSpeaking();
      offLine();
    };
  }, [host]);

  useEffect(() => {
    host.setEnabled(enabled);
  }, [host, enabled]);
  useEffect(() => {
    host.setPersonality(personality);
  }, [host, personality]);
  useEffect(() => {
    host.setVoice(voiceURI);
  }, [host, voiceURI]);

  // Not `dispose()`: the controller lives in a ref, so React StrictMode's mount → cleanup → mount
  // would leave it permanently disposed (announce() becomes a no-op). Cancelling speech is enough.
  useEffect(() => () => host.cancel(), [host]);

  const controlled = options.enabled !== undefined;
  const onEnabledChange = options.onEnabledChange;
  const setEnabled = useCallback(
    (on: boolean) => {
      // Must happen inside the click handler: iOS only unlocks speech on a gesture.
      if (on) host.prime();
      if (!controlled) setEnabledState(on);
      onEnabledChange?.(on);
    },
    [host, controlled, onEnabledChange],
  );

  const personalityControlled = options.personality !== undefined;
  const onPersonalityChange = options.onPersonalityChange;
  const setPersonality = useCallback(
    (p: HostPersonality) => {
      if (!personalityControlled) setPersonalityState(p);
      onPersonalityChange?.(p);
    },
    [personalityControlled, onPersonalityChange],
  );

  const voiceControlled = options.voiceURI !== undefined;
  const onVoiceURIChange = options.onVoiceURIChange;
  const setVoiceURI = useCallback(
    (uri: string | null) => {
      if (!voiceControlled) setVoiceURIState(uri);
      onVoiceURIChange?.(uri);
    },
    [voiceControlled, onVoiceURIChange],
  );

  const announce = useCallback((e: HostEvent) => host.announce(e), [host]);
  const say = useCallback((text: string) => host.say(text), [host]);
  const cancel = useCallback(() => host.cancel(), [host]);

  return {
    supported: host.supported,
    enabled,
    setEnabled,
    personality,
    setPersonality,
    voices,
    voiceURI,
    setVoiceURI,
    announce,
    say,
    cancel,
    speaking,
    line,
  };
}
