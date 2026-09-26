/**
 * The YouTube IFrame API, loaded lazily and only ever once.
 *
 * Why it is needed at all: a plain `<iframe>` embed of a video whose owner restricts playback to
 * their own site renders YouTube's grey "Video unavailable — blocked from display on this website"
 * box, and nothing in the DOM tells the page it happened (the frame is cross-origin). Letting the
 * API CREATE the player surfaces that as `onError` 101/150, which is what lets the reveal swap in a
 * poster and a "watch it on YouTube" link instead of a dead frame. (Binding the API to an iframe
 * that already rendered is too late — the error has been and gone by then.)
 *
 * MEASURED: a sizeable share of the 215 verified clips answer `onReady` happily and then fail with
 * 150 the moment they are asked to play — `onReady` alone does not prove a clip is embeddable.
 *
 * The script is only fetched after the viewer asks for a clip, so no third-party code loads unbidden.
 */

/** Playback failed: 2 = bad id, 5 = HTML5 error, 100 = gone, 101/150 = embedding disabled. */
export type YtErrorCode = 2 | 5 | 100 | 101 | 150 | number;

export interface YtPlayer {
  destroy(): void;
  getIframe(): HTMLIFrameElement;
  playVideo(): void;
}

export interface YtPlayerOptions {
  videoId?: string;
  /** `https://www.youtube-nocookie.com` keeps the privacy-friendly origin. */
  host?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YtPlayer }) => void;
    onError?: (e: { data: YtErrorCode }) => void;
  };
}

export interface YtNamespace {
  Player: new (el: HTMLElement | string, options: YtPlayerOptions) => YtPlayer;
}

interface YtWindow {
  YT?: YtNamespace;
  onYouTubeIframeAPIReady?: () => void;
}

export const YT_API_SRC = 'https://www.youtube.com/iframe_api';
/** Give up waiting for the API rather than leaving the reveal in limbo. */
export const YT_API_TIMEOUT_MS = 6000;

let pending: Promise<YtNamespace | null> | undefined;

/** Resolves with the API, or `null` when it is blocked, offline or simply slow. */
export function loadYouTubeApi(): Promise<YtNamespace | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(null);
  const w = window as unknown as YtWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);

  pending ??= new Promise<YtNamespace | null>((resolve) => {
    let settled = false;
    const done = (value: YtNamespace | null) => {
      if (settled) return;
      settled = true;
      if (value === null) pending = undefined; // a failure is not cached: a retry may work
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), YT_API_TIMEOUT_MS);
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      previous?.();
      done(w.YT ?? null);
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${YT_API_SRC}"]`);
    if (existing) return;
    const script = document.createElement('script');
    script.src = YT_API_SRC;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    document.head.appendChild(script);
  });
  return pending;
}

/** Codes that mean "this clip will never play in an embed here". */
export function isEmbedBlocked(code: YtErrorCode): boolean {
  return code === 101 || code === 150 || code === 100 || code === 5 || code === 2;
}

/** The poster YouTube serves for a video — no API key, no cookies. */
export function posterUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
