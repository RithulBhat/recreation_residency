import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from './ui/cn';

export type VisualizerVariant = 'bars' | 'wave' | 'ring';

export interface VisualizerProps {
  analyser: AnalyserNode | null;
  active: boolean;
  variant?: VisualizerVariant;
  /** 'gradient' (theme accent gradient) or any CSS color */
  color?: 'gradient' | string;
  className?: string;
  /** Number of bars for bars/ring. Default 48 / 64. */
  bars?: number;
  /** 0..1 idle wave amplitude. Default 0.5 */
  idleAmplitude?: number;
  /** Bars grow from the vertical center (default) instead of the bottom. */
  mirror?: boolean;
}

interface Colors {
  a: string;
  b: string;
  c: string;
}

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const g = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return { a: g('--sg-accent', '#a855f7'), b: g('--sg-accent-2', '#22d3ee'), c: g('--sg-accent-3', '#f472b6') };
}

/** Canvas can't read CSS custom properties — resolve `var(--x)` against the element. */
function resolveColor(color: string, el: Element): string {
  const m = /^var\((--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(color.trim());
  if (!m) return color;
  const v = getComputedStyle(el).getPropertyValue(m[1]!).trim();
  return v || m[2]?.trim() || '#a855f7';
}

function paint(ctx: CanvasRenderingContext2D, colors: Colors, color: string, w: number, h: number): string | CanvasGradient {
  if (color !== 'gradient') return resolveColor(color, ctx.canvas);
  const g = ctx.createLinearGradient(0, 0, w, h * 0.3);
  g.addColorStop(0, colors.a);
  g.addColorStop(0.55, colors.b);
  g.addColorStop(1, colors.c);
  return g;
}

/**
 * Canvas visualizer. Feeds from an AnalyserNode when `active`, otherwise
 * animates a gentle idle wave. DPR-aware and resize-observed.
 */
export function Visualizer({
  analyser,
  active,
  variant = 'bars',
  color = 'gradient',
  className,
  bars,
  idleAmplitude = 0.5,
  mirror = true,
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const propsRef = useRef({ variant, color, bars, idleAmplitude, mirror });
  propsRef.current = { variant, color, bars, idleAmplitude, mirror };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce && !(analyser && active)) drawFrame();
    });
    ro.observe(canvas);

    let raf = 0;
    let t = Math.random() * 100;
    let frame = 0;
    let colors = readColors();
    const levels = new Float32Array(256);
    let freq: Uint8Array<ArrayBuffer> | null = null;
    let time: Uint8Array<ArrayBuffer> | null = null;

    const live = () => !!analyser && active;

    const drawBars = (n: number, fill: string | CanvasGradient, useLive: boolean) => {
      const { mirror: mir, idleAmplitude: amp } = propsRef.current;
      if (useLive && analyser) {
        if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);
      }
      const bins = freq?.length ?? 0;
      const gap = Math.max(1.5, w / n / 4);
      const bw = (w - gap * (n - 1)) / n;
      ctx.fillStyle = fill;
      for (let i = 0; i < n; i++) {
        let target: number;
        if (useLive && freq && bins > 0) {
          const lo = 2;
          const hi = bins * 0.55;
          const idx = Math.min(bins - 1, Math.floor(lo * Math.pow(hi / lo, i / Math.max(1, n - 1))));
          const idx2 = Math.min(bins - 1, Math.floor(lo * Math.pow(hi / lo, (i + 1) / Math.max(1, n - 1))));
          let sum = 0;
          let cnt = 0;
          for (let k = idx; k <= Math.max(idx, idx2 - 1); k++) {
            sum += freq[k] ?? 0;
            cnt++;
          }
          target = cnt ? sum / cnt / 255 : 0;
          target = Math.pow(target, 1.4);
        } else {
          target = 0.06 + amp * (0.22 + 0.16 * Math.sin(t * 1.5 + i * 0.42) + 0.12 * Math.sin(t * 0.7 - i * 0.23));
        }
        const cur = levels[i] ?? 0;
        const next = cur + (target - cur) * (target > cur ? 0.55 : 0.14);
        levels[i] = next;
        const bh = Math.max(bw, next * h * 0.96);
        const x = i * (bw + gap);
        const y = mir ? (h - bh) / 2 : h - bh;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, bw / 2);
        ctx.fill();
      }
    };

    const drawWave = (stroke: string | CanvasGradient, useLive: boolean) => {
      const { idleAmplitude: amp } = propsRef.current;
      if (useLive && analyser) {
        if (!time || time.length !== analyser.fftSize) time = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(time);
      }
      const pts = Math.max(24, Math.floor(w / 3));
      const path = new Path2D();
      for (let i = 0; i <= pts; i++) {
        const x = (i / pts) * w;
        let y: number;
        if (useLive && time) {
          const idx = Math.floor((i / pts) * (time.length - 1));
          const v = ((time[idx] ?? 128) - 128) / 128;
          y = h / 2 + v * (h / 2) * 0.92;
        } else {
          const env = Math.sin((i / pts) * Math.PI); // taper at edges
          y = h / 2 + env * amp * (Math.sin(x * 0.035 + t * 2.2) * h * 0.22 + Math.sin(x * 0.012 - t * 1.3) * h * 0.14);
        }
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = stroke;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 7;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.5;
      ctx.stroke(path);
    };

    const drawRing = (n: number, stroke: string | CanvasGradient, useLive: boolean) => {
      const { idleAmplitude: amp } = propsRef.current;
      if (useLive && analyser) {
        if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);
      }
      const bins = freq?.length ?? 0;
      const cx = w / 2;
      const cy = h / 2;
      const r0 = Math.min(w, h) * 0.3;
      const rMax = Math.min(w, h) / 2 - 2;
      ctx.strokeStyle = stroke;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, ((2 * Math.PI * r0) / n) * 0.5);
      for (let i = 0; i < n; i++) {
        let target: number;
        if (useLive && freq && bins > 0) {
          const idx = Math.min(bins - 1, Math.floor(2 * Math.pow((bins * 0.5) / 2, (i % (n / 2)) / (n / 2 - 1))));
          target = Math.pow((freq[idx] ?? 0) / 255, 1.4);
        } else {
          target = 0.08 + amp * (0.25 + 0.18 * Math.sin(t * 1.6 + i * 0.5) + 0.1 * Math.sin(t * 0.9 - i * 0.3));
        }
        const cur = levels[i] ?? 0;
        const next = cur + (target - cur) * (target > cur ? 0.5 : 0.12);
        levels[i] = next;
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r1 = r0 + Math.max(2, next * (rMax - r0));
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
    };

    const drawFrame = () => {
      frame++;
      if (frame % 45 === 0) colors = readColors();
      const { variant: v, color: c, bars: nb } = propsRef.current;
      const useLive = live();
      ctx.clearRect(0, 0, w, h);
      const fill = paint(ctx, colors, c, w, h);
      if (v === 'bars') drawBars(nb ?? 48, fill, useLive);
      else if (v === 'wave') drawWave(fill, useLive);
      else drawRing(nb ?? 64, fill, useLive);
      t += 0.022;
    };

    const loop = () => {
      drawFrame();
      raf = requestAnimationFrame(loop);
    };

    if (reduce && !live()) {
      // Static idle frame under reduced motion.
      for (let i = 0; i < 12; i++) drawFrame();
    } else {
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser, active, reduce]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('block h-full w-full', className)}
      role="img"
      aria-label={active ? 'Audio visualizer' : 'Idle audio visualizer'}
    />
  );
}
