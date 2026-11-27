import { Injectable } from '@nestjs/common';

/** The one place analytics reads the time, so tests can set it. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
