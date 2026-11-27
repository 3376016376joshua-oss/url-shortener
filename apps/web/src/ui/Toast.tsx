import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from './cx.js';

/** Long enough to read a sentence; a toast never carries anything essential. */
const TOAST_VISIBLE_MS = 6000;

export type ToastTone = 'success' | 'error';

export interface ToastInput {
  tone: ToastTone;
  message: string;
}

interface ActiveToast extends ToastInput {
  id: number;
}

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-green-700 bg-green-800 text-white',
  error: 'border-red-700 bg-red-800 text-white',
};

type ShowToast = (toast: ToastInput) => void;

const ToastContext = createContext<ShowToast | null>(null);

function ToastItem(props: {
  toast: ActiveToast;
  onDismiss: (id: number) => void;
}) {
  const { toast, onDismiss } = props;
  // A toast someone is reading, or about to dismiss, does not vanish on them.
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) {
      return;
    }
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss, held]);

  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={cx(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg',
        TONE_CLASSES[toast.tone],
      )}
    >
      <p className="min-w-0 flex-1 wrap-break-word">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="rounded-sm font-medium underline outline-white"
      >
        Dismiss
      </button>
    </div>
  );
}

/**
 * Hosts the dashboard's toasts: brief confirmations of something that just
 * happened. The region is always present, so screen readers announce a toast
 * the moment it is added.
 */
export function ToastProvider(props: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const nextId = useRef(0);

  const show = useCallback<ShowToast>((toast) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { ...toast, id }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext value={show}>
      {props.children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

/** Returns a function that shows a toast, for example after a save succeeds. */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (show === null) {
    throw new Error('useToast() needs a <ToastProvider> above it');
  }
  return show;
}
