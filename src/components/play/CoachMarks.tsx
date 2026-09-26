import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { Disc3, Keyboard, SkipForward } from 'lucide-react';
import { Button, cn } from '@/components/ui';
import { Portal, useEscape, useFocusTrap, useScrollLock } from '@/components/ui/internal';

export interface CoachStep {
  title: string;
  body: string;
  icon: ReactNode;
}

export const COACH_STEPS: readonly CoachStep[] = [
  { icon: <Disc3 />, title: 'Tap the record', body: 'You get 0.1 s of the song. Tap again to hear it once more.' },
  { icon: <Keyboard />, title: 'Type your guess', body: 'Title, artist or both — or hold the mic and just say it.' },
  { icon: <SkipForward />, title: 'Skip grows the clip', body: '0.1 → 0.3 → 1 s… every skip gives you more to go on, for fewer points.' },
];

export interface CoachMarksProps {
  open: boolean;
  onDismiss: () => void;
}

/** Three-step first-run overlay. Esc / "Got it" dismiss it for good; ← → walk the steps. */
export function CoachMarks({ open, onDismiss }: CoachMarksProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);
  useFocusTrap(panelRef, open);
  useEscape(onDismiss, open);
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);
  if (!open) return null;

  const last = step === COACH_STEPS.length - 1;
  const current = COACH_STEPS[step];
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' && !last) {
      e.preventDefault();
      setStep(step + 1);
    } else if (e.key === 'ArrowLeft' && step > 0) {
      e.preventDefault();
      setStep(step - 1);
    }
  };

  return (
    <Portal>
      <div
        className={cn('fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center', !reduce && 'animate-fade-in')}
        data-testid="coach-marks"
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="coach-title"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="glass-strong w-full max-w-sm rounded-4xl bg-bg-elevated/95 p-5 outline-none"
        >
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
            How to play · {step + 1}/{COACH_STEPS.length}
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
              {COACH_STEPS.map((s, i) => (
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
