import type { Modifiers } from './game';

export interface ClipSpec {
  url: string;
  /** seconds into the source */
  offset: number;
  /** seconds to play (0.1–10, or up to 30 for full reveal) */
  duration: number;
  modifiers?: Modifiers;
}

export type AudioPlayState = 'idle' | 'loading' | 'playing' | 'stopped' | 'error';

export interface AudioStateEvent {
  state: AudioPlayState;
  /** 0..1 progress through the current clip while playing */
  progress: number;
  error?: string;
}

export interface AudioEngine {
  /** Resume the AudioContext on first user gesture (iOS/Chrome autoplay policy). Idempotent. */
  unlock(): Promise<void>;
  /** Fetch + decode a preview into the cache. Safe to call early (prefetch next round). */
  preload(url: string): Promise<void>;
  /** Play a clip. Resolves when the clip ends or is stopped. Never rejects on user stop. */
  playClip(spec: ClipSpec): Promise<void>;
  /** Play the full preview from an offset (used on reveal). */
  playFull(url: string, offset?: number): Promise<void>;
  stop(): void;
  isPlaying(): boolean;
  setVolume(v: number): void;
  getVolume(): number;
  /** Analyser for visualizers; null before unlock. */
  getAnalyser(): AnalyserNode | null;
  /** Duration in seconds of a decoded preview (usually ~30), or null if not loaded. */
  getDuration(url: string): number | null;
  onState(cb: (e: AudioStateEvent) => void): () => void;
  /** Free decoded buffers except the given urls. */
  evict(keep?: string[]): void;
}

export type SfxName =
  | 'click'
  | 'hover'
  | 'correct'
  | 'partial'
  | 'wrong'
  | 'skip'
  | 'tick'
  | 'buzz'
  | 'fanfare'
  | 'reveal'
  | 'whoosh'
  | 'countdown'
  | 'gameover'
  | 'streak'
  | 'needle';

export interface Sfx {
  play(name: SfxName): void;
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  setVolume(v: number): void;
}
