import type { ReactNode, RefObject } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { cn } from './cn';
import { HighlightMatch } from './HighlightMatch';

export interface ComboboxListProps<T> {
  listRef: RefObject<HTMLUListElement | null>;
  listId: string;
  baseId: string;
  ariaLabel?: string;
  show: boolean;
  options: ReadonlyArray<T>;
  value: string;
  typed: string;
  highlight: number;
  loading: boolean;
  emptyMessage: ReactNode;
  touchAffordance: boolean;
  /** Render the sticky "Submit “…” as is" row (touch + free-text submit available + something typed). */
  submitRow: boolean;
  getKey: (o: T) => string;
  getLabel: (o: T) => string;
  getDescription?: (o: T) => string | undefined;
  renderOption?: (o: T, ctx: { highlighted: boolean; query: string }) => ReactNode;
  onHighlight: (i: number) => void;
  onSelect: (o: T) => void;
  onSubmitTyped: () => void;
}

/** The suggestion list of a `Combobox`. */
export function ComboboxList<T>({
  listRef,
  listId,
  baseId,
  ariaLabel,
  show,
  options,
  value,
  typed,
  highlight,
  loading,
  emptyMessage,
  touchAffordance,
  submitRow,
  getKey,
  getLabel,
  getDescription,
  renderOption,
  onHighlight,
  onSelect,
  onSubmitTyped,
}: ComboboxListProps<T>) {
  const hasOptions = options.length > 0;
  return (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={ariaLabel ? `${ariaLabel} suggestions` : 'Suggestions'}
      hidden={!show}
      onMouseLeave={() => onHighlight(-1)}
      className={cn(
        'glass-strong absolute inset-x-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-2xl bg-bg-elevated/95 p-1.5 shadow-xl',
        show ? 'animate-fade-in' : '',
      )}
    >
      {submitRow && (
        <li
          id={`${baseId}-submit`}
          role="option"
          aria-selected={false}
          data-testid="submit-as-is"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSubmitTyped}
          className="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1 flex min-h-11 cursor-pointer items-center gap-2 border-b border-border bg-bg-elevated/95 px-3 text-sm font-semibold text-fg backdrop-blur-md"
        >
          <CornerDownLeft className="size-4 shrink-0 text-accent" aria-hidden />
          <span className="truncate">Submit “{typed}” as is</span>
        </li>
      )}
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
            onMouseEnter={() => onHighlight(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(o)}
            className={cn(
              'cursor-pointer rounded-xl px-3 text-sm transition-colors',
              touchAffordance ? 'flex min-h-11 items-center py-1.5' : 'py-2.5',
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
      {touchAffordance && hasOptions && (
        <li aria-hidden className="px-3 pb-1 pt-1.5 text-center font-mono text-[10px] uppercase tracking-wider text-muted">
          Tap or ↓ picks a suggestion · Enter submits your text
        </li>
      )}
    </ul>
  );
}
