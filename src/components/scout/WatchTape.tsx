import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ExternalLink, Film, Play, X } from 'lucide-react';
import { Button, IconButton, cn } from '@/components/ui';
import { clipEmbedUrl, type PlayerClip } from '@/data/nfl';
import { isEmbedBlocked, loadYouTubeApi, posterUrl, watchUrl, type YtPlayer } from './youtubeApi';

/** How the frame is being shown: through the API (so errors are audible) or as a plain iframe. */
type Mode = 'mounting' | 'api' | 'plain' | 'blocked';

export interface WatchTapeProps {
  /** The player's verified clip, or undefined when the dataset has none. */
  clip?: PlayerClip;
  /** Where to send the player instead when there is no clip (their ESPN page). */
  fallbackHref: string;
  fallbackLabel?: string;
  /** Bump to open the tape from a hotkey. */
  openSignal?: number;
  /** Mount with the frame already open (the results list only mounts a row on demand). */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Why the clip's own title and channel are always shown: 42 of the 215 verified clips live on a
 * FORMER team's channel and 57 titles name a pre-2025 season. The clip is a highlight reel, not a
 * source of truth about who the player plays for now — so it speaks for itself and never captions
 * the reveal.
 */
export const TAPE_CAVEAT = 'Clip title and channel exactly as published — it may be an older season or a former team.';

const FRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

/** The embed URL plus what the IFrame API needs to bind to an iframe we rendered ourselves. */
export function tapeEmbedUrl(videoId: string): string {
  const origin = typeof location === 'undefined' ? '' : `&origin=${encodeURIComponent(location.origin)}`;
  return `${clipEmbedUrl(videoId, { autoplay: true })}&enablejsapi=1${origin}`;
}

/**
 * The clip's own credit line — shown in every state, never used to state a current team — plus the
 * way out. MEASURED: 168 of the 215 verified clips answer `onReady` and then refuse to play in an
 * embed (error 150; every NFL-channel clip among them), so the YouTube link is not a nicety.
 */
function Credit({ clip }: { clip: PlayerClip }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="min-w-0 text-xs leading-snug text-muted">
        <span className="font-semibold text-fg">{clip.title}</span>
        <span className="mx-1.5">·</span>
        <span>{clip.channel}</span>
        <span className="mt-0.5 block opacity-80">{TAPE_CAVEAT}</span>
      </p>
      <Button
        size="sm"
        variant="ghost"
        href={watchUrl(clip.videoId)}
        target="_blank"
        rel="noreferrer"
        trailingIcon={<ExternalLink />}
        // The label collapses to the icon on a phone, so the accessible name is spelled out.
        aria-label="Watch this clip on YouTube"
        className="shrink-0 text-muted"
        data-testid="scout-tape-youtube"
      >
        <span className="hidden sm:inline">YouTube</span>
      </Button>
    </div>
  );
}

/**
 * "Watch the tape" — the reveal's victory lap.
 *
 * The iframe is only created after a click (or the T shortcut): no third-party frame loads unbidden,
 * and a results screen with ten rounds on it never opens ten YouTube connections.
 *
 * Some rights holders allow an embed to LOAD and then refuse to play it (error 150). The IFrame API
 * is bound to our own iframe purely to hear that, so a blocked clip becomes a poster and a link
 * rather than YouTube's grey error box.
 */
