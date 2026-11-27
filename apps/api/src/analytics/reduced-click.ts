import { z } from 'zod';
import {
  ClickSource,
  DeviceType,
} from '../database/entities/click-event.entity.js';

const MAX_FAMILY_LENGTH = 32;
const MAX_HOST_LENGTH = 255;

/**
 * A click after everything personal has been reduced away: the only form in
 * which a click leaves the process that served the redirect. It carries no IP
 * address, no user agent, no full referrer, and no visitor hash.
 */
export interface ReducedClick {
  /** Assigned once by the recorder; makes redelivery harmless. */
  eventId: string;
  clickedAt: Date;
  linkId: string;
  variantId: string | null;
  source: ClickSource;
  country: string;
  deviceType: DeviceType;
  os: string;
  browser: string;
  referrerHost: string | null;
}

/** A stream entry: every field is a string, and absent values are empty. */
export type ClickStreamFields = Record<keyof ReducedClick, string>;

const optional = <Schema extends z.ZodType>(schema: Schema) =>
  z.union([z.literal('').transform(() => null), schema]);

const streamFieldsSchema = z.object({
  eventId: z.uuid(),
  clickedAt: z
    .string()
    .regex(/^\d{1,15}$/)
    .transform((milliseconds) => new Date(Number(milliseconds))),
  linkId: z.uuid(),
  variantId: optional(z.uuid()),
  source: z.enum(ClickSource),
  country: z.string().regex(/^[A-Z]{2}$/),
  deviceType: z.enum(DeviceType),
  os: z.string().min(1).max(MAX_FAMILY_LENGTH),
  browser: z.string().min(1).max(MAX_FAMILY_LENGTH),
  referrerHost: optional(z.string().max(MAX_HOST_LENGTH)),
});

export function toStreamFields(click: ReducedClick): ClickStreamFields {
  return {
    eventId: click.eventId,
    clickedAt: String(click.clickedAt.getTime()),
    linkId: click.linkId,
    variantId: click.variantId ?? '',
    source: click.source,
    country: click.country,
    deviceType: click.deviceType,
    os: click.os,
    browser: click.browser,
    referrerHost: click.referrerHost ?? '',
  };
}

/** Reads a stream entry back, or `null` when it is not a click we wrote. */
export function fromStreamFields(
  fields: Readonly<Record<string, string>>,
): ReducedClick | null {
  const parsed = streamFieldsSchema.safeParse(fields);
  return parsed.success ? parsed.data : null;
}
