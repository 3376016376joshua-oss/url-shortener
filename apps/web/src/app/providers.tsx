import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createApiClient, type ApiClient } from '../api/api-client.js';
import { ApiClientProvider } from '../api/api-context.js';
import { sessionQueryKey } from '../api/session.js';
import { ToastProvider } from '../ui/index.js';

/**
 * Ends the session in memory. The shell responds to the cleared session by
 * sending the visitor to sign in. Everything else that was loaded is
 * dropped too, so the next person to sign in on this page never sees it.
 */
function endSession(queryClient: QueryClient): void {
  const hadSession = queryClient.getQueryData(sessionQueryKey) != null;
  queryClient.setQueryData(sessionQueryKey, null);
  // Only when a session really ended: a `401` to someone already signed
  // out, such as a wrong password, has nothing to forget.
  if (hadSession) {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== sessionQueryKey[0],
    });
  }
}

/**
 * The API client of a running dashboard. Any `401` means the session is
 * gone, whatever the request was.
 */
export function createSessionAwareApiClient(
  queryClient: QueryClient,
  fetchFn: typeof fetch,
): ApiClient {
  return createApiClient({
    fetch: fetchFn,
    onUnauthenticated: () => endSession(queryClient),
  });
}

export interface AppProvidersProps {
  queryClient: QueryClient;
  apiClient: ApiClient;
  children: ReactNode;
}

/** Everything a page may reach for: server state, the API, and toasts. */
export function AppProviders(props: AppProvidersProps) {
  return (
    <QueryClientProvider client={props.queryClient}>
      <ApiClientProvider client={props.apiClient}>
        <ToastProvider>{props.children}</ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
