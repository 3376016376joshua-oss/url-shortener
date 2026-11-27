import { useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from './cx.js';

const CONTROL_CLASSES =
  'block h-10 w-full rounded-md border border-slate-500 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 aria-invalid:border-red-700';

/** What a control needs to be wired to its label, hint, and error. */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FieldProps {
  label: string;
  /** Standing advice shown under the control. */
  hint?: string;
  /** The validation message; its presence marks the control invalid. */
  error?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/** A label, a control, and its hint and error, wired together for assistive technology. */
export function Field(props: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasHint = props.hint !== undefined;
  const hasError = props.error !== undefined;
  const describedBy = cx(hasHint && hintId, hasError && errorId);
  return (
    <div className={cx('flex flex-col gap-1.5', props.className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-900">
        {props.label}
      </label>
      {props.children({
        id,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-invalid': hasError ? true : undefined,
      })}
      {hasHint ? (
        <p id={hintId} className="text-sm text-slate-600">
          {props.hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} className="text-sm text-red-700">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

type FieldTextProps = Pick<FieldProps, 'label' | 'hint' | 'error'>;

export type TextFieldProps = FieldTextProps &
  Omit<ComponentProps<'input'>, 'id' | 'aria-describedby' | 'aria-invalid'>;

/** A labelled `<input>` of any text-like type. */
export function TextField(props: TextFieldProps) {
  const { label, hint, error, className, ...input } = props;
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <input {...input} {...control} className={CONTROL_CLASSES} />
      )}
    </Field>
  );
}

export type SelectFieldProps = FieldTextProps &
  Omit<ComponentProps<'select'>, 'id' | 'aria-describedby' | 'aria-invalid'>;

/** A labelled `<select>`; pass `<option>` elements as children. */
export function SelectField(props: SelectFieldProps) {
  const { label, hint, error, className, children, ...select } = props;
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <select {...select} {...control} className={CONTROL_CLASSES}>
          {children}
        </select>
      )}
    </Field>
  );
}
