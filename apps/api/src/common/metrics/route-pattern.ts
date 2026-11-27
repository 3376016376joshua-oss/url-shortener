import type { Request } from 'express';

/** Stands in for the route of a request that matched none. */
export const UNMATCHED_ROUTE = 'unmatched';

/**
 * The pattern of the route that handled a request, such as `/:code`. Unlike
 * the path it has a bounded number of values, and it never holds an id.
 */
export function routePattern(request: Request): string {
  const route = request.route as { path?: unknown } | undefined;
  return typeof route?.path === 'string' ? route.path : UNMATCHED_ROUTE;
}
