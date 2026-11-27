import { Navigate, Outlet, useLocation } from 'react-router';
import { useSessionQuery } from '../../api/session.js';
import { ErrorState, LoadingState } from '../../ui/index.js';
import { FullPage } from '../layout/FullPage.js';
import { signInPath } from '../paths.js';
import { SessionContext } from './session-context.js';

/**
 * The gate in front of every signed-in page. It loads the session once and
 * sends a visitor without one to sign in, remembering where they were going.
 */
export function RequireSession() {
  const query = useSessionQuery();
  const location = useLocation();

  // A session that has loaded keeps the dashboard up when a later refresh
  // fails; a `401` clears it, which is what sends the visitor to sign in.
  //
  // "Signed out" is believed only as the latest answer. While it is being
  // asked again, as it is right after signing in, the gate waits rather than
  // send the visitor back to the page they just signed in on.
  const isSettled = !query.isFetching && !query.isError;
  if (query.data === undefined || (query.data === null && !isSettled)) {
    return (
      <FullPage>
        {query.isError && !query.isFetching ? (
          <ErrorState
            title="Your account could not be loaded"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <LoadingState label="Loading your account" />
        )}
      </FullPage>
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
