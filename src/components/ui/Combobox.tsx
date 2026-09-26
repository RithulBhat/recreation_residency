import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import { cn } from './cn';
import { inputSizeClasses } from './Input';
import { ComboboxList } from './ComboboxList';

export { HighlightMatch } from './HighlightMatch';

export interface ComboboxProps<T> {
  /** Controlled text value */
  value: string;
  onChange: (text: string) => void;
  options: ReadonlyArray<T>;
  getKey: (o: T) => string;
  getLabel: (o: T) => string;
  getDescription?: (o: T) => string | undefined;
  onSelect: (o: T) => void;
  /**
   * Enter pressed with no highlighted option (free-text submit). Nothing is highlighted until the
   * user arrows onto (or hovers) a suggestion, so Enter never silently swaps the typed text.
   */
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
  /**
   * Coarse pointers: a sticky "Submit “…” as is" row on top of the list, 44 px rows and a one-line
   * reminder that picking a suggestion and submitting the typed text are different things.
   */
  touchAffordance?: boolean;
}

/** `highlight` value when no option is active. */
const NONE = -1;

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
  touchAffordance = false,
}: ComboboxProps<T>) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(NONE);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const typed = value.trim();
  const shouldShow = open && typed.length >= minChars;
  const hasOptions = options.length > 0;
  const submitRow = touchAffordance && !!onSubmit && typed.length > 0;

  useEffect(() => {
    setHighlight(NONE);
  }, [options]);

  useEffect(() => {
    if (!shouldShow || highlight < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, shouldShow]);

  useEffect(() => {
    // `click` (not pointerdown): a swipe/scroll gesture that starts outside must not dismiss the list.
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Open upward when the list would run off the bottom of the (visual) viewport — the guess box
  // sits low on phones, especially with the keyboard up.
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  useLayoutEffect(() => {
    if (!shouldShow) return;
    const measure = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const vv = window.visualViewport;
      const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const below = viewportBottom - r.bottom;
      const above = r.top - (vv ? vv.offsetTop : 0);
      setPlacement(below < 300 && above > below ? 'above' : 'below');
    };
    measure();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [shouldShow]);

  const select = (o: T) => {
    onSelect(o);
    setOpen(false);
    if (clearOnSelect) onChange('');
  };

  const submitTyped = () => {
    if (!onSubmit || !typed) return;
    onSubmit(typed);
    setOpen(false);
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
      if (hasOptions) setHighlight((h) => (h <= 0 ? options.length - 1 : h - 1));
      return;
    }
    if (e.key === 'Enter') {
      const chosen = shouldShow && hasOptions && highlight >= 0 ? options[highlight] : undefined;
      if (chosen !== undefined) {
        e.preventDefault();
        select(chosen);
      } else if (onSubmit && typed) {
        e.preventDefault();
        submitTyped();
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

  const activeId = shouldShow && hasOptions && highlight >= 0 ? `${baseId}-opt-${highlight}` : undefined;
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
          onFocus={(e) => {
            setOpen(true);
            if (touchAffordance) e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }}
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

      <ComboboxList<T>
        listRef={listRef}
        listId={listId}
        baseId={baseId}
        ariaLabel={ariaLabel}
        show={shouldShow}
        options={options}
        value={value}
        typed={typed}
        highlight={highlight}
        loading={loading}
        emptyMessage={emptyMessage}
        touchAffordance={touchAffordance}
        placement={placement}
        submitRow={submitRow}
        getKey={getKey}
        getLabel={getLabel}
        getDescription={getDescription}
        renderOption={renderOption}
        onHighlight={setHighlight}
        onSelect={select}
        onSubmitTyped={submitTyped}
      />
    </div>
  );
}
