import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glow';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  /** Round pill shape */
  pill?: boolean;
  className?: string;
  children?: ReactNode;
}

type AsButton = ButtonBaseProps &
  Omit<ComponentPropsWithRef<'button'>, keyof ButtonBaseProps> & { to?: undefined; href?: undefined };
type AsLink = ButtonBaseProps & Omit<LinkProps, keyof ButtonBaseProps> & { to: LinkProps['to']; href?: undefined };
type AsAnchor = ButtonBaseProps &
  Omit<ComponentPropsWithRef<'a'>, keyof ButtonBaseProps> & { href: string; to?: undefined };

export type ButtonProps = AsButton | AsLink | AsAnchor;

export const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-6 text-base gap-2.5 rounded-2xl',
  xl: 'h-16 px-8 text-lg gap-3 rounded-2xl',
};

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-accent text-accent-fg font-semibold shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--sg-accent)_80%,transparent)] hover:brightness-110 hover:-translate-y-0.5 hover:shadow-glow',
  secondary: 'glass text-fg font-semibold hover:bg-surface-strong hover:border-border-strong',
  ghost: 'bg-transparent text-fg font-medium hover:bg-surface',
  danger: 'bg-danger/15 text-danger border border-danger/30 font-semibold hover:bg-danger/25',
  glow: 'bg-gradient-accent text-accent-fg font-bold glow-lg hover:brightness-110 hover:-translate-y-0.5',
};

const baseClasses =
  'relative inline-flex items-center justify-center select-none whitespace-nowrap font-sans leading-none ' +
  'transition-[transform,box-shadow,background-color,filter,border-color] duration-200 ease-out ' +
  'active:scale-[0.97] active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent-2';

function Inner({
  loading,
  leadingIcon,
  trailingIcon,
  children,
}: Pick<ButtonBaseProps, 'loading' | 'leadingIcon' | 'trailingIcon' | 'children'>) {
  return (
    <>
      {loading && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <LoaderCircle className="size-[1.2em] animate-spin" />
        </span>
      )}
      <span className={cn('inline-flex items-center gap-[inherit]', loading && 'opacity-0')}>
        {leadingIcon && <span className="inline-flex shrink-0 [&>svg]:size-[1.2em]">{leadingIcon}</span>}
        {children && <span>{children}</span>}
        {trailingIcon && <span className="inline-flex shrink-0 [&>svg]:size-[1.2em]">{trailingIcon}</span>}
      </span>
    </>
  );
}

/**
 * Button — renders <button>, or <Link> when `to` is set, or <a> when `href` is set.
 */
export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    fullWidth,
    pill,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    baseClasses,
    buttonSizeClasses[size],
    buttonVariantClasses[variant],
    // 36 px is under the 44 px touch minimum: give the small size invisible hit slop on coarse pointers.
    size === 'sm' && 'touch-hit-44',
    size === 'xl' && 'font-display tracking-tight',
    pill && 'rounded-full',
    fullWidth && 'w-full',
    className,
  );
  const inner = (
    <Inner loading={loading} leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
      {children}
    </Inner>
  );

  if ('to' in rest && rest.to !== undefined) {
    const { to, ...linkRest } = rest as AsLink;
    return (
      <Link to={to} className={classes} aria-busy={loading || undefined} {...(linkRest as Omit<LinkProps, 'to'>)}>
        {inner}
      </Link>
    );
  }
  if ('href' in rest && rest.href !== undefined) {
    const anchorRest = rest as AsAnchor;
    return (
      <a className={classes} aria-busy={loading || undefined} {...(anchorRest as ComponentPropsWithRef<'a'>)}>
        {inner}
      </a>
    );
  }
  const { type = 'button', disabled, ...buttonRest } = rest as AsButton;
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...(buttonRest as ComponentPropsWithRef<'button'>)}
    >
      {inner}
    </button>
  );
}
