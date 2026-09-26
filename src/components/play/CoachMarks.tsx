import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { Disc3, Keyboard, SkipForward } from 'lucide-react';
import type { GameSettings } from '@/types';
import { Button, cn } from '@/components/ui';
import { Portal, useEscape, useFocusTrap, useScrollLock } from '@/components/ui/internal';
import { clipLengthFor } from '@/game/selectors';
import { clipLabel } from './format';

export interface CoachStep {
  title: string;
  body: string;
  icon: ReactNode;
  /** Selector of the element the spotlight opens over. */
  target?: string;
}

/** The three steps, phrased for this game's actual clip lengths. */
export function coachSteps(settings: GameSettings): CoachStep[] {
  const first = clipLabel(clipLengthFor(settings, 0));
  const escalating = settings.clipMode === 'escalating' && settings.stages.length > 1;
  const ladder = escalating ? settings.stages.slice(0, 3).map(clipLabel).join(' → ') + (settings.stages.length > 3 ? '…' : '') : '';
  const skip: CoachStep = escalating
    ? { icon: <SkipForward />, title: 'Skip grows the clip', body: `${ladder} — every skip gives you more to go on, for fewer points.`, target: '[data-coach="skip"]' }
    : settings.tries > 1
      ? { icon: <SkipForward />, title: 'Skip burns a try', body: `Same ${first} clip, one try fewer — and fewer points when you get it.`, target: '[data-coach="skip"]' }
      : { icon: <SkipForward />, title: 'One shot per song', body: `${first} and a single guess. Skip reveals the answer.`, target: '[data-coach="skip"]' };
  return [
    { icon: <Disc3 />, title: 'Tap the record', body: `You get ${first} of the song. Tap again to hear it once more.`, target: '[data-coach="record"]' },
    { icon: <Keyboard />, title: 'Type your guess', body: 'Title, artist or both — or hold the mic and just say it.', target: '[data-coach="guess"]' },
    skip,
  ];
}

export interface CoachMarksProps {
  open: boolean;
  onDismiss: () => void;
  settings: GameSettings;
}

interface Spot {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Where the spotlight goes: a circle around the record, a soft ellipse around anything else. */
function measure(selector: string | undefined): Spot | null {
  if (!selector || typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  if (b.width === 0 || b.height === 0) return null;
  const x = b.left + b.width / 2;
  const y = b.top + b.height / 2;
  if (el.dataset.coach === 'record') {
    const r = Math.max(b.width, b.height) * 0.47 + 10;
    return { x, y, rx: r, ry: r };
  }
  return { x, y, rx: b.width * 0.62 + 16, ry: b.height * 0.9 + 16 };
}

/**
 * Three-step first-run overlay. A spotlight opens over the element each step talks about (the record
 * stays sharp, not blurred), and the panel moves out of its way. Esc / "Got it" dismiss it for good;
 * ← → walk the steps.
 */
export function CoachMarks({ open, onDismiss, settings }: CoachMarksProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const steps = coachSteps(settings);
  useScrollLock(open);
  useFocusTrap(panelRef, open);
  useEscape(onDismiss, open);
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const target = steps[step]?.target;
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => setSpot(measure(target));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, target]);

  if (!open) return null;

  const last = step === steps.length - 1;
  const current = steps[step];
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' && !last) {
      e.preventDefault();
      setStep(step + 1);
    } else if (e.key === 'ArrowLeft' && step > 0) {
      e.preventDefault();
      setStep(step - 1);
    }
  };
  // The panel takes the half of the screen the spotlight is not in.
  const top = spot !== null && typeof window !== 'undefined' && spot.y > window.innerHeight * 0.5;
  const vars = spot
    ? ({ '--coach-x': `${spot.x}px`, '--coach-y': `${spot.y}px`, '--coach-rx': `${spot.rx}px`, '--coach-ry': `${spot.ry}px` } as CSSProperties)
    : undefined;

  return (
    <Portal>
      <div
        className={cn('fixed inset-0 z-[90] flex justify-center p-3', top ? 'items-start pt-safe' : 'items-end', !reduce && 'animate-fade-in')}
        data-testid="coach-marks"
        data-placement={top ? 'top' : 'bottom'}
      >
        <div aria-hidden className={cn('absolute inset-0 bg-black/60', spot && 'coach-spotlight')} style={vars} data-testid="coach-spotlight" />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="coach-title"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn('glass-strong relative w-full max-w-sm rounded-4xl bg-bg-elevated/95 p-5 outline-none', top && 'mt-3')}
        >
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
            How to play · {step + 1}/{steps.length}
          </p>
          <div className="mt-3 flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent [&>svg]:size-6" aria-hidden>
              {current.icon}
            </span>
            <div className="min-w-0">
              <h2 id="coach-title" className="font-display text-xl font-bold text-fg">
                {current.title}
              </h2>
              <p className="mt-1 text-sm text-muted">{current.body}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <ol className="flex items-center gap-1.5" aria-label="Steps">
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  className={cn('h-1.5 rounded-full', !reduce && 'transition-all', i === step ? 'w-5 bg-accent' : 'w-1.5 bg-fg/25')}
                  aria-current={i === step ? 'step' : undefined}
                />
              ))}
            </ol>
            <div className="ml-auto flex gap-2">
              {!last && (
                <Button variant="ghost" size="sm" onClick={onDismiss}>
                  Skip
                </Button>
              )}
              <Button variant="glow" size="sm" onClick={last ? onDismiss : () => setStep(step + 1)} data-autofocus data-testid="coach-next">
                {last ? 'Got it' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
