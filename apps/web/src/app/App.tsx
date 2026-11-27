import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppProviders, createSessionAwareApiClient } from './providers.js';
import { createQueryClient } from './query-client.js';
import { discoverRegistry } from './registry/discover.js';
import { buildRoutes } from './router.js';
import './styles.css';

const queryClient = createQueryClient();
const apiClient = createSessionAwareApiClient(queryClient, (input, init) =>
  window.fetch(input, init),
);
const router = createBrowserRouter(buildRoutes(discoverRegistry()));

/** The dashboard: the shell, with every discovered feature plugged in. */
export function App() {
  return (
    <AppProviders queryClient={queryClient} apiClient={apiClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
