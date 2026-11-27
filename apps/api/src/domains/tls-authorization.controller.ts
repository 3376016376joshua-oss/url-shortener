import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { MAX_HOSTNAME_LENGTH } from '@url-shortener/contracts/domains';
import { z } from 'zod';
import { ApiException } from '../common/errors/api-exception.js';
import { TlsAuthorizationService } from './tls-authorization.service.js';

/** The question as Caddy's on-demand TLS asks it: `?domain=<host>`. */
const authorizeQuerySchema = z.object({
  domain: z.string().min(1).max(MAX_HOSTNAME_LENGTH),
});
type AuthorizeQuery = z.infer<typeof authorizeQuerySchema>;

/**
 * The edge's question before it obtains a certificate (PRD section 8). On the
 * internal network only: the edge refuses `/internal` from outside.
 */
@Controller('internal/tls')
export class TlsAuthorizationController {
  constructor(private readonly authorization: TlsAuthorizationService) {}

  /** `200` means yes; anything else means no certificate. */
  @Get('authorize')
  async authorize(
    @Query({ schema: authorizeQuerySchema }) query: AuthorizeQuery,
  ): Promise<void> {
    if (!(await this.authorization.isAuthorized(query.domain))) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NotFound,
        'No active domain with that host name',
      );
    }
  }
}
