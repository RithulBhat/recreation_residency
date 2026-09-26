import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import { cn } from './cn';
import { inputSizeClasses } from './Input';

export interface ComboboxProps<T> {
  /** Controlled text value */
  value: string;
  onChange: (text: string) => void;
  options: ReadonlyArray<T>;
  getKey: (o: T) => string;
  getLabel: (o: T) => string;
  getDescription?: (o: T) => string | undefined;
  onSelect: (o: T) => void;
  /** Enter pressed with no highlighted option (free-text submit) */
  onSubmit?: (text: string) => void;
  renderOption?: (o: T, ctx: { highlighted: boolean; query: string }) => ReactNode;
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  size?: 'md' | 'lg' | 'xl';
  leadingIcon?: ReactNode;
  /** Slot on the right inside the field (e.g. a mic or submit button) */
  trailing?: ReactNode;
  emptyMessage?: ReactNode;
  /** Minimum characters before the list opens. Default 1. */
  minChars?: number;
  'aria-label'?: string;
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  /** Clear text after select. Default false. */
  clearOnSelect?: boolean;
  /** Extra props for the input */
  inputMode?: 'text' | 'search';
  name?: string;
  autoComplete?: string;
}

export function Combobox<T>({
  value,
  onChange,
  options,
  getKey,
  getLabel,
  getDescription,
  onSelect,
  onSubmit,
  renderOption,
  loading = false,
  placeholder,
  disabled,
  autoFocus,
  size = 'lg',
  leadingIcon = <Search />,
  trailing,
  emptyMessage = 'No matches yet — keep typing',
  minChars = 1,
  'aria-label': ariaLabel,
  id,
  inputRef,
  className,
  clearOnSelect = false,
  inputMode,
  name,
  autoComplete = 'off',
}: ComboboxProps<T>) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const shouldShow = open && value.trim().length >= minChars;
  const hasOptions = options.length > 0;

  useEffect(() => {
    setHighlight(0);
  }, [options]);

  useEffect(() => {
    if (!shouldShow) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, shouldShow]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const select = (o: T) => {
    onSelect(o);
    setOpen(false);
    if (clearOnSelect) onChange('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (hasOptions) setHighlight((h) => (h + 1) % options.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hasOptions) setHighlight((h) => (h - 1 + options.length) % options.length);
      return;
    }
    if (e.key === 'Enter') {
      if (shouldShow && hasOptions && options[highlight] !== undefined) {
        e.preventDefault();
        select(options[highlight]!);
      } else if (onSubmit && value.trim()) {
        e.preventDefault();
        onSubmit(value.trim());
        setOpen(false);
      }
      return;
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === 'Tab') setOpen(false);
  };

  const activeId = shouldShow && hasOptions ? `${baseId}-opt-${highlight}` : undefined;
  const padL = size === 'xl' ? 'pl-14' : 'pl-11';

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <div className="relative flex items-center">
        <span
          className={cn(
            'pointer-events-none absolute left-0 grid h-full place-items-center text-muted [&>svg]:size-5',
            size === 'xl' ? 'w-14' : 'w-11',
          )}
          aria-hidden
        >
          {loading ? <LoaderCircle className="animate-spin" /> : leadingIcon}
        </span>
        <input
          ref={inputRef}
          id={baseId}
          role="combobox"
          aria-expanded={shouldShow}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={ariaLabel}
          autoComplete={autoComplete}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode={inputMode}
          name={name}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full min-w-0 border border-border-strong bg-surface text-fg placeholder:text-muted/70 backdrop-blur-md',
            'transition-[border-color,box-shadow,background-color] duration-150',
            'focus:outline-none focus:border-accent focus:bg-surface-strong focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--sg-accent)_25%,transparent)]',
            'disabled:opacity-50',
            inputSizeClasses[size],
            padL,
            trailing ? 'pr-14' : 'pr-4',
          )}
        />
        {trailing && <span className="absolute right-1.5 flex items-center">{trailing}</span>}
      </div>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={ariaLabel ? `${ariaLabel} suggestions` : 'Suggestions'}
        hidden={!shouldShow}
        className={cn(
          'glass-strong absolute inset-x-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-2xl bg-bg-elevated/95 p-1.5 shadow-xl',
          shouldShow ? 'animate-fade-in' : '',
        )}
      >
        {!hasOptions && !loading && <li className="px-3 py-3 text-sm text-muted">{emptyMessage}</li>}
        {!hasOptions && loading && <li className="px-3 py-3 text-sm text-muted">Searching…</li>}
        {options.map((o, i) => {
          const highlighted = i === highlight;
          const desc = getDescription?.(o);
          return (
            <li
              key={getKey(o)}
              id={`${baseId}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={highlighted}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(o)}
              className={cn(
                'cursor-pointer rounded-xl px-3 py-2.5 text-sm transition-colors',
                highlighted ? 'bg-accent/15 text-fg' : 'text-fg hover:bg-surface',
              )}
            >
              {renderOption ? (
                renderOption(o, { highlighted, query: value })
              ) : (
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    <HighlightMatch text={getLabel(o)} query={value} />
                  </div>
                  {desc && <div className="truncate text-xs text-muted">{desc}</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Bolds occurrences of each query word inside `text`. */
export function HighlightMatch({ text, query, className }: { text: string; query: string; className?: string }) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  if (words.length === 0) return <span className={className}>{text}</span>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  const parts = text.split(re);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p && words.includes(p.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-transparent text-accent">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}
