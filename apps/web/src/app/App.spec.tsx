import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse } from '../api/testing/fake-fetch.js';
import { App } from './App.js';

describe('App', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('boots, asks the API who is there, and sends a signed-out visitor to sign in', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(errorResponse(401, 'UNAUTHENTICATED', 'Sign in')),
    );
    vi.stubGlobal('fetch', fetchFn);

    render(<App />);

    // No feature serves the sign-in page in this build, so the address
    // itself is the proof of where the shell sent the visitor.
    await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    expect(window.location.pathname).toBe('/sign-in');
    expect(fetchFn).toHaveBeenCalledWith('/api/v1/me', expect.anything());
  });
});
