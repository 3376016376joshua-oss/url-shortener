import { useEffect, useState } from 'react';
import { Button } from './Button.js';
import { CheckIcon, CopyIcon } from './icons.js';

/** How long the button keeps saying what happened before it resets. */
const FEEDBACK_MS = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

const BUTTON_TEXT: Record<CopyState, string> = {
  idle: 'Copy',
  copied: 'Copied',
  failed: 'Copy failed',
};

const ANNOUNCEMENT: Record<CopyState, string> = {
  idle: '',
  copied: 'Copied to clipboard',
  failed: 'Could not copy to the clipboard',
};

export interface CopyButtonProps {
  /** The text put on the clipboard. */
  value: string;
  /** Says what is copied, for example "Copy TXT record value". Start it with "Copy". */
  label: string;
}

/** Copies a value to the clipboard and says whether it worked. */
export function CopyButton(props: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') {
      return;
    }
    const timer = setTimeout(() => setState('idle'), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.value);
      setState('copied');
    } catch {
      // The browser refused, for example on a page not served over HTTPS.
      // The button says so, and the value stays on screen to copy by hand.
      setState('failed');
    }
  };

  return (
    // `relative` keeps the hidden status inside whatever scrolls the button.
    <span className="relative inline-flex">
      <Button size="sm" aria-label={props.label} onClick={() => void copy()}>
        {state === 'copied' ? (
          <CheckIcon className="size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
        {BUTTON_TEXT[state]}
      </Button>
      <span role="status" className="sr-only">
        {ANNOUNCEMENT[state]}
      </span>
    </span>
  );
}
