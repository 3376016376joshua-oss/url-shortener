import { Navigate, Outlet, useLocation } from 'react-router';
import { useSessionQuery } from '../../api/session.js';
import { ErrorState, LoadingState } from '../../ui/index.js';
import { signInPath } from '../paths.js';
import { SessionContext } from './session-context.js';

const FULL_PAGE_CLASSES =
  'mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4';

/**
 * The gate in front of every signed-in page. It loads the session once and
 * sends a visitor without one to sign in, remembering where they were going.
 */
export function RequireSession() {
  const query = useSessionQuery();
  const location = useLocation();

  // A session that has loaded keeps the dashboard up when a later refresh
  // fails; a `401` clears it, which is what sends the visitor to sign in.
  if (query.data === undefined) {
    return (
      <main className={FULL_PAGE_CLASSES}>
        {query.status === 'error' ? (
          <ErrorState
            title="Your account could not be loaded"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <LoadingState label="Loading your account" />
        )}
      </main>
    );
  }
  if (query.data === null) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate replace to={signInPath(next)} />;
  }
  return (
    <SessionContext value={query.data}>
      <Outlet />
    </SessionContext>
  );
}
