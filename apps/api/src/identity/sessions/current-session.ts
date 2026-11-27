import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

const CURRENT_SESSION_ID = Symbol('currentSessionId');

type RequestWithSession = Request & { [CURRENT_SESSION_ID]?: string };

/** Called by the authenticator once it has accepted a session cookie. */
export function setCurrentSessionId(request: Request, sessionId: string): void {
  (request as RequestWithSession)[CURRENT_SESSION_ID] = sessionId;
}

/**
 * The id of the session that authenticated the request, on a route behind
 * `AuthGuard`; `null` when the caller used an API key.
 */
export const CurrentSessionId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null => {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    return request[CURRENT_SESSION_ID] ?? null;
  },
);
