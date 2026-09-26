import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostEvent, HostPersonality } from '@/types/voice';
import { createVoiceHost, isSpeechSynthesisSupported, type VoiceHostController } from './host';

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
 *
 * The controller is created inside an effect, so unmount can `dispose()` it and
 * a remount — React StrictMode's simulated one in DEV, or the screen being
 * revisited — gets a fresh controller instead of a permanently disposed one.
 */
export function useVoiceHost(options: UseVoiceHostOptions = {}): UseVoiceHost {
  const hostRef = useRef<VoiceHostController | null>(null);

  const [enabledState, setEnabledState] = useState(options.defaultEnabled ?? false);
  const [personalityState, setPersonalityState] = useState<HostPersonality>(
    options.defaultPersonality ?? 'hype',
  );
  const [voiceURIState, setVoiceURIState] = useState<string | null>(options.defaultVoiceURI ?? null);

  const enabled = options.enabled ?? enabledState;
  const personality = options.personality ?? personalityState;
  const voiceURI = options.voiceURI ?? voiceURIState;

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [line, setLine] = useState('');

  const onLineRef = useRef(options.onLine);
  useEffect(() => {
    onLineRef.current = options.onLine;
  }, [options.onLine]);

  // The knobs a freshly created controller should start with (read inside the mount effect only).
  const knobsRef = useRef({ enabled, personality, voiceURI });
  knobsRef.current = { enabled, personality, voiceURI };

  useEffect(() => {
    const host = createVoiceHost(knobsRef.current);
    hostRef.current = host;
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
      host.dispose();
      if (hostRef.current === host) hostRef.current = null;
    };
  }, []);

  // Declared after the mount effect so, within one commit, the controller exists before these run.
  useEffect(() => {
    hostRef.current?.setEnabled(enabled);
  }, [enabled]);
  useEffect(() => {
    hostRef.current?.setPersonality(personality);
  }, [personality]);
  useEffect(() => {
    hostRef.current?.setVoice(voiceURI);
  }, [voiceURI]);

  const controlled = options.enabled !== undefined;
  const onEnabledChange = options.onEnabledChange;
  const setEnabled = useCallback(
    (on: boolean) => {
      // Must happen inside the click handler: iOS only unlocks speech on a gesture.
      if (on) hostRef.current?.prime();
      if (!controlled) setEnabledState(on);
      onEnabledChange?.(on);
    },
    [controlled, onEnabledChange],
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

  const announce = useCallback((e: HostEvent) => hostRef.current?.announce(e), []);
  const say = useCallback((text: string) => hostRef.current?.say(text), []);
  const cancel = useCallback(() => hostRef.current?.cancel(), []);

  return {
    supported: hostRef.current?.supported ?? isSpeechSynthesisSupported(),
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
