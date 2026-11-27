/** Machine-readable error codes: the `code` field of every API error body. */
export const ErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  LinkNotFound: 'LINK_NOT_FOUND',
  AliasTaken: 'ALIAS_TAKEN',
  LinkDisabled: 'LINK_DISABLED',
  LinkExpired: 'LINK_EXPIRED',
  DestinationBlocked: 'DESTINATION_BLOCKED',
  AliasReserved: 'ALIAS_RESERVED',
  ExpiryOutOfPolicy: 'EXPIRY_OUT_OF_POLICY',
  RateLimited: 'RATE_LIMITED',
  CodeGenerationExhausted: 'CODE_GENERATION_EXHAUSTED',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
