import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import type { ApiClient } from './api-client.js';
import { ApiError } from './api-error.js';
import { useApiClient } from './api-context.js';

/** Lowest to highest, as in PRD section 3. */
export const WORKSPACE_ROLES = ['member', 'admin', 'owner'] as const;
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const sessionWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: workspaceRoleSchema,
});
export type SessionWorkspace = z.infer<typeof sessionWorkspaceSchema>;

/**
 * What the shell reads from `GET /me`: who is signed in and the workspaces
 * they belong to. Only the fields the shell itself needs are named here, and
 * anything else in the response is ignored, so the identity contract can grow
 * without touching the shell.
 */
export const sessionSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
  }),
  workspaces: z.array(sessionWorkspaceSchema),
});
export type Session = z.infer<typeof sessionSchema>;

/** Invalidate this after signing in, so the shell picks up the new session. */
export const sessionQueryKey = ['session'] as const;

/** How long a loaded session is trusted before it is checked again. */
const SESSION_STALE_MS = 60_000;

/** The current session, or `null` when nobody is signed in. */
export async function fetchSession(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Session | null> {
  try {
    return await api.request('GET', '/me', { schema: sessionSchema, signal });
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) {
      return null;
    }
    throw error;
  }
}

/** `data` is the session, `null` when signed out, `undefined` while loading. */
export function useSessionQuery(): UseQueryResult<Session | null> {
  const api = useApiClient();
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: ({ signal }) => fetchSession(api, signal),
    staleTime: SESSION_STALE_MS,
  });
}
