import type { ReactNode } from 'react';
import { cx } from './cx.js';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-200 text-slate-800',
  info: 'bg-blue-100 text-blue-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-900',
  danger: 'bg-red-100 text-red-800',
};

/** A short status label, for example a link's state or a member's role. */
export function Badge(props: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[props.tone ?? 'neutral'],
      )}
    >
      {props.children}
    </span>
  );
}
