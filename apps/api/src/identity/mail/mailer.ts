export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** How mail leaves the platform. Tests replace it to read what was sent. */
export abstract class Mailer {
  /** One attempt. Rejects when the message could not be handed over. */
  abstract send(message: MailMessage): Promise<void>;
}
