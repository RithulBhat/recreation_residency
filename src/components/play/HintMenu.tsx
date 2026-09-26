import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Lightbulb } from 'lucide-react';
import type { GameSettings, HintKind, Round } from '@/types';
import { Button, cn, useEscape, useOnClickOutside } from '@/components/ui';
import { HINT_LABELS, availableHints, hintText, maxHints } from '@/game/hints';

export interface HintMenuHandle {
  /** Open the menu and move focus into it (the H shortcut). */
  open(): void;
}

export interface HintMenuProps {
  settings: GameSettings;
  round: Round;
  onHint: (kind: HintKind) => void;
  /** After a hint was taken — the caller decides where focus goes next. */
  onSelected?: () => void;
  disabled?: boolean;
  className?: string;
}

export const HINT_COST = '−15%';

/**
 * One 44 px `Hint · −15%` button beside Skip; the hint kinds live in a small panel it opens above the
 * action row (anchored to the row, so it never leaves a phone's viewport). ↑ ↓ walk the kinds, Esc
 * and Tab close it and hand focus back. Renders nothing when the game has no hint budget.
 */
export const HintMenu = forwardRef<HintMenuHandle, HintMenuProps>(function HintMenu(
  { settings, round, onHint, onSelected, disabled = false, className },
  ref,
) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const max = maxHints(settings);
  const available = round.status === 'playing' ? availableHints(settings, round) : [];
  const left = Math.max(0, max - round.hintsUsed.length);
  const canOpen = !disabled && available.length > 0;

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        if (canOpen) setOpen(true);
      },
    }),
    [canOpen],
  );

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  useOnClickOutside([triggerRef, panelRef], () => setOpen(false), open);
  useEscape(() => close(true), open);

  // Focus the first kind when the menu opens; drop the menu once nothing is left to ask for.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);
  useEffect(() => {
    if (!canOpen) setOpen(false);
  }, [canOpen]);

  if (max === 0) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.findIndex((b) => b === document.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };
  const pick = (kind: HintKind) => {
    setOpen(false);
    onHint(kind);
    onSelected?.();
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="md"
        leadingIcon={<Lightbulb />}
        disabled={!canOpen}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Hints, ${left} left, each costs 15 percent`}
        className={cn('shrink-0', className)}
        data-testid="hint-button"
      >
        Hint <span className="ml-1 font-mono text-xs text-muted">· {HINT_COST}</span>
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Hints"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="glass-strong absolute inset-x-0 bottom-full z-50 mb-2 origin-bottom-left rounded-2xl bg-bg-elevated/95 p-1.5 shadow-xl sm:max-w-sm"
            onKeyDown={onKeyDown}
            data-testid="hint-menu"
          >
            <p className="px-2.5 pb-1 pt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
              {left} {left === 1 ? 'hint' : 'hints'} left · each −15%
            </p>
            <div role="group" aria-label="Hint kinds" className="flex flex-col gap-0.5">
              {available.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => pick(kind)}
                  aria-label={`${HINT_LABELS[kind]} hint, costs 15 percent`}
                  className="flex h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-strong focus-visible:bg-surface-strong focus-visible:outline-none"
                >
                  <Lightbulb className="size-4 shrink-0 text-warn" aria-hidden />
                  <span className="flex-1">{HINT_LABELS[kind]}</span>
                  <span className="font-mono text-xs text-muted">{HINT_COST}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

export interface UsedHintsProps {
  round: Round;
  className?: string;
}

/** The hints already taken this round, as small inline chips (rendered above the guess field). */
export function UsedHints({ round, className }: UsedHintsProps) {
  if (round.hintsUsed.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Hints revealed" data-testid="hints">
      {round.hintsUsed.map((kind) => (
        <li key={kind} className="inline-flex items-center gap-1.5 rounded-lg border border-warn/30 bg-warn/10 px-2 py-1 text-xs font-medium text-fg">
          <Lightbulb className="size-3.5 text-warn" aria-hidden />
          {hintText(kind, round.track) ?? HINT_LABELS[kind]}
        </li>
      ))}
    </ul>
  );
}
