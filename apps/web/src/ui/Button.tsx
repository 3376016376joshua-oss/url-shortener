import type { ComponentProps } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cx } from './cx.js';
import { Spinner } from './Spinner.js';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
  secondary:
    'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost: 'text-slate-700 hover:bg-slate-200',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

function buttonClasses(props: ButtonStyleProps): string {
  return cx(
    BASE_CLASSES,
    VARIANT_CLASSES[props.variant ?? 'secondary'],
    SIZE_CLASSES[props.size ?? 'md'],
    props.className,
  );
}

export interface ButtonProps
  extends Omit<ComponentProps<'button'>, 'className'>, ButtonStyleProps {
  /** Shows a spinner and blocks further presses while an action runs. */
  loading?: boolean;
}

export function Button(props: ButtonProps) {
  const {
    variant,
    size,
    className,
    loading = false,
    children,
    ...rest
  } = props;
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled === true || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

export type ButtonLinkProps = Omit<LinkProps, 'className'> & ButtonStyleProps;

/** A navigation link that looks like a button. */
export function ButtonLink(props: ButtonLinkProps) {
  const { variant, size, className, ...rest } = props;
  return (
    <Link {...rest} className={buttonClasses({ variant, size, className })} />
  );
}
