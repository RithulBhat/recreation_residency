import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from './cn';
import { Portal } from './internal';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'warn' | 'accent';

export interface ToastOptions {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  icon?: ReactNode;
  /** ms; 0 = sticky. Default 3500. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
  id: string;
}

interface ToastApi {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/* Imperative bridge so `toast()` works outside React (e.g. stores). */
let bridge: ToastApi | null = null;
const queue: ToastOptions[] = [];

export function toast(opts: ToastOptions): string {
  if (bridge) return bridge.toast(opts);
  queue.push(opts);
  return opts.id ?? '';
}
toast.dismiss = (id: string) => bridge?.dismiss(id);
toast.success = (title: ReactNode, description?: ReactNode) => toast({ title, description, tone: 'success' });
toast.error = (title: ReactNode, description?: ReactNode) => toast({ title, description, tone: 'danger' });
toast.info = (title: ReactNode, description?: ReactNode) => toast({ title, description, tone: 'accent' });

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

let counter = 0;

export function ToastProvider({ children, max = 4 }: { children: ReactNode; max?: number }) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const dismissAll = useCallback(() => {
    setItems([]);
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current.clear();
  }, []);

  const push = useCallback(
    (opts: ToastOptions) => {
      const id = opts.id ?? `t${++counter}`;
      const rec: ToastRecord = { duration: 3500, tone: 'neutral', ...opts, id };
      setItems((list) => [...list.filter((t) => t.id !== id), rec].slice(-max));
      const existing = timers.current.get(id);
      if (existing) window.clearTimeout(existing);
      if (rec.duration && rec.duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), rec.duration),
        );
      }
      return id;
    },
    [dismiss, max],
  );

  const api = useMemo<ToastApi>(() => ({ toast: push, dismiss, dismissAll }), [push, dismiss, dismissAll]);

  useEffect(() => {
    bridge = api;
    while (queue.length) api.toast(queue.shift()!);
    return () => {
      if (bridge === api) bridge = null;
    };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const toneIcon: Record<ToastTone, ReactNode> = {
  neutral: <Info />,
  accent: <Info />,
  success: <CircleCheck />,
  danger: <CircleAlert />,
  warn: <TriangleAlert />,
};

const toneClass: Record<ToastTone, string> = {
  neutral: 'text-fg',
  accent: 'text-accent',
  success: 'text-success',
  danger: 'text-danger',
  warn: 'text-warn',
};

function ToastViewport({ items, onDismiss }: { items: ToastRecord[]; onDismiss: (id: string) => void }) {
  const reduce = useReducedMotion();
  return (
    <Portal>
      <div
        className="pointer-events-none fixed inset-x-0 z-[200] flex flex-col items-center gap-2 px-4"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}
        aria-live="polite"
        aria-relevant="additions"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout={!reduce}
              role="status"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-bg-elevated/95 p-3 pr-2 shadow-xl"
            >
              <span className={cn('mt-0.5 shrink-0 [&>svg]:size-5', toneClass[t.tone ?? 'neutral'])} aria-hidden>
                {t.icon ?? toneIcon[t.tone ?? 'neutral']}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-fg">{t.title}</div>
                {t.description && <div className="mt-0.5 text-xs text-muted">{t.description}</div>}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      onDismiss(t.id);
                    }}
                    className="mt-1.5 text-xs font-semibold text-accent hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => onDismiss(t.id)}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Portal>
  );
}
