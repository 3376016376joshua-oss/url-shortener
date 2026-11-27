import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, type ReadinessReport } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up. Touches no dependency. */
  @Get()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: Postgres and Redis are both reachable. */
  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const report = await this.health.checkReadiness();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
