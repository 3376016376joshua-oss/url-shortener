import { z } from 'zod';

export const DESTINATION_URL_MAX_LENGTH = 2048;
export const LINK_TITLE_MAX_LENGTH = 200;
export const LINK_SEARCH_MAX_LENGTH = 200;
export const CUSTOM_CODE_MIN_LENGTH = 3;
export const CUSTOM_CODE_MAX_LENGTH = 32;
export const VARIANT_NAME_MAX_LENGTH = 50;
export const VARIANT_WEIGHT_MIN = 1;
export const VARIANT_WEIGHT_MAX = 99;
/** A link's own destination, the control, always keeps at least 1%. */
export const VARIANT_TOTAL_WEIGHT_MAX = 99;
export const ACTIVE_VARIANTS_MAX = 4;
export const LIST_LIMIT_DEFAULT = 25;
export const LIST_LIMIT_MAX = 100;
const CURSOR_MAX_LENGTH = 512;

const CUSTOM_CODE_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]{${CUSTOM_CODE_MIN_LENGTH},${CUSTOM_CODE_MAX_LENGTH}}$`,
);

/** The effective state of a link. `EXPIRED` is derived from `expiresAt`. */
export const LinkStatus = {
  Active: 'ACTIVE',
  Disabled: 'DISABLED',
  Blocked: 'BLOCKED',
  Expired: 'EXPIRED',
} as const;
export type LinkStatus = (typeof LinkStatus)[keyof typeof LinkStatus];
export const linkStatusSchema = z.enum(LinkStatus);

/** The states a workspace may put a link in. */
export const editableLinkStatusSchema = z.enum([
  LinkStatus.Active,
  LinkStatus.Disabled,
]);

const NOT_AN_ABSOLUTE_URL = 'Must be an absolute http or https URL';

/**
 * An absolute http(s) URL. Parsing yields the WHATWG serialisation, which is
 * the form that is stored, so the length limit applies to that form.
 */
export const destinationUrlSchema = z
  // URL parsing alone would also take "http:example.com" for an absolute URL.
  .string()
  .regex(/^\s*https?:\/\//i, { error: NOT_AN_ABSOLUTE_URL })
  .pipe(
    z.url({
      protocol: /^https?$/,
      normalize: true,
      error: NOT_AN_ABSOLUTE_URL,
    }),
  )
  .refine((url) => url.length <= DESTINATION_URL_MAX_LENGTH, {
    error: `Must be at most ${DESTINATION_URL_MAX_LENGTH} characters`,
  });

export const customCodeSchema = z.string().regex(CUSTOM_CODE_PATTERN, {
  error: `Must be ${CUSTOM_CODE_MIN_LENGTH} to ${CUSTOM_CODE_MAX_LENGTH} letters, digits, "_" or "-"`,
});

const titleSchema = z.string().trim().min(1).max(LINK_TITLE_MAX_LENGTH);
const timestampSchema = z.iso.datetime({ offset: true });

const AT_LEAST_ONE_FIELD = 'At least one field is required';
const hasDefinedField = (body: Record<string, unknown>): boolean =>
  Object.values(body).some((value) => value !== undefined);

export const createLinkRequestSchema = z.strictObject({
  destinationUrl: destinationUrlSchema,
  /** Defaults to the platform's short domain. */
  domainId: z.uuid().optional(),
  /** Generated when omitted. */
  code: customCodeSchema.optional(),
  title: titleSchema.optional(),
  expiresAt: timestampSchema.optional(),
});
export type CreateLinkRequest = z.infer<typeof createLinkRequestSchema>;

export const updateLinkRequestSchema = z
  .strictObject({
    destinationUrl: destinationUrlSchema.optional(),
    /** `null` removes the title. */
    title: titleSchema.nullable().optional(),
    /** `null` removes the expiry. */
    expiresAt: timestampSchema.nullable().optional(),
    status: editableLinkStatusSchema.optional(),
  })
  .refine(hasDefinedField, { error: AT_LEAST_ONE_FIELD });
export type UpdateLinkRequest = z.infer<typeof updateLinkRequestSchema>;

export const listLinksQuerySchema = z.object({
  /** Matches code, title, and destination, ignoring case. */
  search: z
    .string()
    .trim()
    .max(LINK_SEARCH_MAX_LENGTH)
    // An emptied search box means no search, not a malformed one.
    .transform((term) => (term === '' ? undefined : term))
    .optional(),
  status: linkStatusSchema.optional(),
  domainId: z.uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIST_LIMIT_MAX)
    .default(LIST_LIMIT_DEFAULT),
  cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});
export type ListLinksQuery = z.infer<typeof listLinksQuerySchema>;

export const linkSchema = z.object({
  id: z.uuid(),
  domain: z.object({ id: z.uuid(), hostname: z.string() }),
  code: z.string(),
  shortUrl: z.string(),
  destinationUrl: z.string(),
  title: z.string().nullable(),
  status: linkStatusSchema,
  expiresAt: timestampSchema.nullable(),
  /** The saved QR styling, or `null` for the defaults. */
  qrStyle: z.record(z.string(), z.unknown()).nullable(),
  clickCount: z.number().int().nonnegative(),
  /** Variants currently receiving traffic; archived ones are not counted. */
  variantCount: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type LinkResponse = z.infer<typeof linkSchema>;

export const linkListSchema = z.object({
  items: z.array(linkSchema),
  nextCursor: z.string().nullable(),
});
export type LinkListResponse = z.infer<typeof linkListSchema>;

const variantNameSchema = z.string().trim().min(1).max(VARIANT_NAME_MAX_LENGTH);
const variantWeightSchema = z
  .number()
  .int()
  .min(VARIANT_WEIGHT_MIN)
  .max(VARIANT_WEIGHT_MAX);

export const createVariantRequestSchema = z.strictObject({
  name: variantNameSchema,
  destinationUrl: destinationUrlSchema,
  /** Percent of the link's traffic. */
  weight: variantWeightSchema,
});
export type CreateVariantRequest = z.infer<typeof createVariantRequestSchema>;

export const updateVariantRequestSchema = z
  .strictObject({
    name: variantNameSchema.optional(),
    destinationUrl: destinationUrlSchema.optional(),
    weight: variantWeightSchema.optional(),
  })
  .refine(hasDefinedField, { error: AT_LEAST_ONE_FIELD });
export type UpdateVariantRequest = z.infer<typeof updateVariantRequestSchema>;

export const variantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  destinationUrl: z.string(),
  weight: z.number().int(),
  /** Set once the variant no longer receives traffic. */
  archivedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type VariantResponse = z.infer<typeof variantSchema>;

export const variantListSchema = z.object({
  items: z.array(variantSchema),
  nextCursor: z.string().nullable(),
});
export type VariantListResponse = z.infer<typeof variantListSchema>;
