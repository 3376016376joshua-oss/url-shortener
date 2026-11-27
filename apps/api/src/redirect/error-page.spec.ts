import { describe, expect, it } from 'vitest';
import { renderErrorPage } from './error-page.js';
import { describeFailure, type RedirectFailure } from './redirect-failure.js';

describe('describeFailure', () => {
  it.each([
    [{ outcome: 'not_found' }, 404, 'LINK_NOT_FOUND'],
    [{ outcome: 'gone', reason: 'expired' }, 410, 'LINK_EXPIRED'],
    [{ outcome: 'gone', reason: 'disabled' }, 410, 'LINK_DISABLED'],
  ] as const)('reports %j as %i %s', (result, status, code) => {
    expect(describeFailure(result)).toMatchObject({ status, code });
  });
});

describe('renderErrorPage', () => {
  const failure = describeFailure({ outcome: 'gone', reason: 'expired' });

  it('is a complete page that names the failure', () => {
    const page = renderErrorPage(failure);

    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('<html lang="en">');
    expect(page).toContain('<title>This link has expired</title>');
    expect(page).toContain('<p class="status">410</p>');
    expect(page).toContain('<h1>This link has expired</h1>');
    expect(page).toContain(failure.advice);
  });

  it('fits a phone, and stays out of search results', () => {
    const page = renderErrorPage(failure);

    expect(page).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    expect(page).toContain('<meta name="robots" content="noindex">');
  });

  it('loads and runs nothing', () => {
    const page = renderErrorPage(failure);

    expect(page).not.toMatch(/<script|<link|<img|src=|href=|url\(/i);
  });

  it('escapes its text', () => {
    const hostile: RedirectFailure = {
      ...failure,
      title: '<script>alert("x")</script>',
      advice: `Tom & Jerry's`,
    };

    const page = renderErrorPage(hostile);

    expect(page).not.toContain('<script>');
    expect(page).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(page).toContain('Tom &amp; Jerry&#39;s');
  });
});
