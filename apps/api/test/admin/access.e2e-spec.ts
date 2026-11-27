import { describe, expect, it } from 'vitest';
import { UNKNOWN_ID, setUpAdminSuite } from './admin-suite.js';

describe('platform admin access', () => {
  const suite = setUpAdminSuite();

  const routes = [
    `/links/${UNKNOWN_ID}/block`,
    `/links/${UNKNOWN_ID}/unblock`,
    `/domains/${UNKNOWN_ID}/block`,
    `/domains/${UNKNOWN_ID}/unblock`,
    `/users/${UNKNOWN_ID}/disable`,
    `/users/${UNKNOWN_ID}/enable`,
  ];

  it.each(routes)('answers 401 on %s to nobody', async (route) => {
    suite.caller = null;

    const response = await suite.post(route);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it.each(routes)('answers 403 on %s to a workspace owner', async (route) => {
    suite.caller = suite.tenant.principal;

    const response = await suite.post(route);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses an API key, which acts for a workspace and not the operator', async () => {
    suite.caller = {
      ...suite.admin,
      kind: 'api_key',
      userId: null,
      apiKeyId: UNKNOWN_ID,
    };

    const response = await suite.post(`/links/${UNKNOWN_ID}/block`);

    expect(response.status).toBe(403);
  });

  it.each(routes)('answers 404 on %s for an unknown id', async (route) => {
    const response = await suite.post(route);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await suite.post('/links/not-a-uuid/block');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
