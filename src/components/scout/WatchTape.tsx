import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ExternalLink, Film, Play, Tv, X } from 'lucide-react';
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
  /**
   * `hero` is the reveal's payoff: a full-width poster with a play button over it, sized so the
   * tape is the biggest thing on the card. `inline` is the small button a results row uses.
   */
  size?: 'hero' | 'inline';
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
  size = 'inline',
  className,
}: WatchTapeProps) {
  const hero = size === 'hero';
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
    if (!hero) {
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
    // MEASURED: most players have no verified clip at all, so this is the common state, not an
    // error. It gets the same frame, the same weight and a real destination.
    return (
      <div
        className={cn(
          'flex items-center gap-4 rounded-3xl border border-border bg-surface p-4 sm:p-5',
          className,
        )}
        data-testid="scout-tape-none"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-bg-elevated text-muted [&>svg]:size-6" aria-hidden>
          <Tv />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-fg">No official tape for this one</p>
          <p className="mt-0.5 text-xs leading-snug text-muted">
            The league only publishes reels for a slice of the league. The full file is on ESPN.
          </p>
        </div>
        <Button
          size="md"
          variant="secondary"
          href={fallbackHref}
          target="_blank"
          rel="noreferrer"
          trailingIcon={<ExternalLink />}
          className="shrink-0"
          data-testid="scout-tape-fallback"
        >
          <span className="max-sm:sr-only">{fallbackLabel}</span>
          <span className="sm:hidden" aria-hidden>ESPN</span>
        </Button>
      </div>
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
            <div
              className={cn(
                'relative aspect-video w-full overflow-hidden rounded-3xl border border-border bg-black',
                // The payoff, not a thumbnail: as wide as the reveal card allows, capped so the
                // score breakdown and Next still fit on a 900 px-tall laptop.
                // A definite HEIGHT (not a max) is what lets `aspect-video` derive the width, so the
                // tape is as big as the laptop's remaining height allows and never a thumbnail.
                hero && 'lg:h-[min(30vh,17rem)] lg:w-auto lg:max-w-full lg:self-start',
              )}
            >
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
            {hero ? (
              // The reward, and it looks like one: the clip's own poster, a play target across the
              // whole frame, and the title and channel credited underneath.
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  aria-label={`Watch the tape — ${clip.title}`}
                  className={cn(
                    'group relative block aspect-video w-full overflow-hidden rounded-3xl border border-border bg-black',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    'lg:h-[min(30vh,17rem)] lg:w-auto lg:max-w-full lg:self-start',
                  )}
                  data-testid="scout-tape-button"
                >
                  <img
                    src={posterUrl(clip.videoId)}
                    alt=""
                    className="absolute inset-0 size-full object-cover opacity-70 transition-opacity duration-300 group-hover:opacity-90"
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" aria-hidden />
                  <span className="absolute inset-0 grid place-items-center" aria-hidden>
                    <span className="grid size-16 place-items-center rounded-full bg-gradient-accent text-accent-fg shadow-glow transition-transform duration-300 group-hover:scale-110 sm:size-20 [&>svg]:size-7 sm:[&>svg]:size-9">
                      <Play className="translate-x-0.5 fill-current" />
                    </span>
                  </span>
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3 text-left sm:p-4" aria-hidden>
                    <Film className="size-4 shrink-0 text-accent" />
                    <span className="font-display text-sm font-bold text-white sm:text-base">Watch the tape</span>
                  </span>
                </button>
                <Credit clip={clip} />
              </div>
            ) : (
              <Button size="sm" variant="secondary" leadingIcon={<Film />} onClick={() => setOpen(true)} data-testid="scout-tape-button">
                Watch the tape
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
