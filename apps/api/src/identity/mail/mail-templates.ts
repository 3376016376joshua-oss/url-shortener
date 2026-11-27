import { EmailLinkPath } from '@url-shortener/contracts/identity';
import type { MailMessage } from './mailer.js';

const link = (appUrl: string, path: EmailLinkPath, token: string): string =>
  `${appUrl}${path}?token=${encodeURIComponent(token)}`;

export function verificationMail(
  appUrl: string,
  to: string,
  name: string,
  token: string,
): MailMessage {
  return {
    to,
    subject: 'Confirm your email address',
    text: [
      `Hi ${name},`,
      '',
      'Confirm your email address to finish creating your account:',
      link(appUrl, EmailLinkPath.VerifyEmail, token),
      '',
      'The link works once and expires in 24 hours.',
      'If you did not sign up, you can ignore this email.',
    ].join('\n'),
  };
}

/** Sent instead of a verification link when the address already has an account. */
export function accountExistsMail(appUrl: string, to: string): MailMessage {
  return {
    to,
    subject: 'You already have an account',
    text: [
      'Someone, probably you, tried to sign up with this email address,',
      'which already has an account. Sign in instead:',
      appUrl,
      '',
      'If you forgot your password, you can reset it from the sign-in page.',
      'If this was not you, you can ignore this email.',
    ].join('\n'),
  };
}

export function passwordResetMail(
  appUrl: string,
  to: string,
  name: string,
  token: string,
): MailMessage {
  return {
    to,
    subject: 'Reset your password',
    text: [
      `Hi ${name},`,
      '',
      'Choose a new password:',
      link(appUrl, EmailLinkPath.ResetPassword, token),
      '',
      'The link works once and expires in 1 hour.',
      'If you did not ask for this, you can ignore this email.',
    ].join('\n'),
  };
}

export function invitationMail(
  appUrl: string,
  to: string,
  invitation: { workspaceName: string; inviterName: string; token: string },
): MailMessage {
  return {
    to,
    subject: `Join ${invitation.workspaceName}`,
    text: [
      `${invitation.inviterName} invited you to the workspace "${invitation.workspaceName}".`,
      '',
      'Sign in or sign up with this email address, then accept the invitation:',
      link(appUrl, EmailLinkPath.AcceptInvitation, invitation.token),
      '',
      'The invitation expires in 7 days.',
    ].join('\n'),
  };
}
