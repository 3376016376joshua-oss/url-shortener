import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailDelivery } from './mail-delivery.js';
import {
  accountExistsMail,
  invitationMail,
  passwordResetMail,
  verificationMail,
} from './mail-templates.js';
import type { MailMessage } from './mailer.js';

const APP_URL = 'https://app.sho.test';
const MESSAGE: MailMessage = {
  to: 'ada@shortener.test',
  subject: 'Confirm your email address',
  text: 'https://app.sho.test/verify-email?token=secret-token',
};

describe('MailDelivery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands the message over once when the mailer accepts it', async () => {
    const send = vi.fn(() => Promise.resolve());

    const delivered = await new MailDelivery({ send }).attempt(MESSAGE);

    expect(delivered).toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith(MESSAGE);
  });

  it('tries again after a failure', async () => {
    const send = vi
      .fn<(message: MailMessage) => Promise<void>>()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue();

    const delivered = await new MailDelivery({ send }).attempt(MESSAGE);

    expect(delivered).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('gives up after three tries and logs without the address or the token', async () => {
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const send = vi.fn(() => Promise.reject(new Error('connection refused')));

    const delivered = await new MailDelivery({ send }).attempt(MESSAGE);

    expect(delivered).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).toContain('connection refused');
    expect(line).not.toContain('ada@shortener.test');
    expect(line).not.toContain('secret-token');
  });

  it('never throws from deliver, even when the mailer does', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const send = vi.fn(() => Promise.reject(new Error('down')));

    expect(() => new MailDelivery({ send }).deliver(MESSAGE)).not.toThrow();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
  });
});

describe('mail templates', () => {
  it('links the verification mail to the dashboard page, with the token encoded', () => {
    const mail = verificationMail(
      APP_URL,
      'ada@shortener.test',
      'Ada',
      'a+b/c',
    );

    expect(mail.to).toBe('ada@shortener.test');
    expect(mail.text).toContain('Hi Ada,');
    expect(mail.text).toContain(`${APP_URL}/verify-email?token=a%2Bb%2Fc`);
  });

  it('links the reset mail to the reset page', () => {
    const mail = passwordResetMail(APP_URL, 'ada@shortener.test', 'Ada', 'tok');

    expect(mail.text).toContain(`${APP_URL}/reset-password?token=tok`);
    expect(mail.text).toContain('1 hour');
  });

  it('names the workspace and the inviter in an invitation', () => {
    const mail = invitationMail(APP_URL, 'new@shortener.test', {
      workspaceName: 'Marketing',
      inviterName: 'Ada',
      token: 'tok',
    });

    expect(mail.subject).toBe('Join Marketing');
    expect(mail.text).toContain('Ada invited you to the workspace "Marketing"');
    expect(mail.text).toContain(`${APP_URL}/invitations/accept?token=tok`);
  });

  it('puts no token in the notice for an existing account', () => {
    const mail = accountExistsMail(APP_URL, 'ada@shortener.test');

    expect(mail.text).not.toContain('token=');
    expect(mail.text).toContain(APP_URL);
  });
});
