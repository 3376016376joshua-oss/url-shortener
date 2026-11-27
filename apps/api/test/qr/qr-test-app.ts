import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuditLog, type AuditEntry } from '../../src/audit/audit-log.js';
import {
  Metrics,
  type MetricLabels,
} from '../../src/common/metrics/metrics.js';
import { Link } from '../../src/database/entities/link.entity.js';
import type { Principal } from '../../src/identity/principal.js';
import { createTestApp } from '../support/create-test-app.js';
import { authenticatedAs, type WorkspaceFixture } from '../support/fixtures.js';

export interface QrTestApp {
  app: NestExpressApplication;
  /** Every audit entry recorded since the last `reset()`. */
  auditEntries: AuditEntry[];
  /** Every counter increment since the last `reset()`. */
  counters: Array<{ name: string; labels: MetricLabels | undefined }>;
  /** Who the next requests are made as; `null` for nobody. */
  signInAs(principal: Principal | null): void;
  /** Makes the audit log fail, to prove an unrecorded action is not a success. */
  failAudit(error: Error | null): void;
  reset(): void;
}

/** The whole application, with the audit log and metrics captured for inspection. */
export async function createQrTestApp(): Promise<QrTestApp> {
  let principal: Principal | null = null;
  let auditFailure: Error | null = null;
  const auditEntries: AuditEntry[] = [];
  const counters: QrTestApp['counters'] = [];

  const audit: AuditLog = {
    record: (entry) => {
      if (auditFailure !== null) {
        return Promise.reject(auditFailure);
      }
      auditEntries.push(entry);
      return Promise.resolve();
    },
  };
  const metrics: Metrics = {
    incrementCounter: (name, labels) => {
      counters.push({ name, labels });
    },
    setGauge: () => undefined,
  };

  const app = await createTestApp((builder) =>
    authenticatedAs(() => principal)(builder)
      .overrideProvider(AuditLog)
      .useValue(audit)
      .overrideProvider(Metrics)
      .useValue(metrics),
  );
  return {
    app,
    auditEntries,
    counters,
    signInAs: (next) => {
      principal = next;
    },
    failAudit: (error) => {
      auditFailure = error;
    },
    reset: () => {
      principal = null;
      auditFailure = null;
      auditEntries.length = 0;
      counters.length = 0;
    },
  };
}

/** Inserts a link directly: link management belongs to another module. */
export function createLink(
  app: NestExpressApplication,
  tenant: WorkspaceFixture,
  overrides: Partial<Link> = {},
): Promise<Link> {
  return app
    .get(DataSource)
    .getRepository(Link)
    .save({
      workspaceId: tenant.workspace.id,
      domainId: tenant.domain.id,
      code: 'abc1234',
      destinationUrl: 'https://example.com/landing',
      createdByUserId: tenant.user.id,
      ...overrides,
    });
}

export const qrPath = (workspaceId: string, linkId: string): string =>
  `/api/v1/workspaces/${workspaceId}/links/${linkId}/qr`;

export const qrStylePath = (workspaceId: string, linkId: string): string =>
  `/api/v1/workspaces/${workspaceId}/links/${linkId}/qr-style`;

/** A GET whose body is kept as the raw bytes the server sent. */
export function getBytes(
  app: NestExpressApplication,
  path: string,
): request.Test {
  return request(app.getHttpServer())
    .get(path)
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        callback(null, Buffer.concat(chunks));
      });
    });
}
