import type { Request } from 'express';
import type { Principal } from './principal.js';

/** How a request's credentials (session cookie or API key) become a principal. */
export abstract class Authenticator {
  /** Resolves to `null` when the request carries no valid credentials. */
  abstract authenticate(request: Request): Promise<Principal | null>;
}
