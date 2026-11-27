import { describe, expect, it } from 'vitest';
import { mayRemoveMember } from './member-rules.js';

describe('mayRemoveMember', () => {
  it.each([
    ['owner', 'owner', true],
    ['owner', 'admin', true],
    ['owner', 'member', true],
    ['admin', 'owner', false],
    ['admin', 'admin', false],
    ['admin', 'member', true],
    ['member', 'owner', false],
    ['member', 'admin', false],
    ['member', 'member', false],
  ] as const)('a %s removing a %s: %s', (actor, target, allowed) => {
    expect(mayRemoveMember(actor, target)).toBe(allowed);
  });
});
