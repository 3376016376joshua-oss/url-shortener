import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast.js';

function SaveButton() {
  const showToast = useToast();
  return (
    <button
      type="button"
      onClick={() => showToast({ tone: 'success', message: 'Link saved' })}
    >
      Save
    </button>
  );
}

function renderToasts() {
  render(
    <ToastProvider>
      <SaveButton />
    </ToastProvider>,
  );
  return screen.getByRole('region', { name: 'Notifications' });
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('announces a toast in a region that was already on the page', () => {
    const region = renderToasts();
    expect(region.getAttribute('aria-live')).toBe('polite');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(region.textContent).toContain('Link saved');
  });

  it('removes a toast after a while', () => {
    const region = renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    act(() => {
      vi.advanceTimersByTime(5_999);
    });
    expect(region.textContent).toContain('Link saved');
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(region.textContent).not.toContain('Link saved');
  });

  it('keeps a toast for as long as it is pointed at or focused', () => {
    const region = renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });

    fireEvent.focus(dismiss);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(region.textContent).toContain('Link saved');

    fireEvent.blur(dismiss);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(region.textContent).not.toContain('Link saved');
  });

  it('removes only the toast that was dismissed', () => {
    const region = renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const [firstDismiss] = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(firstDismiss as HTMLElement);

    expect(screen.getAllByText('Link saved')).toHaveLength(1);
    expect(region.textContent).toContain('Link saved');
  });

  it('needs its provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      // React reports the render error it caught; the test expects it.
    });

    expect(() => render(<SaveButton />)).toThrow(
      'useToast() needs a <ToastProvider> above it',
    );
    consoleError.mockRestore();
  });
});
