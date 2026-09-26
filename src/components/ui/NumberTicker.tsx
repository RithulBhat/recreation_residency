import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from './cn';

export interface NumberTickerProps {
  value: number;
  /** ms. Default 900 */
  duration?: number;
  format?: (v: number) => string;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Start from 0 on mount instead of showing the value immediately. Default true. */
  animateOnMount?: boolean;
  decimals?: number;
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function NumberTicker({
  value,
  duration = 900,
  format,
  prefix = '',
  suffix = '',
  className,
  animateOnMount = true,
  decimals = 0,
}: NumberTickerProps) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(animateOnMount && !reduce ? 0 : value);
  const fromRef = useRef(display);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (value - from) * easeOutExpo(t);
      setDisplay(v);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      fromRef.current = display;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reduce]);

  const text = format ? format(display) : display.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  return (
    <span className={cn('font-mono tabular', className)} aria-live="polite">
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
