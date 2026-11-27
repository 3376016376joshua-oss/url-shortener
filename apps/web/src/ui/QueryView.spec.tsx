import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error.js';
import { QueryView, type QueryViewProps } from './QueryView.js';

type Query = QueryViewProps<string[]>['query'];

const refetch = vi.fn<Query['refetch']>();

function renderView(query: Partial<Query>) {
  return render(
    <QueryView
      query={{ data: undefined, error: null, refetch, ...query } as Query}
      loadingLabel="Loading links"
      errorTitle="The links could not be loaded"
      isEmpty={(links) => links.length === 0}
      empty={<p>No links yet</p>}
    >
      {(links) => <p>{links.join(', ')}</p>}
    </QueryView>,
  );
}

const failure = new ApiError({
  status: 503,
  code: 'SERVICE_UNAVAILABLE',
  message: 'Down',
  requestId: 'req-3',
  retryAfterSeconds: null,
});

describe('QueryView', () => {
  afterEach(() => {
    cleanup();
    refetch.mockClear();
  });

  it('says what is loading', () => {
    renderView({ status: 'pending' });

    expect(screen.getByRole('status').textContent).toBe('Loading links');
  });

  it('shows a failure with its request id and retries on request', async () => {
    renderView({ status: 'error', error: failure });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The links could not be loaded');
    expect(alert.textContent).toContain('req-3');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows the empty state for data that counts as nothing', () => {
    renderView({ status: 'success', data: [] });

    expect(screen.getByText('No links yet')).toBeDefined();
  });

  it('renders loaded data', () => {
    renderView({ status: 'success', data: ['launch', 'jobs'] });

    expect(screen.getByText('launch, jobs')).toBeDefined();
  });

  it('keeps loaded data on screen when a later refresh fails', () => {
    renderView({ status: 'error', error: failure, data: ['launch'] });

    expect(screen.getByText('launch')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
