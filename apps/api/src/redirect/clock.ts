import { Injectable } from '@nestjs/common';

/** The time, as a dependency, so expiry can be tested without waiting. */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
