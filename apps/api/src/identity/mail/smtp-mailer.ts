import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Env } from '../../config/env.schema.js';
import { Mailer, type MailMessage } from './mailer.js';

/** Bounds one attempt, so a dead mail server cannot hold work for long. */
const CONNECTION_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS = 10_000;

/** Sends through the SMTP server named by `SMTP_URL`. */
@Injectable()
export class SmtpMailer extends Mailer implements OnApplicationShutdown {
  private readonly transport;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.transport = createTransport(
      {
        url: config.get('SMTP_URL', { infer: true }),
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: CONNECTION_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
      },
      { from: config.get('MAIL_FROM', { infer: true }) },
    );
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail(message);
  }

  onApplicationShutdown(): void {
    this.transport.close();
  }
}
