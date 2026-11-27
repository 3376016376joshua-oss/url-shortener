import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from './api-client.js';

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider(props: {
  client: ApiClient;
  children: ReactNode;
}) {
  return (
    <ApiClientContext value={props.client}>{props.children}</ApiClientContext>
  );
}

/** The API client of the running dashboard. Call it from query functions. */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (client === null) {
    throw new Error('useApiClient() needs an <ApiClientProvider> above it');
  }
  return client;
}
