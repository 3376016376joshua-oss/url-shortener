import type { RedirectFailure } from './redirect-failure.js';

/**
 * The page is one self-contained document: it loads nothing, runs nothing,
 * and can be embedded nowhere. Only its own inline style is allowed.
 */
export const ERROR_PAGE_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const STYLE = `
  *, *::before, *::after { box-sizing: border-box; }
  html { height: 100%; -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    min-height: 100%;
    display: grid;
    place-items: center;
    padding: 24px;
    background: #f6f7f9;
    color: #1a1f29;
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  main {
    width: 100%;
    max-width: 440px;
    padding: 40px 32px;
    background: #ffffff;
    border: 1px solid #e3e6eb;
    border-radius: 12px;
    text-align: center;
  }
  .status {
    margin: 0 0 12px;
    color: #5b6472;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.08em;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 24px;
    line-height: 1.25;
    font-weight: 650;
    text-wrap: balance;
  }
  .advice {
    margin: 0;
    color: #4a5361;
    text-wrap: pretty;
  }
`;

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? '');
}

/**
 * The small page a browser gets instead of a redirect (PRD RD-11). It never
 * includes anything from the request, so there is nothing to inject into it.
 */
export function renderErrorPage(failure: RedirectFailure): string {
  const title = escapeHtml(failure.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<p class="status">${failure.status}</p>
<h1>${title}</h1>
<p class="advice">${escapeHtml(failure.advice)}</p>
</main>
</body>
</html>
`;
}
