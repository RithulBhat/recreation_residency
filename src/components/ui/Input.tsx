import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cn } from './cn';

export interface InputProps extends Omit<ComponentPropsWithRef<'input'>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Slot on the right inside the field (e.g. a button) */
  trailing?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  /** Style container */
  containerClassName?: string;
}

export const inputSizeClasses = {
  md: 'h-11 text-base rounded-xl',
  lg: 'h-13 text-lg rounded-2xl',
  xl: 'h-16 text-xl rounded-2xl',
} as const;

export function Input({
  label,
  hint,
  error,
  leadingIcon,
  trailingIcon,
  trailing,
  size = 'md',
  className,
  containerClassName,
  id,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errId = `${inputId}-err`;
  const padL = leadingIcon ? (size === 'xl' ? 'pl-14' : 'pl-11') : size === 'xl' ? 'pl-5' : 'pl-4';
  const padR = trailing ? 'pr-2' : trailingIcon ? 'pr-11' : 'pr-4';

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-fg">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leadingIcon && (
          <span
            className={cn(
              'pointer-events-none absolute left-0 grid h-full place-items-center text-muted [&>svg]:size-5',
              size === 'xl' ? 'w-14' : 'w-11',
            )}
            aria-hidden
          >
            {leadingIcon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : hint ? hintId : undefined}
          className={cn(
            'w-full min-w-0 border bg-surface text-fg placeholder:text-muted/70 backdrop-blur-md',
            'transition-[border-color,box-shadow,background-color] duration-150',
            'focus:outline-none focus:border-accent focus:bg-surface-strong focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--sg-accent)_25%,transparent)]',
            'disabled:opacity-50',
            error ? 'border-danger' : 'border-border-strong',
            inputSizeClasses[size],
            padL,
            padR,
            className,
          )}
          {...rest}
        />
        {trailingIcon && !trailing && (
          <span
            className="pointer-events-none absolute right-0 grid h-full w-11 place-items-center text-muted [&>svg]:size-5"
            aria-hidden
          >
            {trailingIcon}
          </span>
        )}
        {trailing && <span className="absolute right-1.5 flex items-center">{trailing}</span>}
      </div>
      {error ? (
        <p id={errId} className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
