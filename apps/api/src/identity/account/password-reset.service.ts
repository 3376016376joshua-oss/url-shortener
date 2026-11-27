import { Injectable, Logger } from '@nestjs/common';
import type { PasswordResetConfirmRequest } from '@url-shortener/contracts/identity';
import { DataSource } from 'typeorm';
import { userActor } from '../../audit/audit-actor.js';
import { EmailTokenPurpose } from '../../database/entities/email-token.entity.js';
import { User } from '../../database/entities/user.entity.js';
import { AccountMails } from '../mail/account-mails.js';
import { MailKind, MailThrottle } from '../mail/mail-throttle.js';
import { PasswordHasher } from '../passwords/password-hasher.js';
import { Sessions } from '../sessions/sessions.js';
import { SignInLockout } from '../sign-in/sign-in-lockout.js';
import { EmailTokens } from '../tokens/email-tokens.js';
import { invalidLinkError } from '../tokens/invalid-link.js';
import { AccountAction, AccountAudit } from './account-audit.js';

/** Password reset by emailed token (PRD section 6, ID-3). */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
    private readonly tokens: EmailTokens,
    private readonly throttle: MailThrottle,
    private readonly mails: AccountMails,
    private readonly sessions: Sessions,
    private readonly lockout: SignInLockout,
    private readonly accountAudit: AccountAudit,
  ) {}

  /** Mails a reset link to a usable account, and says nothing either way. */
  async request(email: string): Promise<void> {
    if (!(await this.throttle.acquire(MailKind.PasswordReset, email))) {
      return;
    }
    const user = await this.dataSource.getRepository(User).findOneBy({ email });
    if (
      user === null ||
      user.emailVerifiedAt === null ||
      user.disabledAt !== null
    ) {
      return;
    }
    const token = await this.dataSource.transaction((manager) =>
      this.tokens.issue(manager, user.id, EmailTokenPurpose.ResetPassword),
    );
    this.mails.sendPasswordReset(user, token);
  }

  /** Sets the new password and signs the account out everywhere. */
  async confirm(request: PasswordResetConfirmRequest): Promise<void> {
    const passwordHash = await this.hasher.hash(request.password);
    const email = await this.dataSource.transaction(async (manager) => {
      const userId = await this.tokens.consume(
        manager,
        request.token,
        EmailTokenPurpose.ResetPassword,
      );
      const users = manager.getRepository(User);
      const user =
        userId === null ? null : await users.findOneBy({ id: userId });
      if (user === null) {
        throw invalidLinkError();
      }
      await users.update({ id: user.id }, { passwordHash });
      await this.sessions.revokeAll(manager, user.id);
      await this.accountAudit.record(
        manager,
        user.id,
        AccountAction.PasswordReset,
        userActor(user.id),
      );
      return user.email;
    });
    await this.liftLockout(email);
  }

  /**
   * The password is already changed when this runs, so a Redis failure here
   * must not fail the reset: at worst a lock runs out its 15 minutes.
   */
  private async liftLockout(email: string): Promise<void> {
    try {
      await this.lockout.clear(email);
    } catch (error) {
      this.logger.warn(
        `Sign-in lockout not lifted after a reset: ${String(error)}`,
      );
    }
  }
}
