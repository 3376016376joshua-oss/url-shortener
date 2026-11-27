import { useId, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button.js';
import { useModalDialog } from './use-modal-dialog.js';

export interface DialogProps {
  open: boolean;
  /** Asked for by Escape, a press outside, or the dialog's own buttons. */
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** The dialog's buttons. Focus starts on the dialog's first control. */
  footer: ReactNode;
}

/** A modal dialog for a short task or a question, centred over the page. */
export function Dialog(props: DialogProps) {
  const dialogProps = useModalDialog(props.open, props.onClose);
  const titleId = useId();
  const descriptionId = useId();
  const hasDescription = props.description !== undefined;

  return (
    <dialog
      {...dialogProps}
      aria-labelledby={titleId}
      aria-describedby={hasDescription ? descriptionId : undefined}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-lg bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/60"
    >
      {props.open ? (
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {props.title}
            </h2>
            {hasDescription ? (
              <p id={descriptionId} className="mt-1 text-sm text-slate-600">
                {props.description}
              </p>
            ) : null}
          </div>
          {props.children}
          <div className="flex flex-wrap justify-end gap-2">{props.footer}</div>
        </div>
      ) : null}
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, and whether it can be undone. */
  description: string;
  confirmLabel: string;
  /** `danger` for destructive actions, which is what this dialog is mostly for. */
  confirmVariant?: Extract<ButtonVariant, 'primary' | 'danger'>;
  /** True while the confirmed action runs; the dialog stays open and locked. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ignoreClose() {
  // A running action cannot be abandoned half way by closing its dialog.
}

/** Asks before a destructive action. Focus starts on Cancel, the safe choice. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const busy = props.busy ?? false;
  return (
    <Dialog
      open={props.open}
      onClose={busy ? ignoreClose : props.onCancel}
      title={props.title}
      description={props.description}
      footer={
        <>
          <Button onClick={props.onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={props.confirmVariant ?? 'danger'}
            loading={busy}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </Button>
        </>
      }
    />
  );
}
