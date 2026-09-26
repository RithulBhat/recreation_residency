import { cloneElement, isValidElement, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from './cn';

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<{
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    'aria-describedby'?: string;
  }>;
  side?: 'top' | 'bottom';
  /** ms before showing on hover. Default 350. */
  delay?: number;
  className?: string;
}

export function Tooltip({ content, children, side = 'top', delay = 350, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const reduce = useReducedMotion();

  const show = (immediate = false) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (immediate) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  };

  const child = isValidElement(children)
    ? cloneElement(children, {
        onMouseEnter: (e: React.MouseEvent) => {
          children.props.onMouseEnter?.(e);
          show();
        },
        onMouseLeave: (e: React.MouseEvent) => {
          children.props.onMouseLeave?.(e);
          hide();
        },
        onFocus: (e: React.FocusEvent) => {
          children.props.onFocus?.(e);
          show(true);
        },
        onBlur: (e: React.FocusEvent) => {
          children.props.onBlur?.(e);
          hide();
        },
        'aria-describedby': open ? id : undefined,
      })
    : children;

  return (
    <span className="relative inline-flex" onKeyDown={(e) => e.key === 'Escape' && hide()}>
      {child}
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: side === 'top' ? 4 : -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'pointer-events-none absolute left-1/2 z-50 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-fg px-2.5 py-1.5 text-xs font-medium text-bg shadow-lg',
              side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
              className,
            )}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
