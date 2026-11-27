import { describe, expect, it } from 'vitest';
import { buildWorkspaceSlug } from './workspace-provisioning.js';

const SLUG_MAX_LENGTH = 48;

describe('buildWorkspaceSlug', () => {
  it.each([
    ["Ada Lovelace's workspace", 'ada-lovelace-s-workspace-x1y2z3a4'],
    ['  Marketing & Growth  ', 'marketing-growth-x1y2z3a4'],
    ['Café Zürich', 'cafe-zurich-x1y2z3a4'],
    ['日本語', 'workspace-x1y2z3a4'],
    ['---', 'workspace-x1y2z3a4'],
  ])('turns %j into %j', (name, expected) => {
    expect(buildWorkspaceSlug(name, 'x1y2z3a4')).toBe(expected);
  });

  it('fits the longest name into the column', () => {
    const slug = buildWorkspaceSlug('a'.repeat(100), 'x1y2z3a4');

    expect(slug).toHaveLength(SLUG_MAX_LENGTH);
    expect(slug).toMatch(/^a{39}-x1y2z3a4$/);
  });

  it('never ends the readable part with a hyphen after cutting', () => {
    const slug = buildWorkspaceSlug(`${'a'.repeat(38)} bcd`, 'x1y2z3a4');

    expect(slug).toBe(`${'a'.repeat(38)}-x1y2z3a4`);
  });
});
