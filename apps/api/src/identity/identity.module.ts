import { Global, Module } from '@nestjs/common';
import { AccountAudit } from './account/account-audit.js';
import { IdentityReader } from './account/identity-reader.js';
import { PasswordResetService } from './account/password-reset.service.js';
import { ProfileService } from './account/profile.service.js';
import { SignUpService } from './account/sign-up.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { Authenticator } from './authenticator.js';
import { Clock } from './clock.js';
import { CredentialAuthenticator } from './credential-authenticator.js';
import { ExpiredCredentialsJob } from './expired-credentials.job.js';
import { AccountMails } from './mail/account-mails.js';
import { MailDelivery } from './mail/mail-delivery.js';
import { MailThrottle } from './mail/mail-throttle.js';
import { Mailer } from './mail/mailer.js';
import { SmtpMailer } from './mail/smtp-mailer.js';
import { MeController } from './me.controller.js';
import { PasswordHasher } from './passwords/password-hasher.js';
import { SessionCookie } from './sessions/session-cookie.js';
import { Sessions } from './sessions/sessions.js';
import { SignInLockout } from './sign-in/sign-in-lockout.js';
import { SignInService } from './sign-in/sign-in.service.js';
import { EmailTokens } from './tokens/email-tokens.js';

/**
 * Accounts, sessions, and authentication (PRD section 6). Global, because
 * every protected route uses `AuthGuard`. Also exports what the workspaces
 * module needs to send invitations and judge lifetimes.
 */
@Global()
@Module({
  controllers: [AuthController, MeController],
  providers: [
    { provide: Authenticator, useClass: CredentialAuthenticator },
    { provide: Mailer, useClass: SmtpMailer },
    AuthGuard,
    Clock,
    PasswordHasher,
    Sessions,
    SessionCookie,
    EmailTokens,
    MailDelivery,
    MailThrottle,
    AccountMails,
    SignInLockout,
    AccountAudit,
    IdentityReader,
    SignUpService,
    SignInService,
    PasswordResetService,
    ProfileService,
    ExpiredCredentialsJob,
  ],
  exports: [
    Authenticator,
    AuthGuard,
    Clock,
    AccountMails,
    MailThrottle,
    Mailer,
  ],
})
export class IdentityModule {}
