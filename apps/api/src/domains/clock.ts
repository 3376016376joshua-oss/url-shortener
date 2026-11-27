import { Injectable } from '@nestjs/common';

/** The current time, injected so the verification schedule can be tested. */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
