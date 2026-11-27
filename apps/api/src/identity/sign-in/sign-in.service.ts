import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import type { SignInRequest } from '@url-shortener/contracts/identity';
import { DataSource } from 'typeorm';
import { SYSTEM_ACTOR, userActor } from '../../audit/audit-actor.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { CounterName, Metrics } from '../../common/metrics/metrics.js';
import { User } from '../../database/entities/user.entity.js';
import { AccountAction, AccountAudit } from '../account/account-audit.js';
import { PasswordHasher } from '../passwords/password-hasher.js';
import { Sessions, type IssuedSession } from '../sessions/sessions.js';
import { SignInLockout } from './sign-in-lockout.js';

export interface SignInClient {
  /** The client's network address, as the edge reported it. */
  address: string;
  userAgent: string | undefined;
}

/** Sign-in and sign-out (PRD section 6, ID-2). */
@Injectable()
export class SignInService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
    private readonly lockout: SignInLockout,
    private readonly sessions: Sessions,
    private readonly accountAudit: AccountAudit,
    private readonly metrics: Metrics,
  ) {}

  async signIn(
    credentials: SignInRequest,
    client: SignInClient,
  ): Promise<IssuedSession> {
    const { email, password } = credentials;
    if (await this.lockout.isLocked(email, client.address)) {
      this.count('locked');
      throw this.refusal();
    }

    const account = await this.dataSource
      .getRepository(User)
      .findOneBy({ email });
    const user = await this.admit(account, password);
    if (user === null) {
      await this.recordFailure(account, email, client.address);
      throw this.refusal();
    }

    await this.lockout.recordSuccess(email, client.address);
    const issued = await this.dataSource.transaction(async (manager) => {
      const session = await this.sessions.issue(
        manager,
        user.id,
        client.userAgent,
      );
      await this.accountAudit.record(
        manager,
        user.id,
        AccountAction.SignedIn,
        userActor(user.id),
      );
      return session;
    });
    this.count('success');
    return issued;
  }

  async signOut(userId: string, sessionId: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      if (sessionId !== null) {
        await this.sessions.revoke(manager, userId, sessionId);
      }
      await this.accountAudit.record(
        manager,
        userId,
        AccountAction.SignedOut,
        userActor(userId),
      );
    });
  }

  /**
   * The account, only when the password is right and the account is verified
   * and enabled. The password is checked even when there is no such account,
   * so the time a refusal takes does not say why.
   */
  private async admit(
    account: User | null,
    password: string,
  ): Promise<User | null> {
    if (account === null) {
      await this.hasher.verifyAgainstNothing(password);
      return null;
    }
    const passwordMatches = await this.hasher.verify(
      password,
      account.passwordHash,
    );
    const usable =
      account.emailVerifiedAt !== null && account.disabledAt === null;
    return passwordMatches && usable ? account : null;
  }

  private async recordFailure(
    user: User | null,
    email: string,
    address: string,
  ): Promise<void> {
    const lock = await this.lockout.recordFailure(email, address);
    this.count('failure');
    if (lock !== null && user !== null) {
      await this.accountAudit.record(
        this.dataSource.manager,
        user.id,
        AccountAction.SignInLocked,
        SYSTEM_ACTOR,
        { scope: lock },
      );
    }
  }

  /** One answer for every refusal, a lockout included (PRD section 6). */
  private refusal(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.Unauthenticated,
      'Wrong email or password',
    );
  }

  private count(result: 'success' | 'failure' | 'locked'): void {
    this.metrics.incrementCounter(CounterName.SignIns, { result });
  }
}
