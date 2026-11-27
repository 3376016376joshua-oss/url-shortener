import { customCodeSchema } from '@url-shortener/contracts/links';
import { describe, expect, it } from 'vitest';
import { isWellFormedShortCode } from '../common/link/short-code.js';
import { CodeGenerator } from './code-generator.js';

const SAMPLE_SIZE = 2_000;

describe('CodeGenerator', () => {
  const generator = new CodeGenerator();

  it('generates 7 Base62 characters', () => {
    for (let index = 0; index < SAMPLE_SIZE; index += 1) {
      expect(generator.generate()).toMatch(/^[0-9A-Za-z]{7}$/);
    }
  });

  it('does not repeat itself', () => {
    const codes = new Set(
      Array.from({ length: SAMPLE_SIZE }, () => generator.generate()),
    );

    expect(codes.size).toBe(SAMPLE_SIZE);
  });

  it('uses the whole alphabet', () => {
    const seen = new Set(
      Array.from({ length: SAMPLE_SIZE }, () => generator.generate()).join(''),
    );

    expect(seen.size).toBe(62);
  });
});

describe('the custom code schema of the contract', () => {
  it.each([
    'ab',
    'abc',
    'a'.repeat(32),
    'a'.repeat(33),
    'under_score',
    'da-sh',
    'sp ace',
    'dot.ted',
    'ünï',
    '',
  ])('agrees with the redirect path about %j', (code) => {
    expect(customCodeSchema.safeParse(code).success).toBe(
      isWellFormedShortCode(code),
    );
  });
});
