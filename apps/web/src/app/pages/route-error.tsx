import { useRouteError } from 'react-router';
import { Button, ErrorState } from '../../ui/index.js';
import { FullPage } from '../layout/FullPage.js';

/**
 * What a page shows when rendering it threw. The layout around it stays up,
 * so the rest of the dashboard is still one click away.
 */
export function RouteErrorState() {
  const error = useRouteError();
  return (
    <div className="flex flex-col items-center gap-4">
      <ErrorState
        title="This page ran into a problem"
        error={error}
        className="w-full"
      />
      {/* A reload also recovers from a page left open across a release. */}
      <Button onClick={() => window.location.reload()}>Reload the page</Button>
    </div>
  );
}

/** The same, for a failure outside any layout. */
export function RouteErrorPage() {
  return (
    <FullPage>
      <RouteErrorState />
    </FullPage>
  );
}
