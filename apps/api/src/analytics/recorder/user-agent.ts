import Bowser from 'bowser';
import { isbot } from 'isbot';
import { DeviceType } from '../../database/entities/click-event.entity.js';

/** What is recorded when the user agent does not name a family. */
export const UNKNOWN_FAMILY = 'Unknown';
const MAX_FAMILY_LENGTH = 32;
/** Header values longer than this are not worth parsing. */
const MAX_PARSED_LENGTH = 1_024;

export interface ReducedUserAgent {
  deviceType: DeviceType;
  /** Family name without a version, for example `iOS`. */
  os: string;
  /** Family name without a version, for example `Safari`. */
  browser: string;
}

const UNKNOWN: ReducedUserAgent = {
  deviceType: DeviceType.Other,
  os: UNKNOWN_FAMILY,
  browser: UNKNOWN_FAMILY,
};

const DEVICE_TYPES: Readonly<Record<string, DeviceType>> = {
  desktop: DeviceType.Desktop,
  mobile: DeviceType.Mobile,
  tablet: DeviceType.Tablet,
  bot: DeviceType.Bot,
};

function family(name: string | undefined): string {
  const trimmed = (name ?? '').trim().slice(0, MAX_FAMILY_LENGTH);
  return trimmed === '' ? UNKNOWN_FAMILY : trimmed;
}

/**
 * Reduces a raw User-Agent header to a device type and two family names.
 * Crawlers, monitors, and link-preview fetchers come back as `bot`, which
 * keeps them out of every count. Total: never throws, whatever the header.
 */
export function reduceUserAgent(userAgent: string | null): ReducedUserAgent {
  const header = (userAgent ?? '').trim().slice(0, MAX_PARSED_LENGTH);
  if (header === '') {
    return UNKNOWN;
  }
  try {
    const { browser, os, platform } = Bowser.parse(header);
    const parsedType = DEVICE_TYPES[platform.type ?? ''] ?? DeviceType.Other;
    return {
      deviceType: isbot(header) ? DeviceType.Bot : parsedType,
      os: family(os.name),
      browser: family(browser.name),
    };
  } catch {
    return UNKNOWN;
  }
}
