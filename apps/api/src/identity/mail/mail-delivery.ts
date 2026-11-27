import { Injectable, Logger } from '@nestjs/common';
import { Mailer, type MailMessage } from './mailer.js';

/** Tries in quick succession, then gives up: the person asks again. */
const MAX_ATTEMPTS = 3;

/**
 * Hands mail to the mailer off the request path. A request that sends mail
 * answers the same way, and as fast, whether or not the mail goes out, so a
 * mail outage neither fails sign-up nor reveals which addresses got mail.
 */
@Injectable()
export class MailDelivery {
  private readonly logger = new Logger(MailDelivery.name);

  constructor(private readonly mailer: Mailer) {}

  /** Returns immediately and never throws. */
  deliver(message: MailMessage): void {
    void this.attempt(message);
  }

  /** Resolves to whether the message was handed over. Never rejects. */
  async attempt(message: MailMessage): Promise<boolean> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await this.mailer.send(message);
        return true;
      } catch (error) {
        lastError = error;
      }
    }
    // The address is personal data and the body holds a token: log neither.
    this.logger.error(
      `Mail "${message.subject}" not sent after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`,
    );
    return false;
  }
}
