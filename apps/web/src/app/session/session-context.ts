import { createContext, useContext } from 'react';
import type { Session } from '../../api/session.js';

export const SessionContext = createContext<Session | null>(null);

/**
 * The signed-in user and their workspaces. Available on every account and
 * workspace page, because those render only once a session has loaded.
 */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession() is only available on signed-in pages');
  }
  return session;
}
