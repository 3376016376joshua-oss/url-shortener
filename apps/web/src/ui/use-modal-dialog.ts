import {
  useEffect,
  useRef,
  type MouseEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react';

export interface ModalDialogProps {
  ref: RefObject<HTMLDialogElement | null>;
  onCancel: (event: SyntheticEvent) => void;
  onClose: () => void;
  onClick: (event: MouseEvent) => void;
}

/**
 * Drives a native `<dialog>` as a modal from an `open` flag. The element
 * traps focus, makes the page behind it inert, and returns focus to the
 * opener when it closes. Spread the result onto the `<dialog>`.
 *
 * `onClose` is a request: Escape, a press on the backdrop, or the browser
 * closing the dialog by itself all ask, and the owner answers by changing
 * `open`, which stays the one source of truth.
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
): ModalDialogProps {
  const ref = useRef<HTMLDialogElement>(null);

  // After every render, not only when `open` changes: a browser may close a
  // dialog by itself (a second Escape), and the next render must reopen it.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null || dialog.open === open) {
      return;
    }
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  });

  return {
    ref,
    onCancel: (event) => {
      event.preventDefault();
      onClose();
    },
    onClose: () => {
      if (open) {
        onClose();
      }
    },
    // A press on the backdrop lands on the <dialog> itself, never on its content.
    onClick: (event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
  };
}
