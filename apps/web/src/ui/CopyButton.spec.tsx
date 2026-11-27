import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton.js';

function stubClipboard(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
}

describe('CopyButton', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('copies its value and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(<CopyButton value="sv_4f9c" label="Copy TXT record value" />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Copy TXT record value' }),
    );

    expect(writeText).toHaveBeenCalledWith('sv_4f9c');
    expect(screen.getByRole('button').textContent).toBe('Copied');
    expect(screen.getByRole('status').textContent).toBe('Copied to clipboard');
  });

  it('says so when the browser refuses', async () => {
    stubClipboard(() => Promise.reject(new Error('Not allowed')));
    render(<CopyButton value="sv_4f9c" label="Copy TXT record value" />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button').textContent).toBe('Copy failed');
    expect(screen.getByRole('status').textContent).toBe(
      'Could not copy to the clipboard',
    );
  });
});
