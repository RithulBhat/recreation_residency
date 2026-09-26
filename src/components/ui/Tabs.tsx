import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from './cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  tabs: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (v: T) => void;
  'aria-label'?: string;
  className?: string;
  /** Stretch tabs to fill the row */
  fullWidth?: boolean;
  /** Prefix used for aria-controls / panel ids */
  idPrefix?: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, 'aria-label': ariaLabel, className, fullWidth, idPrefix }: TabsProps<T>) {
  const autoId = useId();
  const id = idPrefix ?? autoId;
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = tabs.filter((t) => !t.disabled);
    const idx = enabled.findIndex((t) => t.value === value);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = enabled.length - 1;
    if (next === null) return;
    e.preventDefault();
    const t = enabled[next]!;
    onChange(t.value);
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-tab-${t.value}`)}`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('scrollbar-none relative flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border', className)}
    >
      {tabs.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            id={`${id}-tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${id}-panel-${t.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            className={cn(
              'touch-hit-44 relative inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-semibold transition-colors disabled:opacity-40',
              fullWidth && 'flex-1 justify-center',
              selected ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {t.icon && <span className="[&>svg]:size-4">{t.icon}</span>}
            {t.label}
            {typeof t.count === 'number' && (
              <span className="rounded-full bg-surface-strong px-1.5 py-0.5 font-mono text-[10px] tabular text-muted">{t.count}</span>
            )}
            {selected && (
              <motion.span
                layoutId={`${id}-underline`}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-accent"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps<T extends string> {
  value: T;
  active: T;
  idPrefix: string;
  children: ReactNode;
  className?: string;
  /** Keep mounted when inactive (hidden). Default false. */
  keepMounted?: boolean;
}

export function TabPanel<T extends string>({ value, active, idPrefix, children, className, keepMounted }: TabPanelProps<T>) {
  const isActive = value === active;
  if (!isActive && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      hidden={!isActive}
      tabIndex={0}
      className={cn('animate-fade-in', className)}
    >
      {children}
    </div>
  );
}