export function WatchTape({
  clip,
  fallbackHref,
  fallbackLabel = 'Open on ESPN',
  openSignal = 0,
  defaultOpen = false,
  className,
}: WatchTapeProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(defaultOpen);
  const [mode, setMode] = useState<Mode>('mounting');
  const firstSignal = useRef(openSignal);
  // A state-backed ref: AnimatePresence `mode="wait"` mounts the frame only AFTER the button has
  // finished exiting, so the player has to be created when the node appears, not when the click lands.
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const titleRef = useRef(clip?.title ?? 'Highlight tape');
  titleRef.current = clip?.title ?? 'Highlight tape';
  const videoId = clip?.videoId;

  useEffect(() => {
    if (openSignal !== firstSignal.current) setOpen(true);
  }, [openSignal]);

  // Opening (or switching clip) starts the frame over.
  useEffect(() => {
    if (open) setMode('mounting');
  }, [open, videoId]);

  // The API creates the player so that "this one will not play here" is actually audible; if it
  // cannot be reached at all we fall back to a plain iframe, which is no worse than having no API.
  useEffect(() => {
    if (!open || videoId === undefined) return;
    let cancelled = false;
    // The API REPLACES the node it is handed, so it is handed a node React has never seen: React
    // only ever removes the wrapper, and never trips over a child that is no longer there.
    let target: HTMLDivElement | null = null;
    void loadYouTubeApi().then((yt) => {
      if (cancelled) return;
      if (!yt) {
        // No API (offline, blocked, slow): a plain iframe is no worse than having no API at all.
        setMode('plain');
        return;
      }
      if (!wrapEl) return; // not mounted yet — this effect re-runs the moment it is
      target = document.createElement('div');
      target.className = 'size-full';
      wrapEl.appendChild(target);
      // Deliberately never `player.destroy()`: it rips the iframe out from under React, which then
      // throws on its own removal. React unmounts the wrapper and the player goes with it.
      const player: YtPlayer = new yt.Player(target, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            if (cancelled) return;
            // The embedding restriction (error 150) only surfaces once the player is asked to PLAY,
            // and the viewer just clicked, so the gesture is there to spend.
            try {
              player.playVideo();
            } catch {
              /* autoplay refused: the viewer presses play, and any block shows YouTube's own notice */
            }
            // Keep the frame identifiable (and titled) even though YouTube built it.
            const frame = player.getIframe();
            frame.setAttribute('data-testid', 'scout-tape-frame');
            frame.setAttribute('data-video-id', videoId);
            frame.setAttribute('data-tape-mode', 'api');
            frame.setAttribute('title', titleRef.current);
            frame.setAttribute('allow', FRAME_ALLOW);
            frame.setAttribute('allowfullscreen', '');
            frame.classList.add('absolute', 'inset-0', 'size-full');
            setMode('api');
          },
          onError: (e) => {
            if (!cancelled && isEmbedBlocked(e.data)) setMode('blocked');
          },
        },
      });
    });
    return () => {
      cancelled = true;
      // Tear down whatever the API left behind (StrictMode runs this effect twice in DEV).
      if (wrapEl) for (const frame of Array.from(wrapEl.querySelectorAll('iframe'))) frame.remove();
      if (target?.isConnected) target.remove();
      target = null;
    };
  }, [open, videoId, wrapEl]);

  if (!clip) {
    return (
      <Button
        size="sm"
        variant="secondary"
        href={fallbackHref}
        target="_blank"
        rel="noreferrer"
        trailingIcon={<ExternalLink />}
        className={className}
        data-testid="scout-tape-fallback"
      >
        {fallbackLabel}
      </Button>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="scout-tape" data-video-id={clip.videoId}>
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="frame"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="flex flex-col gap-2"
          >
            <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-border bg-black">
              {mode === 'blocked' ? (
                <div className="absolute inset-0" data-testid="scout-tape-blocked">
                  <img src={posterUrl(clip.videoId)} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
                  <div className="absolute inset-0 grid place-items-center bg-black/45 p-4 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <p className="max-w-xs text-sm font-semibold text-white">
                        The league keeps this one on YouTube only.
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        href={watchUrl(clip.videoId)}
                        target="_blank"
                        rel="noreferrer"
                        leadingIcon={<Play className="fill-current" />}
                        trailingIcon={<ExternalLink />}
                      >
                        Watch on YouTube
                      </Button>
                    </div>
                  </div>
                </div>
              ) : mode === 'plain' ? (
                <iframe
                  // youtube-nocookie, and nothing autoplays until the viewer asked for it.
                  src={tapeEmbedUrl(clip.videoId)}
                  title={clip.title}
                  className="absolute inset-0 size-full"
                  allow={FRAME_ALLOW}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  data-testid="scout-tape-frame"
                  data-video-id={clip.videoId}
                  data-tape-mode="plain"
                />
              ) : (
                // React owns this wrapper; the API replaces the inner node with its own iframe, so
                // unmounting removes the wrapper (and the player with it) without React losing a child.
                <div ref={setWrapEl} className="absolute inset-0">
                  {mode === 'mounting' && (
                    <div className="absolute inset-0 grid place-items-center bg-black">
                      <span className="size-6 animate-spin rounded-full border-2 border-white/30 border-t-white/90" aria-hidden />
                      <span className="sr-only">Loading the tape…</span>
                    </div>
                  )}
                </div>
              )}
              <IconButton
                aria-label="Close the tape"
                icon={<X />}
                size="sm"
                variant="secondary"
                onClick={() => setOpen(false)}
                className="absolute right-2 top-2 z-10"
              />
            </div>
            <Credit clip={clip} />
          </motion.div>
        ) : (
          <motion.div key="button" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <Button size="sm" variant="secondary" leadingIcon={<Film />} onClick={() => setOpen(true)} data-testid="scout-tape-button">
              Watch the tape
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
