import { describe, expect, it } from 'vitest';
import { createValidationException } from './validation-exception.factory.js';

describe('createValidationException', () => {
  it('answers 400 VALIDATION_FAILED', () => {
    const exception = createValidationException([{ message: 'Invalid input' }]);

    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      code: 'VALIDATION_FAILED',
      message: 'Invalid input',
    });
  });

  it('prefixes each message with the path of the invalid property', () => {
    const exception = createValidationException([
      { message: 'Invalid URL', path: ['longUrl'] },
      { message: 'Too short', path: ['tags', 0, { key: 'name' }] },
    ]);

    expect(exception.getResponse()).toMatchObject({
      message: 'longUrl: Invalid URL; tags.0.name: Too short',
    });
  });
});
