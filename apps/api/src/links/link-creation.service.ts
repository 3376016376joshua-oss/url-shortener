import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@url-shortener/contracts';
import type {
  CreateLinkRequest,
  LinkResponse,
} from '@url-shortener/contracts/links';
import { DataSource, IsNull } from 'typeorm';
import { ApiException } from '../common/errors/api-exception.js';
import { isReservedShortCode } from '../common/link/short-code.js';
import { CounterName, Metrics } from '../common/metrics/metrics.js';
import type { Env } from '../config/env.schema.js';
import { Domain, DomainStatus } from '../database/entities/domain.entity.js';
import {
  LINK_CODE_UNIQUE_CONSTRAINT,
  Link,
} from '../database/entities/link.entity.js';
import type { Principal } from '../identity/principal.js';
import { CodeGenerator } from './code-generator.js';
import { DestinationRiskCheck } from './destination-risk-check.js';
import { destinationHost } from './destination-policy.js';
import { LinkChangePublisher, actorOf } from './link-change-publisher.js';
import { LinkPresenter } from './link-presenter.js';
import { isUniqueViolation } from './unique-violation.js';

/** Attempts at inserting a generated code before giving up with a 503. */
export const CODE_GENERATION_ATTEMPTS = 5;

type NewLink = Pick<
  Link,
  | 'workspaceId'
  | 'domainId'
  | 'destinationUrl'
  | 'title'
  | 'expiresAt'
  | 'createdByUserId'
>;

/** Creates links: domain rules, code allocation, and the risk check. */
@Injectable()
export class LinkCreationService {
  private readonly platformHostname: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly dataSource: DataSource,
    private readonly codes: CodeGenerator,
    private readonly riskCheck: DestinationRiskCheck,
    private readonly presenter: LinkPresenter,
    private readonly publisher: LinkChangePublisher,
    private readonly metrics: Metrics,
  ) {
    this.platformHostname = config.get('DEFAULT_SHORT_DOMAIN', { infer: true });
  }

  async create(
    workspaceId: string,
    request: CreateLinkRequest,
    principal: Principal,
  ): Promise<LinkResponse> {
    if (request.code !== undefined && isReservedShortCode(request.code)) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.CodeReserved,
        `The code "${request.code}" is reserved`,
      );
    }
    const domain = await this.resolveDomain(workspaceId, request.domainId);
    await this.riskCheck.assertAllowed(request.destinationUrl);

    const values: NewLink = {
      workspaceId,
      domainId: domain.id,
      destinationUrl: request.destinationUrl,
      title: request.title ?? null,
      expiresAt:
        request.expiresAt === undefined ? null : new Date(request.expiresAt),
      createdByUserId: principal.userId,
    };
    const kind = request.code === undefined ? 'generated' : 'custom';
    const link =
      request.code === undefined
        ? await this.insertWithGeneratedCode(values)
        : await this.insertWithCustomCode(values, request.code);

    this.metrics.incrementCounter(CounterName.LinksCreated, { kind });
    await this.publisher.publish(link, {
      actor: actorOf(principal),
      action: 'link.created',
      target: { type: 'link', id: link.id },
      metadata: {
        code: link.code,
        domainId: domain.id,
        destinationHost: destinationHost(link.destinationUrl),
        kind,
      },
    });
    return this.presenter.presentOne(link);
  }

  /** The named domain, or the platform's; it must be the workspace's to use. */
  private async resolveDomain(
    workspaceId: string,
    domainId: string | undefined,
  ): Promise<Domain> {
    const domains = this.dataSource.getRepository(Domain);
    if (domainId === undefined) {
      const platformDomain = await domains.findOneBy({
        hostname: this.platformHostname,
        workspaceId: IsNull(),
      });
      if (platformDomain === null) {
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          ErrorCode.ServiceUnavailable,
          'The platform short domain is not set up yet',
        );
      }
      return this.requireActive(platformDomain);
    }
    const domain = await domains.findOneBy({ id: domainId });
    // Another workspace's domain is reported exactly like one that is absent.
    if (
      domain === null ||
      (domain.workspaceId !== null && domain.workspaceId !== workspaceId)
    ) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NotFound,
        'Domain not found',
      );
    }
    return this.requireActive(domain);
  }

  private requireActive(domain: Domain): Domain {
    if (domain.status !== DomainStatus.Active) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.DomainNotVerified,
        `The domain ${domain.hostname} is not active, so it cannot serve links yet`,
      );
    }
    return domain;
  }

  private async insertWithCustomCode(
    values: NewLink,
    code: string,
  ): Promise<Link> {
    try {
      return await this.insert(values, code);
    } catch (error) {
      if (isUniqueViolation(error, LINK_CODE_UNIQUE_CONSTRAINT)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.CodeTaken,
          `The code "${code}" is already in use on this domain`,
        );
      }
      throw error;
    }
  }

  /**
   * The unique constraint is the only arbiter of whether a code is free, so
   * a collision is found by inserting, and answered by trying another code.
   */
  private async insertWithGeneratedCode(values: NewLink): Promise<Link> {
    for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        return await this.insert(values, this.nextUnreservedCode());
      } catch (error) {
        if (!isUniqueViolation(error, LINK_CODE_UNIQUE_CONSTRAINT)) {
          throw error;
        }
        this.metrics.incrementCounter(CounterName.ShortCodeCollisions);
      }
    }
    throw new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.CodeGenerationExhausted,
      'No unique short code could be allocated; try again',
    );
  }

  /** A reserved word is 3 in 3.5 trillion codes, and is simply drawn again. */
  private nextUnreservedCode(): string {
    let code = this.codes.generate();
    while (isReservedShortCode(code)) {
      code = this.codes.generate();
    }
    return code;
  }

  private insert(values: NewLink, code: string): Promise<Link> {
    const links = this.dataSource.getRepository(Link);
    return links.save(links.create({ ...values, code }));
  }
}
