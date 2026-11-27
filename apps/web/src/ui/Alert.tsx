import type { ComponentType, ReactNode } from 'react';
import type { Tone } from './Badge.js';
import { cx } from './cx.js';
import {
  AlertIcon,
  CheckCircleIcon,
  InfoIcon,
  type IconProps,
} from './icons.js';

export type AlertTone = Exclude<Tone, 'neutral'>;

interface ToneStyle {
  classes: string;
  Icon: ComponentType<IconProps>;
  /** Problems interrupt a screen reader; the rest wait their turn. */
  role: 'alert' | 'status';
}

const TONE_STYLES: Record<AlertTone, ToneStyle> = {
  info: {
    classes: 'border-blue-300 bg-blue-50 text-blue-900',
    Icon: InfoIcon,
    role: 'status',
  },
  success: {
    classes: 'border-green-300 bg-green-50 text-green-900',
    Icon: CheckCircleIcon,
    role: 'status',
  },
  warning: {
    classes: 'border-amber-300 bg-amber-50 text-amber-900',
    Icon: AlertIcon,
    role: 'alert',
  },
  danger: {
    classes: 'border-red-300 bg-red-50 text-red-900',
    Icon: AlertIcon,
    role: 'alert',
  },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
}

/** An inline message that stays on the page, for example a form's failure. */
export function Alert(props: AlertProps) {
  const style = TONE_STYLES[props.tone ?? 'info'];
  return (
    <div
      role={style.role}
      className={cx(
        'flex gap-3 rounded-md border px-4 py-3 text-sm',
        style.classes,
      )}
    >
      <style.Icon className="mt-px" />
      <div className="min-w-0">
        {props.title === undefined ? null : (
          <p className="font-semibold">{props.title}</p>
        )}
        <div>{props.children}</div>
      </div>
    </div>
  );
}
