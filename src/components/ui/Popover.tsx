import { cloneElement, isValidElement, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from './cn';
import { useEscape, useOnClickOutside } from './internal';

export interface PopoverProps {
  /** A single focusable element (button). Receives onClick/aria props. */
  trigger: ReactElement<{
    onClick?: (e: React.MouseEvent) => void;
    'aria-expanded'?: boolean;
    'aria-haspopup'?: 'dialog' | 'menu' | 'listbox' | 'true';
    'aria-controls'?: string;
    ref?: React.Ref<HTMLElement>;
  }>;
  children: ReactNode;
  align?: 'start' | 'end' | 'center';
  side?: 'top' | 'bottom';
  /** Controlled mode */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /** Accessible name for the popover panel */
  'aria-label'?: string;
  width?: number | string;
}

export function Popover({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  open: controlledOpen,
  onOpenChange,
  className,
  'aria-label': ariaLabel,
  width,
}: PopoverProps) {
  const id = useId();
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = (v: boolean) => {
    if (controlledOpen === undefined) setUncontrolled(v);
    onOpenChange?.(v);
  };
  const triggerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useOnClickOutside([triggerRef, panelRef], () => setOpen(false), open);
  useEscape(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, open);

  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger, {
        ref: triggerRef,
        onClick: (e: React.MouseEvent) => {
          trigger.props.onClick?.(e);
          setOpen(!open);
        },
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        'aria-controls': open ? `${id}-panel` : undefined,
      })
    : trigger;

  return (
    <div className="relative inline-flex">
      {triggerEl}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={`${id}-panel`}
            role="dialog"
            aria-label={ariaLabel}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: side === 'bottom' ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: side === 'bottom' ? -6 : 6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={cn(
              'glass-strong absolute z-50 rounded-2xl bg-bg-elevated/96 p-2 shadow-xl',
              side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
              align === 'end' && 'right-0',
              align === 'start' && 'left-0',
              align === 'center' && 'left-1/2 -translate-x-1/2',
              className,
            )}
            style={{ width: width ?? 260, transformOrigin: side === 'bottom' ? 'top' : 'bottom' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
