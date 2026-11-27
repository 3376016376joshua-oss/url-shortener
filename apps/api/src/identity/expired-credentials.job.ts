import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DataSource, LessThan } from 'typeorm';
import { JobScheduler } from '../common/jobs/job-scheduler.js';
import { EmailToken } from '../database/entities/email-token.entity.js';
import { Session } from '../database/entities/session.entity.js';
import { WorkspaceInvitation } from '../database/entities/workspace-invitation.entity.js';
import { Clock } from './clock.js';
import { SESSION_IDLE_LIFETIME_MS } from './sessions/sessions.js';

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Deletes sessions, mailed tokens, and invitations that have expired. None
 * of them works after its expiry whether or not this runs; the job only
 * keeps dead rows from piling up.
 */
@Injectable()
export class ExpiredCredentialsJob implements OnApplicationBootstrap {
  constructor(
    private readonly scheduler: JobScheduler,
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    this.scheduler.register({
      name: 'identity.purge-expired-credentials',
      everyMs: DAY_MS,
      run: () => this.run(),
    });
  }

  async run(): Promise<void> {
    const now = this.clock.now();
    const idleSince = new Date(now.getTime() - SESSION_IDLE_LIFETIME_MS);
    const sessions = this.dataSource.getRepository(Session);
    await sessions.delete({ expiresAt: LessThan(now) });
    await sessions.delete({ lastSeenAt: LessThan(idleSince) });
    await this.dataSource
      .getRepository(EmailToken)
      .delete({ expiresAt: LessThan(now) });
    await this.dataSource
      .getRepository(WorkspaceInvitation)
      .delete({ expiresAt: LessThan(now) });
  }
}
