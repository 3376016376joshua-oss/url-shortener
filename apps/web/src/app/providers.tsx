import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createApiClient, type ApiClient } from '../api/api-client.js';
import { ApiClientProvider } from '../api/api-context.js';
import { sessionQueryKey } from '../api/session.js';
import { ToastProvider } from '../ui/index.js';

/**
 * The API client of a running dashboard. Any `401` means the session is
 * gone, so it clears the cached session, and the shell responds by sending
 * the visitor to sign in.
 */
export function createSessionAwareApiClient(
  queryClient: QueryClient,
  fetchFn: typeof fetch,
): ApiClient {
  return createApiClient({
    fetch: fetchFn,
    onUnauthenticated: () => queryClient.setQueryData(sessionQueryKey, null),
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
