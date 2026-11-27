import { Injectable } from '@nestjs/common';

/**
 * The current time, as a provider: every lifetime rule (sessions, tokens,
 * invitations, API keys) reads it here, so a test can move time forward.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
