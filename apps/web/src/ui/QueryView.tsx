import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState, LoadingState } from './states.js';

export interface QueryViewProps<Data> {
  query: Pick<UseQueryResult<Data>, 'status' | 'data' | 'error' | 'refetch'>;
  loadingLabel?: string;
  /** What failed, for the error state's heading. */
  errorTitle?: string;
  /** Tells whether loaded data counts as nothing, for example an empty list. */
  isEmpty?: (data: Data) => boolean;
  /** Shown instead of `children` when `isEmpty` says so. */
  empty?: ReactNode;
  children: (data: Data) => ReactNode;
}

/**
 * Renders a query in each of its states, so a view cannot forget one:
 * loading, failed with a retry, empty, or loaded.
 *
 * Data that has loaded once stays on screen when a later refresh fails,
 * because what the person was reading is worth more than an error page.
 */
export function QueryView<Data>(props: QueryViewProps<Data>) {
  const { query } = props;
  if (query.data === undefined) {
    return query.status === 'error' ? (
      <ErrorState
        title={props.errorTitle}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    ) : (
      <LoadingState label={props.loadingLabel} />
    );
  }
  if (props.isEmpty?.(query.data) === true) {
    return props.empty;
  }
  return props.children(query.data);
}
