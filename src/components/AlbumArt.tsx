import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Music } from 'lucide-react';
import { cn } from './ui/cn';

export interface AlbumArtProps {
  src?: string;
  alt?: string;
  /** 0 = fully revealed, 1 = fully hidden. */
  blur?: number;
  /** CSS size; the tile is always square. Default '100%'. */
  size?: number | string;
  className?: string;
  rounded?: 'xl' | '2xl' | '3xl' | 'full';
  /** Fallback emoji for the placeholder tile */
  emoji?: string;
  /** Called after the reveal flip finishes */
  onRevealed?: () => void;
}

const radii = { xl: 'rounded-xl', '2xl': 'rounded-2xl', '3xl': 'rounded-3xl', full: 'rounded-full' } as const;

export function AlbumArt({ src, alt = '', blur = 1, size = '100%', className, rounded = '3xl', emoji, onRevealed }: AlbumArtProps) {
  const reduce = useReducedMotion();
  const b = Math.max(0, Math.min(1, blur));
  const hidden = b > 0.02;
  const prevHidden = useRef(hidden);
  const [flipKey, setFlipKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (prevHidden.current && !hidden) setFlipKey((k) => k + 1);
    prevHidden.current = hidden;
  }, [hidden]);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  return (
    <div
      className={cn('relative aspect-square shrink-0 select-none', className)}
      style={{ width: size, perspective: 900 }}
      role={src ? 'img' : undefined}
      aria-label={src ? (hidden ? 'Hidden album cover' : alt) : undefined}
    >
      <motion.div
        key={flipKey}
        initial={flipKey > 0 && !reduce ? { rotateY: 90, scale: 0.9, opacity: 0.6 } : false}
        animate={{ rotateY: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onAnimationComplete={() => {
          if (flipKey > 0) onRevealed?.();
        }}
        className={cn(
          'relative size-full overflow-hidden bg-bg-elevated shadow-[0_24px_60px_-24px_rgb(0_0_0/0.7)] ring-1 ring-border',
          radii[rounded],
          !hidden && 'ring-accent/40 shadow-glow',
        )}
      >
        {src && !failed ? (
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn('size-full object-cover transition-[filter,transform,opacity] duration-700 ease-out', !loaded && 'opacity-0')}
            style={{
              filter: `blur(${b * 28}px) saturate(${1 + b * 0.6}) brightness(${1 - b * 0.15})`,
              transform: `scale(${1 + b * 0.22})`,
            }}
          />
        ) : (
          <div className="grid size-full place-items-center bg-gradient-accent text-white/90">
            {emoji ? <span className="text-[38%] leading-none" aria-hidden>{emoji}</span> : <Music className="size-[36%]" aria-hidden />}
          </div>
        )}
        {/* Shimmer while hidden */}
        {hidden && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_30%,rgb(255_255_255/0.16)_50%,transparent_70%)] animate-shimmer" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_40%,rgb(0_0_0/0.35))]" />
          </div>
        )}
        {/* Gloss */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgb(255_255_255/0.14),transparent_45%)]" aria-hidden />
      </motion.div>
    </div>
  );
}
