/** The stream reduced click events travel through. */
export const CLICK_STREAM_KEY = 'clicks';
/** The one consumer group; every worker process is a consumer in it. */
export const CLICK_CONSUMER_GROUP = 'click-consumers';

const HOURS = 3_600;
/**
 * How long a day's salt and visitor sketches live. Long enough to outlast the
 * day they belong to and the consumer catching up, short enough that nothing
 * derived from a visitor survives two days.
 */
export const VISITOR_DATA_TTL_SECONDS = 48 * HOURS;

/** The HyperLogLog of one link's visitors on one UTC day. */
export function visitorSketchKey(linkId: string, day: string): string {
  return `visitors:${linkId}:${day}`;
}

/** The random salt that keys every visitor hash of one UTC day. */
export function visitorSaltKey(day: string): string {
  return `visitor-salt:${day}`;
}
