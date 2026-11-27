import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { Authenticator } from './authenticator.js';
import { DenyAllAuthenticator } from './deny-all-authenticator.js';

/**
 * Accounts, sessions, and authentication (PRD section 6). Global, because
 * every protected route uses `AuthGuard`. Built by the identity workstream.
 */
@Global()
@Module({
  providers: [
    { provide: Authenticator, useClass: DenyAllAuthenticator },
    AuthGuard,
  ],
  exports: [Authenticator, AuthGuard],
})
export class IdentityModule {}
