import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ImageOff } from 'lucide-react';
import { Skeleton, cn } from '@/components/ui';
import type { ScoutFocus } from '@/scout/stages';
import { REVEAL_MS, silhouetteCurtain, visualDescription, visualStyle, type VisualMode, type VisualStyle } from './visuals';

export interface PhotoStageProps {
  mode: VisualMode;
  /** Headshot (player) or logo (team) — a CORS-enabled PNG on a.espncdn.com. */
  src: string;
  /** `stage.visual` for the current rung. */
  visual: number;
  /** Round over: ease to the clean photo. */
  revealed: boolean;
  /** Deterministic crop centre from the round's seed. */
  focus?: ScoutFocus;
  /** Fired once the bitmap is decoded (or failed) — the round clock waits for it. */
  onReady?: () => void;
  /** Alt text: the answer while hidden, so it is never read out early. */
  alt: string;
  className?: string;
}

/** The shared geometry both silhouette layers must agree on to the pixel. */
function cropStyle(style: VisualStyle): React.CSSProperties {
  return {
    objectFit: style.objectFit,
    objectPosition: style.objectPosition,
    transform: style.transform,
    transformOrigin: style.transformOrigin,
  };
}

/**
 * The square image stage: one `<img>` whose filter / transform IS the puzzle — except in silhouette
 * mode, which stacks TWO copies of the same photo and pulls a curtain across the top one.
 *
 * ## Why two layers
 * `scratchpad/scout1/SILHOUETTE-LADDER.md` measured the filter-only ladder and found rungs 0–2
 * indistinguishable: a transparent-background headshot has no CSS filter step between "pure black"
 * and "blurred colour". So the black shape is its own layer, masked away from the BOTTOM UP — the
 * chin arrives first, the hair (the strongest clue) stays black longest. The mask has to sit on a
 * wrapper rather than on the `<img>`: a mask is applied in the element's own box and only then
 * transformed, so masking the 1.8×-scaled image would put the curtain edge off-frame.
 *
 * The photo never sits directly on the page — it lives on an elevated panel, because a
 * `brightness(0)` silhouette needs a surface to be a shape against (and on the light themes that
 * surface is what makes the shape crisp). The rim light spreads outward from the alpha edge, so it
 * reads on every theme.
 *
 * Transitions run for ~450 ms; the global reduced-motion rule in `index.css` collapses them, and
 * the shimmer placeholder is dropped too.
 */
export function PhotoStage({ mode, src, visual, revealed, focus, onReady, alt, className }: PhotoStageProps) {
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const imgRef = useRef<HTMLImageElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  // A cached image can be complete before React attaches onLoad.
  useEffect(() => {
    setStatus('loading');
    const el = imgRef.current;
    if (el?.complete) setStatus(el.naturalWidth > 0 ? 'ready' : 'error');
  }, [src]);

  useEffect(() => {
    if (status !== 'loading') readyRef.current?.();
  }, [status]);

  const style = visualStyle({ mode, visual, revealed, focus });
  const duration = reduce ? 0 : REVEAL_MS;
  const curtain = mode === 'silhouette' ? silhouetteCurtain(visual, revealed) : null;
  const crop = cropStyle(style);
  const move = `filter ${duration}ms var(--ease-out-expo), transform ${duration}ms var(--ease-out-expo), opacity ${duration}ms linear`;

  return (
    <div
      className={cn('glass relative isolate aspect-square w-full overflow-hidden rounded-4xl', className)}
      // A `brightness(0)` silhouette needs a surface to be a shape AGAINST. On the light themes the
      // page already provides one; on midnight and vinyl a plain elevated panel is nearly as black as
      // the shape, so the panel is mixed toward the foreground colour — a light table, in every theme.
      style={{
        backgroundColor: 'color-mix(in oklab, var(--sg-fg) 18%, var(--sg-bg-elevated))',
      }}
      data-testid="scout-stage-photo"
      data-mode={mode}
      data-visual={visual}
      data-cut={curtain ? curtain.cut : undefined}
      data-revealed={revealed ? 'true' : 'false'}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--sg-accent-vivid) 14%, transparent), transparent 62%)',
        }}
        aria-hidden
      />
      {status === 'loading' && <Skeleton className="absolute inset-0 rounded-none" />}
      {status === 'error' ? (
        <div className="absolute inset-0 grid place-items-center text-muted" role="img" aria-label="Photo unavailable">
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <ImageOff className="size-8" aria-hidden />
            <span className="text-xs">No photo for this one — lean on the clues.</span>
          </div>
        </div>
      ) : (
        <>
          <img
            ref={imgRef}
            src={src}
            alt={revealed ? alt : ''}
            aria-hidden={revealed ? undefined : true}
            decoding="async"
            // The stage is the hero of the screen: never lazy, or the first rung arrives late.
            fetchPriority="high"
            crossOrigin="anonymous"
            draggable={false}
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
            className={cn('absolute inset-0 size-full select-none', status === 'loading' && 'opacity-0')}
            style={{
              ...crop,
              filter: style.filter,
              opacity: status === 'loading' ? 0 : style.opacity,
              transition: move,
              willChange: 'filter, transform',
            }}
            data-testid="scout-stage-base"
          />
          {curtain && !curtain.open && (
            // The curtain: the same photo, blacked out, masked away from the bottom up. The mask is
            // on this wrapper (frame coordinates) while the transform is on the image inside it.
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                maskImage: curtain.maskImage,
                maskSize: curtain.maskSize,
                maskPosition: curtain.maskPosition,
                maskRepeat: 'no-repeat',
                // Safari still needs every one of these prefixed.
                WebkitMaskImage: curtain.maskImage,
                WebkitMaskSize: curtain.maskSize,
                WebkitMaskPosition: curtain.maskPosition,
                WebkitMaskRepeat: 'no-repeat',
                transition: `mask-position ${duration}ms var(--ease-out-expo), -webkit-mask-position ${duration}ms var(--ease-out-expo)`,
                opacity: status === 'loading' ? 0 : 1,
                willChange: 'mask-position',
              }}
              aria-hidden
              data-testid="scout-stage-curtain"
            >
              <img
                src={src}
                alt=""
                decoding="async"
                fetchPriority="high"
                crossOrigin="anonymous"
                draggable={false}
                className="absolute inset-0 size-full select-none"
                style={{ ...crop, filter: curtain.shadeFilter, transition: move, willChange: 'transform' }}
              />
            </div>
          )}
        </>
      )}
      {/* Screen readers get the difficulty of the frame, never the answer. */}
      <p className="sr-only" data-testid="scout-stage-sr">
        {revealed ? alt : visualDescription(mode, visual)}
      </p>
    </div>
  );
}
