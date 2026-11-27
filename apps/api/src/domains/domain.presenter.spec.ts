import { describe, expect, it } from 'vitest';
import { Domain, DomainStatus } from '../database/entities/domain.entity.js';
import { toDomainResponse } from './domain.presenter.js';

const CNAME_TARGET = 'cname.sho.rt';

const domain = (values: Partial<Domain>): Domain =>
  Object.assign(new Domain(), {
    id: '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a',
    workspaceId: '0193d2a0-0000-7c11-8e22-1f0e9d8c7b6a',
    hostname: 'go.brand.com',
    status: DomainStatus.Pending,
    verificationToken: 'sv_4f9c2e7a',
    verifiedAt: null,
    lastCheckedAt: new Date('2026-11-27T08:01:00.000Z'),
    failedChecks: 0,
    ownershipVerified: true,
    routingVerified: false,
    createdAt: new Date('2026-11-27T08:00:00.000Z'),
    updatedAt: new Date('2026-11-27T08:01:00.000Z'),
    ...values,
  });

describe('toDomainResponse', () => {
  it('presents a custom domain with the records to publish', () => {
    expect(toDomainResponse(domain({}), CNAME_TARGET)).toEqual({
      id: '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a',
      hostname: 'go.brand.com',
      status: 'PENDING',
      isPlatformDomain: false,
      dnsRecords: [
        {
          type: 'TXT',
          name: '_shortener-challenge.go.brand.com',
          value: 'sv_4f9c2e7a',
          verified: true,
        },
        {
          type: 'CNAME',
          name: 'go.brand.com',
          value: 'cname.sho.rt',
          verified: false,
        },
      ],
      verifiedAt: null,
      lastCheckedAt: '2026-11-27T08:01:00.000Z',
      createdAt: '2026-11-27T08:00:00.000Z',
    });
  });

  it('presents a platform domain without records or its token', () => {
    const response = toDomainResponse(
      domain({
        workspaceId: null,
        hostname: 'sho.rt',
        status: DomainStatus.Active,
        verifiedAt: new Date('2026-11-27T08:00:00.000Z'),
        lastCheckedAt: null,
      }),
      CNAME_TARGET,
    );

    expect(response).toMatchObject({
      hostname: 'sho.rt',
      status: 'ACTIVE',
      isPlatformDomain: true,
      dnsRecords: [],
      verifiedAt: '2026-11-27T08:00:00.000Z',
      lastCheckedAt: null,
    });
    expect(JSON.stringify(response)).not.toContain('sv_4f9c2e7a');
  });
});
