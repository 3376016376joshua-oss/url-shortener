import { Injectable } from '@nestjs/common';
import { Authenticator } from './authenticator.js';

/**
 * Placeholder until the identity workstream ships sessions and API keys.
 * It recognises nobody, so every protected route answers 401.
 */
@Injectable()
export class DenyAllAuthenticator extends Authenticator {
  authenticate(): Promise<null> {
    return Promise.resolve(null);
  }
}
