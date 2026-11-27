import { z } from 'zod';

/** Machine-readable error codes: the `code` field of every API error body. */
export const ErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  LinkNotFound: 'LINK_NOT_FOUND',
  LinkDisabled: 'LINK_DISABLED',
  LinkExpired: 'LINK_EXPIRED',
  CodeTaken: 'CODE_TAKEN',
  CodeReserved: 'CODE_RESERVED',
  DestinationBlocked: 'DESTINATION_BLOCKED',
  DomainNotVerified: 'DOMAIN_NOT_VERIFIED',
  QuotaExceeded: 'QUOTA_EXCEEDED',
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  RateLimited: 'RATE_LIMITED',
  RequestRejected: 'REQUEST_REJECTED',
  InternalError: 'INTERNAL_ERROR',
  CodeGenerationExhausted: 'CODE_GENERATION_EXHAUSTED',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The body of every failed API response. */
export const apiErrorBodySchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  code: z.enum(ErrorCode),
  message: z.string(),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
