import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { MailDelivery } from './mail-delivery.js';
import {
  accountExistsMail,
  invitationMail,
  passwordResetMail,
  verificationMail,
} from './mail-templates.js';

interface Recipient {
  email: string;
  name: string;
}

/** The mails the platform sends. Each call returns at once (see MailDelivery). */
@Injectable()
export class AccountMails {
  private readonly appUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly delivery: MailDelivery,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  sendVerification(recipient: Recipient, token: string): void {
    this.delivery.deliver(
      verificationMail(this.appUrl, recipient.email, recipient.name, token),
    );
  }

  sendAccountExists(email: string): void {
    this.delivery.deliver(accountExistsMail(this.appUrl, email));
  }

  sendPasswordReset(recipient: Recipient, token: string): void {
    this.delivery.deliver(
      passwordResetMail(this.appUrl, recipient.email, recipient.name, token),
    );
  }

  sendInvitation(
    email: string,
    invitation: { workspaceName: string; inviterName: string; token: string },
  ): void {
    this.delivery.deliver(invitationMail(this.appUrl, email, invitation));
  }
}
