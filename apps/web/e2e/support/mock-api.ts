import type { Page, Route } from '@playwright/test';
import type { ApiErrorBody, ErrorCode } from '@url-shortener/contracts';
import type { Session } from '../../src/api/session.js';

const API_PREFIX = '/api/v1';

/** The session the mock API starts with: an owner of Acme, a member of Globex. */
export const DEFAULT_SESSION: Session = {
  user: { id: 'user-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  workspaces: [
    { id: 'ws-acme', name: 'Acme', role: 'owner' },
    { id: 'ws-globex', name: 'Globex', role: 'member' },
  ],
};

export interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type MockHandler = () => MockResponse;

export function json(body: unknown, status = 200): MockResponse {
  return { status, body };
}

export function apiError(
  status: number,
  code: ErrorCode,
  message: string,
): MockResponse {
  const body: ApiErrorBody = {
    statusCode: status,
    error: 'Error',
    code,
    message,
  };
  return { status, body, headers: { 'X-Request-Id': 'req-mock-1' } };
}

/**
 * Stands in for the API in the shell's own browser tests. It answers the
 * endpoints a test declares; a request to any other endpoint is answered
 * `404` and recorded in `unexpected`, which fails the test afterwards.
 */
export class MockApi {
  /** Requests received, as `METHOD /path`, in order. */
  readonly requests: string[] = [];
  readonly unexpected: string[] = [];
  private readonly handlers = new Map<string, MockHandler>();

  constructor(private readonly page: Page) {
    this.signedIn();
  }

  async start(): Promise<void> {
    await this.page.route(`**${API_PREFIX}/**`, (route) => this.answer(route));
  }

  /** Answers `endpoint`, written as `METHOD /path` under the API base. */
  on(endpoint: string, handler: MockHandler): void {
    this.handlers.set(endpoint, handler);
  }

  signedIn(session: Session = DEFAULT_SESSION): void {
    this.on('GET /me', () => json(session));
  }

  signedOut(): void {
    this.on('GET /me', () =>
      apiError(401, 'UNAUTHENTICATED', 'Sign in to continue'),
    );
  }

  private async answer(route: Route): Promise<void> {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(API_PREFIX.length);
    const endpoint = `${request.method()} ${path}`;
    this.requests.push(endpoint);
    const handler = this.handlers.get(endpoint);
    if (handler === undefined) {
      this.unexpected.push(endpoint);
    }
    const response =
      handler?.() ?? apiError(404, 'NOT_FOUND', `No mock for ${endpoint}`);
    await route.fulfill({
      status: response.status,
      headers: response.headers,
      ...(response.body === undefined ? {} : { json: response.body }),
    });
  }
}
