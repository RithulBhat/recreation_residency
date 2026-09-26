import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cn } from './cn';

export interface SwitchProps extends Omit<ComponentPropsWithRef<'button'>, 'onChange' | 'children'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md';
  /** Label placement */
  labelPosition?: 'left' | 'right';
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  size = 'md',
  labelPosition = 'left',
  disabled,
  className,
  id,
  ...rest
}: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const labelId = `${switchId}-label`;
  const descId = `${switchId}-desc`;
  const track = size === 'sm' ? 'h-6 w-10' : 'h-7 w-12';
  const knob = size === 'sm' ? 'size-4' : 'size-5';
  const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5';

  const control = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={description ? descId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border p-1 transition-[background-color,border-color,box-shadow] duration-200 disabled:opacity-50 disabled:pointer-events-none',
        track,
        checked ? 'bg-accent border-accent shadow-glow' : 'bg-surface-strong border-border-strong',
        'hit-44',
      )}
      {...rest}
    >
      <span
        className={cn(
          'block rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.35)] transition-transform duration-200 ease-spring',
          knob,
          checked ? shift : 'translate-x-0',
        )}
      />
    </button>
  );

  if (!label) return <span className={className}>{control}</span>;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4',
        labelPosition === 'right' && 'flex-row-reverse justify-end',
        className,
      )}
    >
      <label htmlFor={switchId} id={labelId} className="cursor-pointer select-none">
        <span className="block text-sm font-semibold text-fg">{label}</span>
        {description && (
          <span id={descId} className="mt-0.5 block text-xs text-muted">
            {description}
          </span>
        )}
      </label>
      {control}
    </div>
  );
}
