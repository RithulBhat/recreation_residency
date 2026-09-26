import { useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { Portal, useEscape, useFocusTrap, useScrollLock } from './internal';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Click on backdrop closes. Default true. */
  dismissible?: boolean;
  hideClose?: boolean;
  /** Center content (e.g. celebratory dialogs) */
  align?: 'start' | 'center';
  className?: string;
  /** Accent glow around the panel */
  glow?: boolean;
}

const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  hideClose = false,
  align = 'start',
  className,
  glow,
}: DialogProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useScrollLock(open);
  useFocusTrap(panelRef, open);
  useEscape(onClose, open);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="dialog-root"
            className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={dismissible ? onClose : undefined}
              aria-hidden
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? `${id}-title` : undefined}
              aria-describedby={description ? `${id}-desc` : undefined}
              tabIndex={-1}
              className={cn(
                'glass-strong relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-4xl bg-bg-elevated/95 pb-safe outline-none sm:rounded-4xl',
                sizes[size],
                glow && 'glow-lg',
                className,
              )}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              {(title || !hideClose) && (
                <div className={cn('flex items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6', align === 'center' && 'text-center')}>
                  <div className="min-w-0 flex-1">
                    {title && (
                      <h2 id={`${id}-title`} className="font-display text-xl font-bold leading-tight text-fg sm:text-2xl">
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p id={`${id}-desc`} className="mt-1 text-sm text-muted">
                        {description}
                      </p>
                    )}
                  </div>
                  {!hideClose && <IconButton aria-label="Close" icon={<X />} size="sm" onClick={onClose} className="-mr-1 -mt-1" />}
                </div>
              )}
              <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6', align === 'center' && 'text-center')}>{children}</div>
              {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">{footer}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
