import { Injectable } from '@nestjs/common';
import type { SignUpRequest } from '@url-shortener/contracts/identity';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditLog } from '../../audit/audit-log.js';
import { EmailTokenPurpose } from '../../database/entities/email-token.entity.js';
import { User } from '../../database/entities/user.entity.js';
import { Clock } from '../clock.js';
import { AccountMails } from '../mail/account-mails.js';
import { MailKind, MailThrottle } from '../mail/mail-throttle.js';
import { PasswordHasher } from '../passwords/password-hasher.js';
import { EmailTokens } from '../tokens/email-tokens.js';
import { invalidLinkError } from '../tokens/invalid-link.js';
import { createWorkspaceWithOwner } from '../workspace-provisioning.js';

/** Sends the mail a transaction decided on, once that transaction commits. */
type SendMail = () => void;

const WORKSPACE_NAME_SUFFIX = "'s workspace";
const WORKSPACE_NAME_MAX_LENGTH = 100;

function firstWorkspaceName(userName: string): string {
  const room = WORKSPACE_NAME_MAX_LENGTH - WORKSPACE_NAME_SUFFIX.length;
  return `${userName.slice(0, room)}${WORKSPACE_NAME_SUFFIX}`;
}

/** Sign-up and email verification (PRD section 6, ID-1 and ID-5). */
@Injectable()
export class SignUpService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
    private readonly tokens: EmailTokens,
    private readonly throttle: MailThrottle,
    private readonly mails: AccountMails,
    private readonly auditLog: AuditLog,
    private readonly clock: Clock,
  ) {}

  /**
   * Never tells the caller whether the address has an account: every path
   * does the same work, answers the same way, and sends one mail.
   */
  async signUp(request: SignUpRequest): Promise<void> {
    if (!(await this.throttle.acquire(MailKind.Verification, request.email))) {
      return;
    }
    const passwordHash = await this.hasher.hash(request.password);
    const sendMail = await this.dataSource.transaction((manager) =>
      this.register(manager, request, passwordHash),
    );
    sendMail();
  }

  async resendVerification(email: string): Promise<void> {
    if (!(await this.throttle.acquire(MailKind.Verification, email))) {
      return;
    }
    const user = await this.dataSource.getRepository(User).findOneBy({ email });
    if (user === null || user.emailVerifiedAt !== null) {
      return;
    }
    const token = await this.dataSource.transaction((manager) =>
      this.tokens.issue(manager, user.id, EmailTokenPurpose.VerifyEmail),
    );
    this.mails.sendVerification(user, token);
  }

  /** Verifies the address and gives the new account its first workspace. */
  async verifyEmail(token: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const userId = await this.tokens.consume(
        manager,
        token,
        EmailTokenPurpose.VerifyEmail,
      );
      const users = manager.getRepository(User);
      const user =
        userId === null ? null : await users.findOneBy({ id: userId });
      if (user === null) {
        throw invalidLinkError();
      }
      if (user.emailVerifiedAt !== null) {
        return;
      }
      await users.update(
        { id: user.id },
        { emailVerifiedAt: this.clock.now() },
      );
      await createWorkspaceWithOwner(
        manager,
        this.auditLog,
        firstWorkspaceName(user.name),
        user.id,
      );
    });
  }

  private async register(
    manager: EntityManager,
    request: SignUpRequest,
    passwordHash: string,
  ): Promise<SendMail> {
    const { email, name } = request;
    // The unique constraint decides who is new; two sign-ups cannot both win.
    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(User)
      .values({ email, name, passwordHash })
      .orIgnore()
      .returning('id')
      .execute();
    const newUserId = (inserted.raw as Array<{ id: string }>)[0]?.id;
    if (newUserId !== undefined) {
      return this.verificationMail(manager, newUserId, request);
    }

    const users = manager.getRepository(User);
    const existing = await users.findOne({
      where: { email },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing === null || existing.emailVerifiedAt !== null) {
      return () => this.mails.sendAccountExists(email);
    }
    // Nobody has proved they own this address yet, so the newest sign-up
    // wins: an earlier one cannot reserve someone else's address.
    await users.update({ id: existing.id }, { name, passwordHash });
    return this.verificationMail(manager, existing.id, request);
  }

  private async verificationMail(
    manager: EntityManager,
    userId: string,
    recipient: { email: string; name: string },
  ): Promise<SendMail> {
    const token = await this.tokens.issue(
      manager,
      userId,
      EmailTokenPurpose.VerifyEmail,
    );
    return () => this.mails.sendVerification(recipient, token);
  }
}
