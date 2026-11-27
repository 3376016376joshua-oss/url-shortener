import { describe, expect, it } from 'vitest';
import { apiErrorBodySchema } from './errors.js';

const BODY = {
  statusCode: 409,
  error: 'Conflict',
  code: 'CODE_TAKEN',
  message: 'The code "launch" is already in use on this domain',
};

describe('apiErrorBodySchema', () => {
  it('accepts the documented error body', () => {
    expect(apiErrorBodySchema.parse(BODY)).toEqual(BODY);
  });

  it('rejects a code the API does not define', () => {
    const result = apiErrorBodySchema.safeParse({ ...BODY, code: 'NOPE' });

    expect(result.success).toBe(false);
  });
});
