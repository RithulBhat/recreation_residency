import { useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { Portal, useEscape, useFocusTrap, useScrollLock } from './internal';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** 'auto' = bottom sheet on mobile, right drawer on ≥768px. */
  side?: 'auto' | 'bottom' | 'right' | 'left';
  /** Drawer width on desktop */
  width?: 'sm' | 'md' | 'lg';
  dismissible?: boolean;
  hideClose?: boolean;
  className?: string;
}

const widths = { sm: 'md:max-w-sm', md: 'md:max-w-md', lg: 'md:max-w-lg' } as const;

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'auto',
  width = 'md',
  dismissible = true,
  hideClose = false,
  className,
}: SheetProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const desktop = useMediaQuery('(min-width: 768px)');
  const resolved: 'bottom' | 'right' | 'left' = side === 'auto' ? (desktop ? 'right' : 'bottom') : side;

  useScrollLock(open);
  useFocusTrap(panelRef, open);
  useEscape(onClose, open);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (resolved === 'bottom' && (info.offset.y > 120 || info.velocity.y > 800)) onClose();
    if (resolved === 'right' && (info.offset.x > 120 || info.velocity.x > 800)) onClose();
    if (resolved === 'left' && (info.offset.x < -120 || info.velocity.x < -800)) onClose();
  };

  const variants = {
    bottom: { hidden: { y: '100%' }, visible: { y: 0 } },
    right: { hidden: { x: '100%' }, visible: { x: 0 } },
    left: { hidden: { x: '-100%' }, visible: { x: 0 } },
  } as const;

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="sheet-root"
            className={cn(
              'fixed inset-0 z-[100] flex',
              resolved === 'bottom' && 'items-end justify-center',
              resolved === 'right' && 'items-stretch justify-end',
              resolved === 'left' && 'items-stretch justify-start',
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          >
            <div className="absolute inset-0 touch-none bg-black/60 backdrop-blur-sm" onClick={dismissible ? onClose : undefined} aria-hidden />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? `${id}-title` : undefined}
              tabIndex={-1}
              drag={reduce ? false : resolved === 'bottom' ? 'y' : 'x'}
              dragConstraints={resolved === 'bottom' ? { top: 0 } : resolved === 'right' ? { left: 0 } : { right: 0 }}
              dragElastic={0.08}
              onDragEnd={onDragEnd}
              variants={reduce ? { hidden: { opacity: 0 }, visible: { opacity: 1 } } : variants[resolved]}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              className={cn(
                'glass-strong relative flex w-full flex-col bg-bg-elevated/95 outline-none',
                resolved === 'bottom' && 'max-h-[92dvh] rounded-t-4xl pb-safe',
                resolved !== 'bottom' && cn('h-full max-w-full pt-safe pb-safe', widths[width]),
                resolved === 'right' && 'rounded-l-4xl',
                resolved === 'left' && 'rounded-r-4xl',
                className,
              )}
            >
              {resolved === 'bottom' && (
                <div className="flex justify-center pt-3" aria-hidden>
                  <span className="h-1.5 w-12 rounded-full bg-fg/25" />
                </div>
              )}
              {(title || !hideClose) && (
                <div className="flex items-start gap-3 px-5 pt-4 sm:px-6">
                  <div className="min-w-0 flex-1">
                    {title && (
                      <h2 id={`${id}-title`} className="font-display text-lg font-bold leading-tight text-fg sm:text-xl">
                        {title}
                      </h2>
                    )}
                    {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                  </div>
                  {!hideClose && <IconButton aria-label="Close" icon={<X />} size="sm" onClick={onClose} className="-mr-1 -mt-1" />}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">{children}</div>
              {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">{footer}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
