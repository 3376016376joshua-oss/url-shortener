import type { ReactNode } from 'react';
import { describeError } from '../api/describe-error.js';
import { Button } from './Button.js';
import { cx } from './cx.js';
import { Spinner } from './Spinner.js';

const STATE_CLASSES =
  'flex flex-col items-center justify-center gap-3 rounded-lg px-4 py-12 text-center';

/** The loading state of a view or a part of one. */
export function LoadingState(props: { label?: string; className?: string }) {
  return (
    <div role="status" className={cx(STATE_CLASSES, props.className)}>
      <Spinner className="size-6 text-indigo-600" />
      <p className="text-sm text-slate-600">{props.label ?? 'Loading'}</p>
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** The way forward, for example a "Create link" button. */
  action?: ReactNode;
  className?: string;
}

/** The empty state of a view: says what belongs here and how to add it. */
export function EmptyState(props: EmptyStateProps) {
  return (
    <div
      className={cx(
        STATE_CLASSES,
        'border border-dashed border-slate-400 bg-white',
        props.className,
      )}
    >
      <p className="text-base font-semibold text-slate-900">{props.title}</p>
      {props.description === undefined ? null : (
        <p className="max-w-prose text-sm text-slate-600">
          {props.description}
        </p>
      )}
      {props.action}
    </div>
  );
}

export interface ErrorStateProps {
  /** What failed, in the view's own words. */
  title?: string;
  /** Whatever the query or mutation threw. */
  error: unknown;
  /** Shows a "Try again" button when given. */
  onRetry?: () => void;
  className?: string;
}

/** The error state of a view: what went wrong and, when possible, a retry. */
export function ErrorState(props: ErrorStateProps) {
  const { message, requestId } = describeError(props.error);
  return (
    <div
      role="alert"
      className={cx(
        STATE_CLASSES,
        'border border-red-300 bg-red-50',
        props.className,
      )}
    >
      <p className="text-base font-semibold text-red-900">
        {props.title ?? 'This could not be loaded'}
      </p>
      <p className="max-w-prose text-sm text-red-900">{message}</p>
      {requestId === null ? null : (
        <p className="text-xs break-all text-red-900">
          Request id: <code>{requestId}</code>
        </p>
      )}
      {props.onRetry === undefined ? null : (
        <Button onClick={props.onRetry}>Try again</Button>
      )}
    </div>
  );
}
