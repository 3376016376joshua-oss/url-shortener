import { ConsoleLogger } from '@nestjs/common';
import { currentRequestId } from './request-context.js';

/**
 * The application's logger. In production it writes one JSON record per
 * line, and every record written while a request is being handled carries
 * that request's id, so one id finds everything a request logged.
 */
export class AppLogger extends ConsoleLogger {
  protected override getJsonLogObject(
    ...args: Parameters<ConsoleLogger['getJsonLogObject']>
  ): ReturnType<ConsoleLogger['getJsonLogObject']> {
    const record = super.getJsonLogObject(...args);
    const requestId = currentRequestId();
    if (requestId !== undefined) {
      record.requestId = requestId;
    }
    return record;
  }
}

/** JSON for machines in production; readable text everywhere else. */
export function createAppLogger(options: { json: boolean }): AppLogger {
  return new AppLogger({ json: options.json, flattenParams: true });
}
