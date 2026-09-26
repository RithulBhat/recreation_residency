import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  /** Called once when a drag/keyboard interaction ends. */
  onChangeEnd?: (v: number) => void;
  min: number;
  max: number;
  /** Fixed step (ignored when `stepFor` is set). Default: (max-min)/100. */
  step?: number;
  /** Variable step: returns the step size to use around `v`. */
  stepFor?: (v: number) => number;
  /** Logarithmic track (requires min > 0). */
  log?: boolean;
  /** Formats the value readout + aria-valuetext. */
  format?: (v: number) => string;
  /** Tappable preset chips rendered below the track. */
  presets?: number[];
  presetFormat?: (v: number) => string;
  label?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  size?: 'md' | 'lg';
  /** Show value readout next to the label. Default true. */
  showValue?: boolean;
  /** Small tick marks at preset positions */
  ticks?: boolean;
  className?: string;
  id?: string;
}

function decimalsOf(step: number): number {
  if (!Number.isFinite(step)) return 0;
  const s = step.toString();
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return (s.split('.')[1] ?? '').length;
}

export function Slider({
  value,
  onChange,
  onChangeEnd,
  min,
  max,
  step,
  stepFor,
  log = false,
  format = (v) => String(v),
  presets,
  presetFormat,
  label,
  'aria-label': ariaLabel,
  disabled = false,
  size = 'md',
  showValue = true,
  ticks = false,
  className,
  id,
}: SliderProps) {
  const autoId = useId();
  const sliderId = id ?? autoId;
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const toRatio = useCallback(
    (v: number) => {
      const c = Math.min(max, Math.max(min, v));
      if (log) return (Math.log(c) - Math.log(min)) / (Math.log(max) - Math.log(min));
      return (c - min) / (max - min);
    },
    [min, max, log],
  );
  const fromRatio = useCallback(
    (r: number) => {
      const c = Math.min(1, Math.max(0, r));
      if (log) return Math.exp(Math.log(min) + c * (Math.log(max) - Math.log(min)));
      return min + c * (max - min);
    },
    [min, max, log],
  );
  const stepAt = useCallback(
    (v: number) => (stepFor ? stepFor(v) : (step ?? (max - min) / 100)),
    [stepFor, step, max, min],
  );
  const snap = useCallback(
    (v: number) => {
      const s = stepAt(v);
      const snapped = Math.round(v / s) * s;
      const fixed = Number(snapped.toFixed(decimalsOf(s)));
      return Math.min(max, Math.max(min, fixed));
    },
    [stepAt, min, max],
  );

  const ratio = toRatio(value);
  const pct = `${ratio * 100}%`;

  const commit = useCallback(
    (next: number) => {
      if (next !== value) onChange(next);
    },
    [onChange, value],
  );

  const valueFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const r = (clientX - rect.left) / rect.width;
      return snap(fromRatio(r));
    },
    [fromRatio, snap, value],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    commit(valueFromPointer(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    commit(valueFromPointer(e.clientX));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    onChangeEnd?.(valueFromPointer(e.clientX));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const eps = 1e-9;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = snap(value + stepAt(value + eps));
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = snap(value - stepAt(value - eps));
        break;
      case 'PageUp':
        next = snap(value + stepAt(value + eps) * 5);
        break;
      case 'PageDown':
        next = snap(value - stepAt(value - eps) * 5);
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (next !== null) {
      // guard against snapping back onto the same value at step boundaries
      if (next === value) {
        const s = stepAt(next + (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown' ? -eps : eps));
        next = snap(e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown' ? value - s : value + s);
      }
      commit(next);
      onChangeEnd?.(next);
    }
  };

  const tickPositions = useMemo(() => (ticks && presets ? presets.map((p) => toRatio(p)) : []), [ticks, presets, toRatio]);

  const trackH = size === 'lg' ? 'h-3' : 'h-2';
  const thumb = size === 'lg' ? 'size-8' : 'size-7';

  return (
    <div className={cn('w-full', disabled && 'opacity-50 pointer-events-none', className)}>
      {(label || showValue) && (
        <div className="mb-2 flex items-end justify-between gap-3">
          {label ? (
            <label id={`${sliderId}-label`} className="text-sm font-semibold text-fg">
              {label}
            </label>
          ) : (
            <span />
          )}
          {showValue && (
            <output htmlFor={sliderId} className="font-mono text-sm font-semibold tabular text-fg">
              {format(value)}
            </output>
          )}
        </div>
      )}
      <div
        ref={trackRef}
        className="relative flex touch-none select-none items-center py-3"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className={cn('relative w-full overflow-hidden rounded-full bg-surface-strong', trackH)}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct, backgroundImage: 'var(--gradient-accent)' }} />
        </div>
        {tickPositions.map((t, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-fg/25"
            style={{ left: `${t * 100}%` }}
          />
        ))}
        <div
          id={sliderId}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={format(value)}
          aria-labelledby={label ? `${sliderId}-label` : undefined}
          aria-label={!label ? ariaLabel : undefined}
          aria-disabled={disabled || undefined}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className={cn(
            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 bg-fg shadow-[0_2px_10px_rgb(0_0_0/0.4),0_0_0_4px_color-mix(in_oklab,var(--sg-accent)_30%,transparent)]',
            'transition-[transform,box-shadow] duration-150 ease-spring hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-2',
            thumb,
            dragging && 'scale-125 shadow-[0_4px_16px_rgb(0_0_0/0.5),0_0_0_8px_color-mix(in_oklab,var(--sg-accent)_35%,transparent)]',
          )}
          style={{ left: pct, backgroundImage: 'var(--gradient-accent)' }}
        />
      </div>
      {presets && presets.length > 0 && (
        <div className="scrollbar-none -mx-1 mt-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Presets">
          {presets.map((p) => {
            const active = Math.abs(p - value) < 1e-9;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  commit(p);
                  onChangeEnd?.(p);
                }}
                className={cn(
                  'h-8 shrink-0 rounded-full border px-3 font-mono text-xs font-semibold tabular transition-[background-color,border-color,color,transform] active:scale-95',
                  active
                    ? 'border-transparent bg-accent text-accent-fg shadow-glow'
                    : 'border-border bg-surface text-muted hover:bg-surface-strong hover:text-fg',
                )}
              >
                {(presetFormat ?? format)(p)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

export const CLIP_MIN = 0.1;
export const CLIP_MAX = 10;
export const CLIP_PRESETS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10];

/** Fine steps: 0.05 below 1s, 0.25 up to 5s, 0.5 above. */
export function clipStepFor(v: number): number {
  if (v < 1) return 0.05;
  if (v < 5) return 0.25;
  return 0.5;
}

/** "0.35s", "0.1s", "2.5s", "10s" */
export function formatClip(v: number, unit = 's'): string {
  const s = v.toFixed(2).replace(/\.?0+$/, '');
  return `${s}${unit}`;
}

export interface ClipLengthSliderProps {
  value: number;
  onChange: (v: number) => void;
  onChangeEnd?: (v: number) => void;
  label?: ReactNode;
  presets?: number[];
  disabled?: boolean;
  className?: string;
  /** Hide the big readout (e.g. when rendered inside a compact row) */
  compact?: boolean;
  min?: number;
  max?: number;
}

export function ClipLengthSlider({
  value,
  onChange,
  onChangeEnd,
  label = 'Clip length',
  presets = CLIP_PRESETS,
  disabled,
  className,
  compact = false,
  min = CLIP_MIN,
  max = CLIP_MAX,
}: ClipLengthSliderProps) {
  const readout = value.toFixed(2).replace(/\.?0+$/, '');
  const difficulty = value <= 0.15 ? 'brutal' : value <= 0.5 ? 'hard' : value <= 2 ? 'fair' : value <= 5 ? 'easy' : 'chill';
  return (
    <div className={cn('w-full', className)}>
      {!compact && (
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-fg">{label}</div>
            <div className="text-xs text-muted">
              Feels <span className="font-semibold text-fg">{difficulty}</span>
            </div>
          </div>
          <div className="font-mono text-4xl font-semibold leading-none tabular text-fg sm:text-5xl" aria-live="polite">
            {readout}
            <span className="text-2xl text-muted sm:text-3xl">s</span>
          </div>
        </div>
      )}
      <Slider
        value={value}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
        min={min}
        max={max}
        log
        stepFor={clipStepFor}
        format={(v) => formatClip(v)}
        presets={presets}
        ticks
        showValue={compact}
        aria-label={typeof label === 'string' ? label : 'Clip length'}
        disabled={disabled}
        size="lg"
      />
    </div>
  );
}
