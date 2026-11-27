import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import type { RedirectResult } from './redirect.service.js';

/** How a short link that does not redirect is reported, as JSON or as a page. */
export interface RedirectFailure {
  status: HttpStatus;
  code: ErrorCode;
  /** The `message` of the JSON error body. */
  message: string;
  /** The heading of the page shown to a browser. */
  title: string;
  /** What the page tells the visitor to do next. */
  advice: string;
}

const NOT_FOUND: RedirectFailure = {
  status: HttpStatus.NOT_FOUND,
  code: ErrorCode.LinkNotFound,
  message: 'Short link not found',
  title: 'Link not found',
  advice:
    'This short link does not exist. Check the address for typos, or ask whoever shared it for a new one.',
};

const EXPIRED: RedirectFailure = {
  status: HttpStatus.GONE,
  code: ErrorCode.LinkExpired,
  message: 'This link has expired',
  title: 'This link has expired',
  advice:
    'It was set to stop working after a certain date. Ask whoever shared it for a new one.',
};

const DISABLED: RedirectFailure = {
  status: HttpStatus.GONE,
  code: ErrorCode.LinkDisabled,
  message: 'This link has been disabled',
  title: 'This link is no longer available',
  advice:
    'It has been turned off and no longer leads anywhere. Ask whoever shared it for a new one.',
};

export function describeFailure(
  result: Exclude<RedirectResult, { outcome: 'found' }>,
): RedirectFailure {
  if (result.outcome === 'not_found') {
    return NOT_FOUND;
  }
  return result.reason === 'expired' ? EXPIRED : DISABLED;
}
