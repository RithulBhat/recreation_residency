export interface VoiceRecognitionResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export interface VoiceRecognizer {
  readonly supported: boolean;
  start(handlers: {
    onResult: (r: VoiceRecognitionResult) => void;
    onEnd: () => void;
    onError: (message: string) => void;
    onLevel?: (level: number) => void; // 0..1 mic level for a VU meter
  }): void;
  stop(): void;
  isListening(): boolean;
}

export type HostEvent =
  | { kind: 'gameStart'; mode: string; packName: string; clipLength: number }
  | { kind: 'roundStart'; round: number; total: number; clipLength: number; playerName?: string }
  | { kind: 'correct'; title: string; artist: string; tryIndex: number; clipLength: number; streak: number }
  | { kind: 'partial'; artist: string }
  | { kind: 'wrong'; tryIndex: number; triesLeft: number }
  | { kind: 'reveal'; title: string; artist: string }
  | { kind: 'skip' }
  | { kind: 'timeout' }
  | { kind: 'buzz'; playerName: string }
  | { kind: 'gameOver'; score: number; correct: number; total: number; winnerName?: string }
  | { kind: 'streak'; streak: number }
  | { kind: 'custom'; text: string };

export type HostPersonality = 'hype' | 'chill' | 'savage' | 'radio';

export interface VoiceHost {
  readonly supported: boolean;
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  setPersonality(p: HostPersonality): void;
  setVoice(voiceURI: string | null): void;
  listVoices(): SpeechSynthesisVoice[];
  /** Speak a line for an event (picks a random phrase for the personality). */
  announce(e: HostEvent): void;
  say(text: string): void;
  cancel(): void;
}
